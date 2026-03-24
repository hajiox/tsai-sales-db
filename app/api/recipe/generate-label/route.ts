// /api/recipe/generate-label/route.ts
// AI原材料表示生成API v6 — 体系的再設計版
// パイプライン: 食材分類 → raw_materialsパース → 添加物統合 → ラベル組立 → AIレビュー

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(geminiApiKey);

// =============================================================================
// 型定義
// =============================================================================

interface MasterData {
    raw_materials: string | null;
    allergens: string | null;
}

interface ParsedRM {
    ingredients: string[];  // 原材料部分の個別成分
    additives: string[];    // 添加物部分の個別成分
    allergens: string[];    // 検出されたアレルゲン文字列
}

type ItemClass = "simple" | "compound" | "all_additive" | "intermediate" | "missing_compound" | "skip";

interface ClassifiedItem {
    displayName: string;
    usageAmount: number;
    itemClass: ItemClass;
    labelText: string;       // 最終的にlabelPartsに入るテキスト
    additives: string[];     // この食材から検出された添加物
    allergens: string[];     // この食材から検出されたアレルゲン
}

// =============================================================================
// Step 1: ユーティリティ
// =============================================================================

/** 不可視文字・制御文字・連続空白を除去 */
function sanitize(s: string): string {
    return s
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/\r\n/g, " ").replace(/\n/g, " ")
        .replace(/\s{2,}/g, " ").trim();
}

/** 全角カッコを半角に統一 */
function normalizeParen(s: string): string {
    return s.replace(/（/g, "(").replace(/）/g, ")");
}

/** 食材名から【...】プレフィックスと数量情報を除去 */
function cleanItemName(name: string): string {
    return name
        .replace(/【[^】]*】/g, "")
        .replace(/\d+[kKｋ][gGｇ].*/, "")
        .trim();
}

// =============================================================================
// Step 2: raw_materialsパース（改善版）
// =============================================================================

/** アレルゲン正規表現: 「(一部に...を含む)」「(原材料の一部に...を含む)」の両方に対応 */
const ALLERGEN_REGEX = /[（(]\s*(?:原材料の)?一部に.+?を含む\s*[)）]/g;

function parseRawMaterials(raw: string): ParsedRM {
    const cleaned = sanitize(raw);

    // 1. アレルゲン表記を抽出・除去
    const allergenMatches = cleaned.match(ALLERGEN_REGEX) || [];
    const allergens = allergenMatches.map(a =>
        a.replace(/[（()）]/g, "").replace(/^\s*(?:原材料の)?/, "").trim()
    );
    let body = cleaned.replace(ALLERGEN_REGEX, "").replace(/[、,]+$/, "").trim();

    // 2. スラッシュで原材料と添加物を分離（カッコ内のスラッシュは無視）
    let slashIdx = -1;
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === "(" || c === "（") depth++;
        else if (c === ")" || c === "）") depth--;
        else if ((c === "/" || c === "／") && depth === 0) {
            slashIdx = i;
            break;
        }
    }

    const split = (s: string) =>
        s ? s.split(/[、,]/).map(x => x.trim()).filter(x => x.length > 0) : [];

    let ingredients: string[];
    let additives: string[];

    if (slashIdx >= 0) {
        ingredients = split(body.substring(0, slashIdx).replace(/[、,]+$/, "").trim());
        additives = split(body.substring(slashIdx + 1).trim());
    } else {
        ingredients = split(body);
        additives = [];
    }

    return { ingredients, additives, allergens };
}

// =============================================================================
// Step 3: 添加物判定
// =============================================================================

