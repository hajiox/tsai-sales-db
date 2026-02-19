// /api/recipe/generate-label/route.ts
// AI原材料表示生成API (Gemini 2.0 Flash)

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY || "";

const genAI = new GoogleGenerativeAI(geminiApiKey);

export async function POST(request: Request) {
    try {
        const { recipeId } = await request.json();
        if (!recipeId) {
            return NextResponse.json({ error: "recipeId が必要です" }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. レシピ情報を取得
        const { data: recipe, error: recipeError } = await supabase
            .from("recipes")
            .select("id, name, category, filling_quantity, label_quantity")
            .eq("id", recipeId)
            .single();

        if (recipeError || !recipe) {
            return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });
        }

        // 2. レシピのアイテムを取得（使用量の多い順）
        const { data: recipeItems } = await supabase
            .from("recipe_items")
            .select("item_name, item_type, usage_amount, cost, unit_quantity, unit_price")
            .eq("recipe_id", recipeId)
            .order("cost", { ascending: false });

        if (!recipeItems || recipeItems.length === 0) {
            return NextResponse.json({ error: "レシピにアイテムがありません" }, { status: 400 });
        }

        // 3. 食材マスターから raw_materials を取得
        const ingredientNames = recipeItems
            .filter(i => ["ingredient", "intermediate"].includes(i.item_type))
            .map(i => i.item_name);

        const { data: ingredientMaster } = await supabase
            .from("ingredients")
            .select("name, raw_materials, allergens")
            .in("name", ingredientNames);

        const ingredientMap: Record<string, { raw_materials: string | null; allergens: string | null }> = {};
        (ingredientMaster || []).forEach(i => {
            ingredientMap[i.name] = { raw_materials: i.raw_materials, allergens: i.allergens };
        });

        // 4. 中間部品（【P】）のレシピからサブ食材を取得
        const intermediateItems = recipeItems.filter(i => i.item_type === "intermediate");
        const intermediateData: Record<string, any[]> = {};

        if (intermediateItems.length > 0) {
            // 中間部品のレシピを検索
            const intNames = intermediateItems.map(i => i.item_name.replace("【P】", ""));
            const { data: intRecipes } = await supabase
                .from("recipes")
                .select("id, name")
                .eq("is_intermediate", true)
                .in("name", intNames);

            if (intRecipes) {
                for (const intRecipe of intRecipes) {
                    const { data: subItems } = await supabase
                        .from("recipe_items")
                        .select("item_name, item_type, usage_amount, cost")
                        .eq("recipe_id", intRecipe.id)
                        .order("cost", { ascending: false });

                    if (subItems) {
                        intermediateData[intRecipe.name] = subItems;
                        // その中のsub ingredientsのraw_materialsも取得
                        const subIngNames = subItems
                            .filter(si => si.item_type === "ingredient")
                            .map(si => si.item_name);
                        const { data: subMaster } = await supabase
                            .from("ingredients")
                            .select("name, raw_materials, allergens")
                            .in("name", subIngNames);
                        (subMaster || []).forEach(m => {
                            if (!ingredientMap[m.name]) {
                                ingredientMap[m.name] = { raw_materials: m.raw_materials, allergens: m.allergens };
                            }
                        });
                    }
                }
            }
        }

        // 5. 不足データチェック
        const missingData: string[] = [];
        for (const item of recipeItems) {
            if (item.item_type === "material" || item.item_type === "expense") continue;
            const master = ingredientMap[item.item_name];
            // 複合原材料と推定されるものでraw_materialsがない場合
            const isLikelyCompound = [
                "ソース", "ルウ", "カレー", "ペースト", "だし", "スープ",
                "ドレッシング", "マヨネーズ", "ケチャップ", "タレ", "たれ",
                "みりん", "味噌", "醤油", "ウスター", "中濃", "とんかつ",
                "オイスター", "豆板醤", "甜麺醤", "コチュジャン",
                "ブイヨン", "コンソメ", "鶏ガラ", "デミグラス",
            ].some(kw => item.item_name.includes(kw));

            if (isLikelyCompound && (!master || !master.raw_materials) && item.item_type !== "intermediate") {
                missingData.push(item.item_name);
            }
        }

        // 6. AIプロンプト構築
        const itemsInfo = recipeItems
            .filter(i => i.item_type === "ingredient" || i.item_type === "intermediate")
            .map(i => {
                const master = ingredientMap[i.item_name];
                let info = `- ${i.item_name} (使用量: ${i.usage_amount}g, 原価: ¥${i.cost})`;
                if (master?.raw_materials) {
                    info += `\n  → 原材料: ${master.raw_materials}`;
                }
                if (i.item_type === "intermediate") {
                    const cleanName = i.item_name.replace("【P】", "");
                    const subItems = intermediateData[cleanName];
                    if (subItems) {
                        info += `\n  → 中間部品の構成食材:`;
                        subItems.filter(si => si.item_type === "ingredient").forEach(si => {
                            const siMaster = ingredientMap[si.item_name];
                            info += `\n    - ${si.item_name} (${si.usage_amount}g)`;
                            if (siMaster?.raw_materials) {
                                info += ` → 原材料: ${siMaster.raw_materials}`;
                            }
                        });
                    }
                }
                return info;
            })
            .join("\n");

        const prompt = `あなたは日本の食品表示法に精通した食品表示のプロフェッショナルです。
以下のレシピ情報をもとに、食品表示法（2025年最新基準）に準拠した「原材料名」表示テキストを生成してください。

【レシピ名】${recipe.name}

【使用食材と構成】
${itemsInfo}

【原材料表示のルール（食品表示法準拠）】
1. 原材料は使用量（重量割合）の多い順に記載する
2. 複合原材料（2種以上の原材料からなるもの）は、その名称の後にカッコ書きで主要原材料を重量順に記載する
   - 例: チャーシュー（豚肉（国産又はカナダ産）、しょうゆ、しょうが、ねぎ、砂糖）
   - ただし、複合原材料の原材料が製品全体の5%未満の場合は「その他」と記載可能
3. 添加物は原材料の後に「/」（スラッシュ）で区切って記載する
   - 添加物も多い順に記載
   - 例: 調味料（アミノ酸等）、増粘剤（加工デンプン）、カラメル色素
4. アレルギー表示は末尾にカッコ書きで記載
   - 「（一部に○○・△△を含む）」の形式
   - 特定原材料8品目: えび、かに、くるみ、小麦、そば、卵、乳成分、落花生
   - 特定原材料に準ずるもの20品目: アーモンド、あわび、いか、いくら、オレンジ、カシューナッツ、キウイフルーツ、牛肉、ごま、さけ、さば、大豆、鶏肉、バナナ、豚肉、まつたけ、もも、やまいも、りんご、ゼラチン
5. 単品食材（野菜・肉・調味料原料等）はそのまま記載
6. 水は原則記載しない（加工食品の場合）
7. 産地表示が必要なものは産地も記載（例: 豚肉（国産）、鶏肉（国産又はブラジル産））

【重要な注意事項】
- 実在する食材データに基づいて正確に生成してください
- 複合原材料のraw_materialsデータがある場合は、そのデータを優先的に使用してください
- raw_materialsデータがない複合原材料は、一般的な原材料構成をAIの知識で推定してください
- 添加物の判定もAIの知識で行ってください
- 「原材料名」の欄に記載するテキストのみを出力してください（「原材料名:」というラベルは不要）

【出力形式】
以下の形式の純粋なJSONのみで返してください:
{
  "label": "原材料表示テキスト（改行なし、一連のテキスト）",
  "allergens": "アレルギー表示テキスト（一部に○○を含む）",
  "warnings": ["注意すべき点があれば配列で"],
  "missing_info": ["不足している情報があれば配列で"]
}`;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Clean up markdown code blocks
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const parsed = JSON.parse(text);

            // 原材料テキストとアレルゲンを結合
            let fullLabel = parsed.label || "";
            if (parsed.allergens) {
                fullLabel += `\n${parsed.allergens}`;
            }

            // DBに保存
            await supabase
                .from("recipes")
                .update({ ingredient_label: fullLabel })
                .eq("id", recipeId);

            return NextResponse.json({
                label: fullLabel,
                warnings: parsed.warnings || [],
                missing_info: [...(parsed.missing_info || []), ...missingData.map(n => `「${n}」の原材料データが未登録です。食材データベースで登録してください。`)],
            });
        } catch (parseError) {
            console.error("JSON Parse Error:", text);
            return NextResponse.json(
                { error: "AI応答の解析に失敗しました", raw: text },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error("Label Generation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
