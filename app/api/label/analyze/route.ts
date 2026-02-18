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
        const types = formData.getAll("types") as string[]; // "front_label" | "ingredients_label" | "nutrition_label"
        const targetId = formData.get("target_id") as string | null;
        const targetName = formData.get("target_name") as string | null;

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

        // Build type context
        const typeDescriptions = types.map((t, i) => {
            const labels: Record<string, string> = {
                front_label: "表ラベル（商品名・ブランド名・内容量などが記載）",
                ingredients_label: "裏ラベル/原材料表示（原材料名一覧、アレルギー物質、原産国、製造者情報）",
                nutrition_label: "栄養成分表示（カロリー、たんぱく質、脂質、炭水化物、食塩相当量、ナトリウム等）",
            };
            return `画像${i + 1}: ${labels[t] || t}`;
        }).join("\n");

        // Fetch existing item data if target_id is provided
        let existingData = null;
        if (targetId) {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const { data } = await supabase
                .from("ingredients")
                .select("*")
                .eq("id", targetId)
                .single();
            existingData = data;
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
あなたは食品表示の専門家です。提供された食品ラベルの画像を解析し、情報を正確に抽出してください。

【画像の種類】
${typeDescriptions}

${targetName ? `【対象商品】\n商品名: ${targetName}` : ""}
${existingData ? `\n【既存DBデータ（参考）】\n${JSON.stringify(existingData, null, 2)}` : ""}

【抽出ルール】
1. **表ラベル（front_label）から抽出する情報**:
   - product_description: 商品名・ブランド名・キャッチコピーなど表面に記載の情報
   - unit_quantity: 内容量（グラム数。数値のみ。例: 1000）
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
   - sodium: ナトリウム（mg、数値のみ。食塩相当量(g)から計算する場合: 食塩g × 393.4 = ナトリウムmg）
   - salt: 食塩相当量（g、数値のみ）

【重要な注意事項】
- 画像が不鮮明な場合でも、文脈から推測して最善の結果を返してください
- 読み取れない項目は null としてください
- 栄養成分の数値は全て数値型で返してください（単位は含めない）
- 原材料表示は省略せず、ラベルに記載されている通りに全文を転記してください

【出力形式】
以下の形式の純粋なJSON（1つのオブジェクト）のみで返してください。解析できた項目のみ含めてください。
{
  "product_description": "商品名・説明",
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
  "sodium": 800,
  "salt": 2.03,
  "name": "商品名（表ラベルから読み取れた場合）"
}
`;

        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        let text = response.text();

        // Clean up markdown code blocks
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const extracted = JSON.parse(text);
            return NextResponse.json({ extracted, raw: text });
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