const ADDITIVE_KEYWORDS = [
    "調味料", "酸味料", "甘味料", "着色料", "保存料", "酸化防止剤", "発色剤",
    "漂白剤", "防かび剤", "膨張剤", "増粘剤", "安定剤", "ゲル化剤", "糊料",
    "乳化剤", "pH調整剤", "ph調整剤", "かんすい", "豆腐用凝固剤", "光沢剤",
    "香料", "酒精", "醸造アルコール",
    "グルタミン酸ナトリウム", "イノシン酸ナトリウム", "グアニル酸ナトリウム",
    "グルタミン酸Na", "イノシン酸Na", "グアニル酸Na",
    "カラメル色素", "香辛料抽出物", "加工デンプン", "加工でん粉",
    "ソルビトール", "トレハロース", "キシリトール",
    "ビタミンC", "ビタミンE", "V.C", "V.E",
    "アミノ酸等", "増粘多糖類", "キサンタンガム", "カラギナン",
    "カロチン色素", "カロテン色素", "アナトー色素",
    "リン酸塩", "ポリリン酸", "メタリン酸",
    "亜硝酸ナトリウム", "亜硝酸Na", "ソルビン酸",
    "プロピレングリコール", "エタノール",
];

function isAdditive(name: string): boolean {
    const n = normalizeParen(name);
    return ADDITIVE_KEYWORDS.some(kw => n.includes(kw));
}

// =============================================================================
// Step 4: 食材分類
// =============================================================================

function classifyItem(
    itemName: string,
    itemType: string,
    master: MasterData | null
): { itemClass: ItemClass; parsed: ParsedRM | null } {
    // material / expense → ラベル対象外
    if (itemType === "material" || itemType === "expense") {
        return { itemClass: "skip", parsed: null };
    }

    // product → ラベル対象外
    if (itemType === "product") {
        return { itemClass: "skip", parsed: null };
    }

    // 【自社○○】付き → 自社製造品。displayNameをそのまま単純原材料として使用
    if (itemName.includes("【自社")) {
        return { itemClass: "simple", parsed: null };
    }

    // intermediate → サブレシピ展開
    if (itemType === "intermediate") {
        return { itemClass: "intermediate", parsed: null };
    }

    // raw_materialsなし
    if (!master?.raw_materials) {
        // 複合原材料と推定されるがデータ不足のもの
        const isLikelyCompound = [
            "ソース", "ルウ", "カレー", "ペースト", "だし", "スープ",
            "ドレッシング", "マヨネーズ", "ケチャップ", "タレ", "たれ",
            "みりん", "味噌", "ウスター", "中濃", "とんかつ",
            "オイスター", "豆板醤", "甜麺醤", "コチュジャン",
            "ブイヨン", "コンソメ", "鶏ガラ", "デミグラス",
            "ハム", "ベーコン", "ソーセージ", "チーズ",
            "餃子", "焼売", "春巻", "ワンタン", "練り物", "ちくわ", "かまぼこ",
            "即席", "レトルト", "の素",
        ].some(kw => itemName.includes(kw));

        return { itemClass: isLikelyCompound ? "missing_compound" : "simple", parsed: null };
    }

    // raw_materialsあり → パース
    const parsed = parseRawMaterials(master.raw_materials);

    // 全成分が添加物（例: ハイミー）
    if (parsed.ingredients.length > 0 && parsed.ingredients.every(i => isAdditive(i))) {
        return { itemClass: "all_additive", parsed };
    }

    // 単一成分 → 単純原材料（食塩→海水 のような置換を防ぐ）
    if (parsed.ingredients.filter(i => !isAdditive(i)).length <= 1) {
        return { itemClass: "simple", parsed };
    }

    // 複数成分 → 複合原材料
    return { itemClass: "compound", parsed };
}

// =============================================================================
// Step 5: 添加物統合
// =============================================================================

