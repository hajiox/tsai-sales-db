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
            supabase.from("ingredients").select("id, name, price, tax_included"),
            supabase.from("materials").select("id, name, price, tax_included")
        ]);

        const existingItems = [
            ...(ingredientsRes.data || []).map(i => ({ ...i, type: 'ingredient', db_tax_included: i.tax_included })),
            ...(materialsRes.data || []).map(m => ({ ...m, type: 'material', db_tax_included: m.tax_included }))
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

【既存データベース項目リスト】
${JSON.stringify(existingItems)}

【税金に関する重要な指示】
1. 見積書の価格は原則として「税抜き（税別）」で表示されています。
2. データベース側（db_tax_included）が true の場合、その項目の保管価格は「税込み」です。
3. 比較および更新案を作成する際は、必ず同じ基準で比較してください。
   - 食材（ingredient）の税率は 8%、資材（material）の税率は 10% とします。
   - DBが「税込み」設定（db_tax_included: true）の場合、見積書の税抜き価格に税を加えてから DB価格と比較し、「更新後の税込み価格」を算出してください。
   - DBが「税抜き」設定（db_tax_included: false）の場合、そのまま見積書の価格と比較してください。

【解析と照合のルール】
1. 見積書に記載されている各行（アイテム）について：
   - 商品名と単価（税抜き）を抽出してください。
   - 既存リストに似た名称のものがあれば、その ID を紐付けてください。名称の揺らぎやFAX特有の誤字を補正してください。
   - 既存リストに該当するものがない、または全く新しい商品の場合は、新規作成(create)として提案してください。

2. 出力は必ず以下の形式の純粋な JSON 配列のみで返してください。
[
  {
    "original_name": "見積書から抽出された名称",
    "extracted_tax_exclusive_price": 1000,
    "final_suggestion_price": 1080, // DB設定が税込みなら1080、税抜きなら1000
    "matched_id": "UUID または null",
    "matched_name": "DB内の名称",
    "current_db_price": 950, // DBの現在の値
    "is_db_tax_included": true,
    "suggestion_type": "update" | "create" | "ignore",
    "category": "ingredient" | "material",
    "confidence": 0.95,
    "reason": "照合と価格算出の理由（例：DBが税込のため8%加算して比較）"
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
