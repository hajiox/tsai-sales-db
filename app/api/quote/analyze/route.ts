import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY || "";

const genAI = new GoogleGenerativeAI(geminiApiKey);

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "File is required" }, { status: 400 });
        }

        // 1. Fetch existing names from DB for fuzzy matching
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const [ingredientsRes, materialsRes] = await Promise.all([
            supabase.from("ingredients").select("id, name, price"),
            supabase.from("materials").select("id, name, price")
        ]);

        const existingItems = [
            ...(ingredientsRes.data || []).map(i => ({ ...i, type: 'ingredient' })),
            ...(materialsRes.data || []).map(m => ({ ...m, type: 'material' }))
        ];

        // 2. Prepare file for Gemini
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = file.type;

        // 3. Prompt Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
あなたは財務・購買管理の専門家です。提供された「見積書」の画像またはPDFを解析し、商品の名称と価格（単価）を正確に抽出してください。
※重要：画像がFAXのスキャンデータなどでノイズが多い、または文字が潰れている可能性があります。前後の文脈や、既存データベースの名称リストを参考に、正解と思われる名称を推測・復元してください。

さらに、抽出した商品を以下の既存データベース内の項目と照合（名寄せ）し、価格の更新が必要かどうかを判断してください。

【既存データベース項目リスト】
${JSON.stringify(existingItems)}

【解析と照合のルール】
1. 見積書に記載されている各行（アイテム）について：
   - 商品名と単価を抽出してください。
   - 既存リストに似た名前のものがあれば、その ID を紐付けてください。名称の揺らぎ（例：「キャベツ」と「ｷｬﾍﾞﾂ」、「A社 砂糖」と「ｻﾄｳ」など）や、FAX特有の誤字（「1」が「I」に見える等）を賢く補正してください。
   - 既存リストに該当するものがない、または全く新しい商品の場合は、新規作成(create)として提案してください。
   - 「食材」か「資材」かの判別を行ってください。調味料、生鮮品、加工食品などは「食材」、容器、ラベル、テープ、梱包材などは「資材」です。

2. 出力は必ず以下の形式の純粋な JSON 配列のみで返してください。余計な説明文は一切含めないでください。
[
  {
    "original_name": "見積書から抽出・推測された名称",
    "extracted_price": 1000,
    "matched_id": "DB内のUUIDまたはnull",
    "matched_name": "DB内の現在の名称またはnull",
    "current_price": 950,
    "suggestion_type": "update" | "create" | "ignore",
    "category": "ingredient" | "material",
    "confidence": 0.95,
    "reason": "照合の理由（例：名称の揺らぎを補正して合致、新商品と判断など）"
  }
]
`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            }
        ]);

        const response = await result.response;
        let text = response.text();

        // JSONのパース（Markdownのコードブロックが含まれる場合を考慮）
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const suggestions = JSON.parse(text);
            return NextResponse.json({ suggestions });
        } catch (parseError) {
            console.error("JSON Parse Error:", text);
            return NextResponse.json({ error: "Failed to parse AI response", raw: text }, { status: 500 });
        }

    } catch (error: any) {
        console.error("Analysis Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