/** 添加物リストの重複排除・統合 */
function consolidateAdditives(additives: string[]): string[] {
    // 1. 全角/半角カッコを正規化して重複排除
    const normalized = additives
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => normalizeParen(a));

    const unique = [...new Set(normalized)];

    // 2. 「調味料(アミノ酸等)」があれば、個別のアミノ酸系添加物は除去
    const hasAminoGroup = unique.some(a => a.includes("調味料") && a.includes("アミノ酸"));
    let result = unique;
    if (hasAminoGroup) {
        result = result.filter(a => {
            if (a.includes("調味料")) return true; // グループ名は残す
            // 個別のアミノ酸系成分は除去
            const aminoIndividuals = [
                "グルタミン酸ナトリウム", "イノシン酸ナトリウム", "グアニル酸ナトリウム",
                "グルタミン酸Na", "イノシン酸Na", "グアニル酸Na",
            ];
            return !aminoIndividuals.some(ai => a.includes(ai));
        });
    }

    // 3. 「酒精」と「醸造アルコール」は同義 → 「酒精」に統一
    const hasShusei = result.some(a => a === "酒精");
    const hasJozo = result.some(a => a.includes("醸造アルコール"));
    if (hasShusei && hasJozo) {
        result = result.filter(a => !a.includes("醸造アルコール"));
    } else if (hasJozo) {
        result = result.map(a => a.includes("醸造アルコール") ? "酒精" : a);
    }

    // 4. 再度重複排除
    return [...new Set(result)];
}

// =============================================================================
// Step 6: アレルゲン統合
// =============================================================================

function consolidateAllergens(allergenStrings: string[]): string[] {
    const all = allergenStrings
        .join("・")
        .replace(/一部に/g, "")
        .replace(/原材料の/g, "")
        .replace(/を含む/g, "")
        // 「豚肉にゼラチン」のようなパターン: アレルゲン間の「に」も区切り文字として扱う
        .split(/[・、,に]/)
        .map(a => a.trim())
        .filter(a => a.length > 0);
    return [...new Set(all)];
}

// =============================================================================
// Step 7: あいまいマッチング
// =============================================================================

function normalize(s: string): string {
    return s.replace(/\s+/g, "")
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/\d+[gGmlMLkKlL]+/g, "")
        .replace(/徳用|お徳用|業務用|大容量/g, "")
        .replace(/【[^】]*】/g, "");
}

function lcsLength(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (!m || !n) return 0;
    let prev = new Array(n + 1).fill(0), curr = new Array(n + 1).fill(0), max = 0;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
            if (curr[j] > max) max = curr[j];
        }
        [prev, curr] = [curr, prev]; curr.fill(0);
    }
    return max;
}

function fuzzyMatchIngredient(
    itemName: string,
    allMasters: Array<{ name: string; raw_materials: string | null; allergens: string | null }>
): MasterData | null {
    const nn = normalize(itemName);
    if (!nn) return null;

    let best: MasterData | null = null;
    let bestScore = 0;

    for (const m of allMasters) {
        const nm = normalize(m.name);
        if (!nm) continue;

        // 完全一致
        if (nn === nm) return { raw_materials: m.raw_materials, allergens: m.allergens };

        // 部分一致（長さ比率90%以上のみ — 厳しめ）
        if (nn.includes(nm) || nm.includes(nn)) {
            const ratio = Math.min(nn.length, nm.length) / Math.max(nn.length, nm.length);
            if (ratio >= 0.9) {
                const s = ratio * 80;
                if (s > bestScore) { bestScore = s; best = { raw_materials: m.raw_materials, allergens: m.allergens }; }
            }
            continue;
        }

        // LCS（閾値50以上）
        const l = lcsLength(nn, nm);
        const sim = l / Math.max(nn.length, nm.length) * 70;
        if (l >= 4 && sim > bestScore && sim >= 50) {
            bestScore = sim;
            best = { raw_materials: m.raw_materials, allergens: m.allergens };
        }
    }

    return bestScore >= 50 ? best : null;
}

// =============================================================================
// メインハンドラ
// =============================================================================

