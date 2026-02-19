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

        // 3. 食材マスターから raw_materials を取得（あいまいマッチング対応）
        const ingredientNames = recipeItems
            .filter(i => ["ingredient", "intermediate"].includes(i.item_type))
            .map(i => i.item_name);

        // raw_materialsが登録されている全食材を取得
        const { data: allIngredients } = await supabase
            .from("ingredients")
            .select("name, raw_materials, allergens")
            .not("raw_materials", "is", null);

        // 完全一致の食材も取得
        const { data: exactIngredients } = await supabase
            .from("ingredients")
            .select("name, raw_materials, allergens")
            .in("name", ingredientNames);

        // 名前を正規化する関数（スペース・全角半角・容量表記・商品種類名を除去してブランド名ベースに）
        const normalize = (s: string) =>
            s.replace(/\s+/g, "")
                .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
                .replace(/\d+[gGmlMLkKlL]+/g, "")
                .replace(/徳用|お徳用|業務用|大容量/g, "")
                .replace(/【P】/g, "");

        // 濁点・半濁点を除去して正規化
        const removeDakuten = (s: string) => {
            const map: Record<string, string> = { 'ガ': 'カ', 'ギ': 'キ', 'グ': 'ク', 'ゲ': 'ケ', 'ゴ': 'コ', 'ザ': 'サ', 'ジ': 'シ', 'ズ': 'ス', 'ゼ': 'セ', 'ゾ': 'ソ', 'ダ': 'タ', 'ヂ': 'チ', 'ヅ': 'ツ', 'デ': 'テ', 'ド': 'ト', 'バ': 'ハ', 'ビ': 'ヒ', 'ブ': 'フ', 'ベ': 'ヘ', 'ボ': 'ホ', 'パ': 'ハ', 'ピ': 'ヒ', 'プ': 'フ', 'ペ': 'ヘ', 'ポ': 'ホ', 'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ', 'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ', 'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と', 'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ', 'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ' };
            return s.split('').map(c => map[c] || c).join('');
        };

        // ブランド名抽出用（商品種類名を除去 + 濁点正規化）
        const extractBrand = (s: string) =>
            removeDakuten(normalize(s)
                .replace(/カレー|フレーク|ルウ|ルー|ソース|ペースト|だし|スープ|ドレッシング|マヨネーズ|ケチャップ|タレ|たれ/g, ""));

        // 共通部分文字列の長さを求める
        const lcsLength = (a: string, b: string): number => {
            const m = a.length, n = b.length;
            if (m === 0 || n === 0) return 0;
            let prev = new Array(n + 1).fill(0);
            let curr = new Array(n + 1).fill(0);
            let maxLen = 0;
            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    if (a[i - 1] === b[j - 1]) {
                        curr[j] = prev[j - 1] + 1;
                        if (curr[j] > maxLen) maxLen = curr[j];
                    } else {
                        curr[j] = 0;
                    }
                }
                [prev, curr] = [curr, prev];
                curr.fill(0);
            }
            return maxLen;
        };

        const ingredientMap: Record<string, { raw_materials: string | null; allergens: string | null }> = {};

        // まず完全一致を登録
        (exactIngredients || []).forEach(i => {
            ingredientMap[i.name] = { raw_materials: i.raw_materials, allergens: i.allergens };
        });

        // 完全一致がなかった食材に対してあいまいマッチング
        for (const itemName of ingredientNames) {
            if (ingredientMap[itemName]?.raw_materials) continue; // 既にraw_materialsがある

            const normName = normalize(itemName);
            const brandName = extractBrand(itemName);
            let bestMatch: { name: string; raw_materials: string | null; allergens: string | null } | null = null;
            let bestScore = 0;

            for (const master of (allIngredients || [])) {
                const normMaster = normalize(master.name);
                const brandMaster = extractBrand(master.name);

                // 正規化後の完全一致
                if (normName === normMaster) {
                    bestMatch = master;
                    bestScore = 100;
                    break;
                }
                // ブランド名一致（例: ジャワカレー → ジャワフレーク、どちらも brandName = "ジャワ"）
                if (brandName.length >= 2 && brandName === brandMaster) {
                    const score = 90;
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = master;
                    }
                    continue;
                }
                // 部分一致（短い方が長い方に含まれる）
                if (normName.includes(normMaster) || normMaster.includes(normName)) {
                    const score = Math.min(normName.length, normMaster.length) / Math.max(normName.length, normMaster.length) * 80;
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = master;
                    }
                    continue;
                }
                // 共通部分文字列による類似度
                const lcs = lcsLength(normName, normMaster);
                const similarity = lcs / Math.max(normName.length, normMaster.length) * 70;
                if (lcs >= 3 && similarity > bestScore) {
                    bestScore = similarity;
                    bestMatch = master;
                }
            }

            if (bestMatch && bestScore >= 40) {
                ingredientMap[itemName] = { raw_materials: bestMatch.raw_materials, allergens: bestMatch.allergens };
                console.log(`[fuzzy match] "${itemName}" → "${bestMatch.name}" (score: ${bestScore.toFixed(0)})`);
            }
        }

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
                "麺", "パスタ", "パン", "ハム", "ベーコン", "ソーセージ", "チーズ", "バター",
                "餃子", "焼売", "春巻", "ワンタン", "練り物", "ちくわ", "かまぼこ",
                "即席", "レトルト", "冷凍", "ミックス", "粉", "の素",
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
                } else if (missingData.includes(i.item_name)) {
                    info += `\n  → 【注意】原材料データ未登録`;
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
- raw_materialsデータがない複合原材料は、**絶対にAIの知識で推測して補完しないでください**。
- データがない場合は、代わりに「【要確認: 〇〇】」とそのまま出力してください。
- 正確なデータに基づかない生成は食品事故につながるため禁止します。
- 添加物の判定は、提供された原材料データに基づいて行ってください。
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
