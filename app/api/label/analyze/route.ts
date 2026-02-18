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
        const files = formData.getAll("files") as File[];
        const types = formData.getAll("types") as string[];

        if (!files.length) {
            return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
        }

        // Prepare all images for Gemini
        const imageParts = await Promise.all(
            files.map(async (file) => {
                const arrayBuffer = await file.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString("base64");
                return {
                    inlineData: {
                        data: base64Data,
                        mimeType: file.type,
                    },
                };
            })
        );

        // Fetch ALL existing ingredients for matching
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: existingIngredients } = await supabase
            .from("ingredients")
            .select("id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium, raw_materials, allergens, origin, manufacturer, product_description, nutrition_per");

        const existingNames = (existingIngredients || []).map((i) => ({
            id: i.id,
            name: i.name,
            unit_quantity: i.unit_quantity,
        }));

        // Build type context
        const typeDescriptions = types.map((t, i) => {
            const labels: Record<string, string> = {
                front_label: "表ラベル（商品名・ブランド名・内容量などが記載）",
                ingredients_label: "裏ラベル/原材料表示（原材料名一覧、アレルギー物質、原産国、製造者情報）",
                nutrition_label: "栄養成分表示（カロリー、たんぱく質、脂質、炭水化物、食塩相当量、ナトリウム等）",
            };
            return `画像${i + 1}: ${labels[t] || t}`;
        }).join("\n");

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
あなたは食品表示の専門家です。提供された食品ラベルの画像を解析し、情報を正確に抽出してください。
さらに、既存のデータベースと照合し、更新すべき候補を提案してください。

【画像の種類】
${typeDescriptions}

【既存データベースの食材リスト（照合用）】
${JSON.stringify(existingNames)}

【抽出ルール】
1. **表ラベル（front_label）から抽出する情報**:
   - product_description: 商品名・ブランド名・キャッチコピーなど表面に記載の情報
   - unit_quantity: 内容量（グラム数。数値のみ。例: 1000。mlの場合もgに換算せずそのまま数値で）
   - manufacturer: メーカー名（表面に記載がある場合）

2. **原材料表示（ingredients_label）から抽出する情報**:
   - raw_materials: 原材料名の全文（「/」以降の添加物も含めてそのまま転記）
   - allergens: アレルギー表示（「一部に○○を含む」など）
   - origin: 原産国・産地情報
   - manufacturer: 製造者・販売者の名称と住所

3. **栄養成分表示（nutrition_label）から抽出する情報**:
   - nutrition_per: 基準量（例: "100gあたり", "1食(80g)あたり"）
   - calories: エネルギー（kcal、数値のみ）
   - protein: たんぱく質（g、数値のみ）
   - fat: 脂質（g、数値のみ）
   - carbohydrate: 炭水化物（g、数値のみ）
   - sodium: 食塩相当量（g、数値のみ）

【DB照合ルール】
- ラベルから読み取った商品名と、既存データベースの name を比較してください
- 同一商品と思われるもの、または類似商品を候補として返してください（最大5件）
- 名称の揺らぎ（略称、メーカー名の有無、容量違い等）も考慮してください
- 完全一致がなくても、部分一致や類似名があれば候補に含めてください

【重要な注意事項】
- 画像が不鮮明な場合でも、文脈から推測して最善の結果を返してください
- 読み取れない項目は null としてください
- 栄養成分の数値は全て数値型で返してください（単位は含めない）
- 原材料表示は省略せず、ラベルに記載されている通りに全文を転記してください

【出力形式】
以下の形式の純粋なJSON（1つのオブジェクト）のみで返してください。
{
  "extracted": {
    "name": "商品名（ラベルから読み取った正式名称）",
    "product_description": "商品説明",
    "unit_quantity": 1000,
    "raw_materials": "原材料名の全文",
    "allergens": "アレルギー表示",
    "origin": "原産国",
    "manufacturer": "製造者情報",
    "nutrition_per": "100gあたり",
    "calories": 350,
    "protein": 10.5,
    "fat": 5.2,
    "carbohydrate": 60.3,
    "sodium": 2.03
  },
  "candidates": [
    {
      "id": "UUID",
      "name": "DB内の名称",
      "confidence": 0.95,
      "reason": "照合理由（例：商品名が一致、容量違いの同一商品）"
    }
  ]
}

candidatesは該当なしの場合は空配列[]としてください。
`;

        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        let text = response.text();

        // Clean up markdown code blocks
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const parsed = JSON.parse(text);

            // Enrich candidates with full DB data
            const enrichedCandidates = (parsed.candidates || []).map((c: any) => {
                const dbItem = (existingIngredients || []).find((i) => i.id === c.id);
                return {
                    ...c,
                    current_data: dbItem || null,
                };
            });

            return NextResponse.json({
                extracted: parsed.extracted || parsed,
                candidates: enrichedCandidates,
            });
        } catch (parseError) {
            console.error("JSON Parse Error:", text);
            return NextResponse.json(
                { error: "AI応答の解析に失敗しました", raw: text },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error("Label Analysis Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