export async function POST(request: Request) {
    try {
        const { recipeId } = await request.json();
        if (!recipeId) return NextResponse.json({ error: "recipeId が必要です" }, { status: 400 });

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // ---- データ取得 ----

        const { data: recipe, error: recipeError } = await supabase
            .from("recipes").select("id, name").eq("id", recipeId).single();
        if (recipeError || !recipe) return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });

        const { data: recipeItems } = await supabase
            .from("recipe_items").select("item_name, item_type, usage_amount")
            .eq("recipe_id", recipeId).order("usage_amount", { ascending: false });
        if (!recipeItems?.length) return NextResponse.json({ error: "レシピにアイテムがありません" }, { status: 400 });

        // マスターデータ（全件キャッシュ）
        const ingNames = recipeItems
            .filter(i => ["ingredient", "intermediate"].includes(i.item_type))
            .map(i => i.item_name);
        const { data: allMasters } = await supabase
            .from("ingredients").select("name, raw_materials, allergens")
            .not("raw_materials", "is", null);
        const { data: exactMatches } = await supabase
            .from("ingredients").select("name, raw_materials, allergens")
            .in("name", ingNames);

        // マスターマップ構築
        const masterMap: Record<string, MasterData> = {};
        (exactMatches || []).forEach(m => {
            masterMap[m.name] = { raw_materials: m.raw_materials, allergens: m.allergens };
        });

        // 完全一致がない食材にあいまいマッチング（【自社】付きは除外）
        for (const name of ingNames) {
            if (masterMap[name] || name.includes("【自社")) continue;
            const match = fuzzyMatchIngredient(name, allMasters || []);
            if (match) masterMap[name] = match;
        }

        // 中間部品のサブレシピ取得
        const intItems = recipeItems.filter(i => i.item_type === "intermediate");
        const intSubMap: Record<string, Array<{ item_name: string; item_type: string; usage_amount: number }>> = {};

        if (intItems.length > 0) {
            const intNames = intItems.map(i => i.item_name.replace("【P】", ""));
            const { data: intRecipes } = await supabase
                .from("recipes").select("id, name").eq("is_intermediate", true).in("name", intNames);
            if (intRecipes) {
                for (const ir of intRecipes) {
                    const { data: sub } = await supabase
                        .from("recipe_items").select("item_name, item_type, usage_amount")
                        .eq("recipe_id", ir.id).order("usage_amount", { ascending: false });
                    if (sub) {
                        intSubMap[ir.name] = sub;
                        // サブ食材のマスターも取得
                        for (const si of sub.filter(s => s.item_type === "ingredient")) {
                            if (!masterMap[si.item_name]) {
                                const match = fuzzyMatchIngredient(si.item_name, allMasters || []);
                                if (match) masterMap[si.item_name] = match;
                            }
                        }
                    }
                }
            }
        }

        // ---- パイプライン実行 ----

        const labelParts: string[] = [];
        const allAdditives: string[] = [];
        const allAllergens: string[] = [];
        const missingData: string[] = [];

        for (const item of recipeItems) {
            const master = masterMap[item.item_name] || null;
            const { itemClass, parsed } = classifyItem(item.item_name, item.item_type, master);
            const displayName = cleanItemName(item.item_name);

            // マスターのallergensカラムからアレルゲンを収集
            if (master?.allergens) allAllergens.push(master.allergens);

            switch (itemClass) {
                case "skip":
                    break;

                case "simple":
                    labelParts.push(displayName);
                    // parsedがあれば添加物・アレルゲンだけ収集
                    if (parsed) {
                        allAdditives.push(...parsed.additives);
                        allAllergens.push(...parsed.allergens);
                    }
                    break;

                case "compound": {
                    const p = parsed!;
                    const subIng = p.ingredients.filter(i => !isAdditive(i));
                    const subAdd = [...p.ingredients.filter(i => isAdditive(i)), ...p.additives];
                    labelParts.push(`${displayName}(${subIng.join("、")})`);
                    allAdditives.push(...subAdd);
                    allAllergens.push(...p.allergens);
                    break;
                }

                case "all_additive": {
                    const p = parsed!;
                    allAdditives.push(...p.ingredients, ...p.additives);
                    allAllergens.push(...p.allergens);
                    break;
                }

                case "intermediate": {
                    const cleanName = item.item_name.replace("【P】", "");
                    const subs = intSubMap[cleanName];
                    if (subs) {
                        const subIng: string[] = [];
                        const subAdd: string[] = [];
                        for (const si of subs.filter(s => s.item_type === "ingredient")) {
                            const siMaster = masterMap[si.item_name] || null;
                            const siClass = classifyItem(si.item_name, si.item_type, siMaster);

                            if (siClass.itemClass === "simple") {
                                subIng.push(cleanItemName(si.item_name));
                                if (siClass.parsed) {
                                    subAdd.push(...siClass.parsed.additives);
                                    allAllergens.push(...siClass.parsed.allergens);
                                }
                            } else if (siClass.itemClass === "compound" && siClass.parsed) {
                                const p = siClass.parsed;
                                subIng.push(...p.ingredients.filter(i => !isAdditive(i)));
                                subAdd.push(...p.ingredients.filter(i => isAdditive(i)), ...p.additives);
                                allAllergens.push(...p.allergens);
                            } else if (siClass.itemClass === "all_additive" && siClass.parsed) {
                                subAdd.push(...siClass.parsed.ingredients, ...siClass.parsed.additives);
                                allAllergens.push(...siClass.parsed.allergens);
                            }
                            if (siMaster?.allergens) allAllergens.push(siMaster.allergens);
                        }
                        if (subIng.length > 0) {
                            labelParts.push(`${displayName}(${subIng.join("、")})`);
                        } else {
                            labelParts.push(displayName);
                        }
                        allAdditives.push(...subAdd);
                    } else {
                        labelParts.push(displayName);
                    }
                    break;
                }

                case "missing_compound":
                    missingData.push(item.item_name);
                    labelParts.push(`【要確認: ${displayName}】`);
                    break;
            }
        }

        // ---- 添加物統合 & アレルゲン統合 ----

        const consolidatedAdditives = consolidateAdditives(allAdditives);
        const consolidatedAllergens = consolidateAllergens(allAllergens);

        // ---- ラベル組み立て ----

        const labelIngredients = labelParts.join("、");
        const labelAdditivesPart = consolidatedAdditives.length > 0
            ? "／" + consolidatedAdditives.join("、")
            : "";
        const finalLabel = labelIngredients + labelAdditivesPart;
        const finalAllergens = consolidatedAllergens.length > 0
            ? `(一部に${consolidatedAllergens.join("・")}を含む)`
            : "";

        let label = finalLabel;
        if (finalAllergens) label += `\n${finalAllergens}`;

        // ---- AIレビュー（ラベル非改変、警告のみ） ----

        let aiWarnings: string[] = [];
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
            const prompt = `食品表示法の専門家として、以下の原材料ラベルをレビューし、問題点があれば警告してください。
ラベル本文は変更しないでください。問題点と改善提案のみ返してください。

【ラベル】
${label}

【チェック項目】
1. 表記ゆれがないか
2. 同じ原材料の重複がないか
3. 添加物の区分が正しいか
4. アレルゲン表示が正しいか（特定原材料8品目: えび、かに、くるみ、小麦、そば、卵、乳成分、落花生）
5. 複合原材料のカッコ書きが正しいか

JSON出力のみ:
{"warnings": ["警告メッセージ"]}`;

            const result = await model.generateContent(prompt);
            const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(text);
            aiWarnings = parsed.warnings || [];
        } catch (e) {
            console.warn("AI review failed:", e);
        }

        // ---- DB保存 & レスポンス ----

        await supabase.from("recipes").update({ ai_ingredient_label: label }).eq("id", recipeId);

        return NextResponse.json({
            label,
            warnings: aiWarnings,
            missing_info: missingData.map(n => `「${n}」の原材料データが未登録です。食材データベースで登録してください。`),
        });
    } catch (error: any) {
        console.error("Label Generation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
