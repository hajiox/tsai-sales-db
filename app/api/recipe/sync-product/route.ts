import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ─── String similarity (Bigram Jaccard) ───
function bigrams(s: string): Set<string> {
    const set = new Set<string>();
    const normalized = s.replace(/[\s　\-・（）()【】\[\]]/g, "").toLowerCase();
    for (let i = 0; i < normalized.length - 1; i++) {
        set.add(normalized.substring(i, i + 2));
    }
    return set;
}

function bigramSimilarity(a: string, b: string): number {
    const ba = bigrams(a);
    const bb = bigrams(b);
    if (ba.size === 0 && bb.size === 0) return 0;
    let intersection = 0;
    ba.forEach((bg) => { if (bb.has(bg)) intersection++; });
    return intersection / (ba.size + bb.size - intersection); // Jaccard
}

// ─── Token-based similarity (語順に依存しない) ───
function tokenize(s: string): string[] {
    // 記号・括弧を除去してトークン分解
    const cleaned = s
        .replace(/【.*?】/g, " ")   // 【ネット】等を除去
        .replace(/[（()）\[\]・\-×x]/g, " ")
        .replace(/[\s　]+/g, " ")
        .trim()
        .toLowerCase();
    // 数字+単位をまとめて1トークン、それ以外はスペース区切り
    const tokens: string[] = [];
    // 数値+単位トークン抽出 (例: "3食", "800g", "1kg")
    const numUnitPattern = /(\d+(?:\.\d+)?)\s*(食|個|本|枚|g|kg|ml|set|セット|キロ)/gi;
    let numMatch;
    const numTokens: string[] = [];
    while ((numMatch = numUnitPattern.exec(cleaned)) !== null) {
        numTokens.push(numMatch[0].replace(/\s/g, ""));
    }
    // 残りのテキストをスペースで分割
    const textOnly = cleaned.replace(numUnitPattern, " ").replace(/\s+/g, " ").trim();
    const words = textOnly.split(" ").filter(w => w.length > 0);
    tokens.push(...numTokens, ...words);
    return tokens;
}

function tokenSimilarity(a: string, b: string): number {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    if (tokensA.length === 0 && tokensB.length === 0) return 0;

    let matched = 0;
    const usedB = new Set<number>();

    for (const ta of tokensA) {
        let bestIdx = -1;
        let bestSim = 0;
        for (let j = 0; j < tokensB.length; j++) {
            if (usedB.has(j)) continue;
            // 完全一致
            if (ta === tokensB[j]) {
                bestIdx = j;
                bestSim = 1.0;
                break;
            }
            // 部分一致（一方が他方を含む）
            if (ta.includes(tokensB[j]) || tokensB[j].includes(ta)) {
                const sim = Math.min(ta.length, tokensB[j].length) / Math.max(ta.length, tokensB[j].length);
                if (sim > bestSim) {
                    bestSim = sim;
                    bestIdx = j;
                }
            }
        }
        if (bestIdx >= 0 && bestSim >= 0.5) {
            matched += bestSim;
            usedB.add(bestIdx);
        }
    }

    const total = Math.max(tokensA.length, tokensB.length);
    return total > 0 ? matched / total : 0;
}

// ─── 複合スコア ───
function compositeScore(
    recipeName: string,
    productName: string,
    recipePrice: number | null,
    productPrice: number | null
): number {
    // 1. Bigram類似度 (文字レベル)
    const bgScore = bigramSimilarity(recipeName, productName);

    // 2. トークン類似度 (語順不問)
    const tkScore = tokenSimilarity(recipeName, productName);

    // 3. テキストスコア = トークン重視 (6:4)
    const textScore = tkScore * 0.6 + bgScore * 0.4;

    // 4. 価格一致ボーナス
    let priceBonus = 0;
    if (recipePrice && productPrice && recipePrice > 0 && productPrice > 0) {
        if (recipePrice === productPrice) {
            priceBonus = 0.15; // 完全一致: +15%
        } else {
            const priceDiff = Math.abs(recipePrice - productPrice) / Math.max(recipePrice, productPrice);
            if (priceDiff < 0.05) priceBonus = 0.10; // 5%未満差: +10%
            else if (priceDiff < 0.15) priceBonus = 0.05; // 15%未満差: +5%
        }
    }

    return Math.min(1.0, textScore + priceBonus);
}

function normalizeForExact(s: string): string {
    return s.replace(/[\s　\-・（）()【】\[\]]/g, "").toLowerCase();
}

// GET: Fetch all recipes (ネット専用) and all products + auto-match suggestions
export async function GET(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(request.url);
    const autoMatch = url.searchParams.get("autoMatch") === "true";

    try {
        const { data: recipes, error: recipesError } = await supabase
            .from("recipes")
            .select("id, name, selling_price, total_cost, linked_product_id, category")
            .eq("category", "ネット専用")
            .order("name");

        if (recipesError) throw recipesError;

        const { data: products, error: productsError } = await supabase
            .from("products")
            .select("id, name, price, profit_rate, series, series_code, product_code, is_hidden")
            .eq("is_hidden", false)
            .order("series_code")
            .order("product_code");

        if (productsError) throw productsError;

        let suggestions: any[] = [];

        if (autoMatch) {
            // Auto-match: for each unlinked recipe, find best matching product
            const unlinkedRecipes = (recipes || []).filter((r) => !r.linked_product_id);
            const linkedProductIds = new Set(
                (recipes || []).filter((r) => r.linked_product_id).map((r) => r.linked_product_id)
            );
            const availableProducts = (products || []).filter((p) => !linkedProductIds.has(p.id));

            const usedProductIds = new Set<string>();

            // まず全ペアのスコアを計算
            const allScores: { recipe: any; product: any; score: number }[] = [];
            for (const recipe of unlinkedRecipes) {
                for (const product of availableProducts) {
                    // 完全一致チェック
                    if (normalizeForExact(recipe.name) === normalizeForExact(product.name)) {
                        allScores.push({ recipe, product, score: 1.0 });
                    } else {
                        const score = compositeScore(recipe.name, product.name, recipe.selling_price, product.price);
                        allScores.push({ recipe, product, score });
                    }
                }
            }

            // スコア降順ソートして貪欲マッチング（高スコアのペアから確定）
            allScores.sort((a, b) => b.score - a.score);
            const matchedRecipeIds = new Set<string>();
            const matchedProductIds = new Set<string>();
            const bestMatches = new Map<string, { product: any; score: number }>();

            for (const entry of allScores) {
                if (matchedRecipeIds.has(entry.recipe.id)) continue;
                if (matchedProductIds.has(entry.product.id)) continue;
                if (entry.score < 0.15) continue;

                bestMatches.set(entry.recipe.id, { product: entry.product, score: entry.score });
                matchedRecipeIds.add(entry.recipe.id);
                matchedProductIds.add(entry.product.id);
            }

            for (const recipe of unlinkedRecipes) {
                const match = bestMatches.get(recipe.id);
                if (match) {
                    suggestions.push({
                        recipeId: recipe.id,
                        recipeName: recipe.name,
                        recipePrice: recipe.selling_price,
                        productId: match.product.id,
                        productName: match.product.name,
                        productPrice: match.product.price,
                        score: Math.round(match.score * 100),
                        confidence: match.score >= 0.7 ? "high" : match.score >= 0.4 ? "medium" : "low",
                    });
                } else {
                    suggestions.push({
                        recipeId: recipe.id,
                        recipeName: recipe.name,
                        recipePrice: recipe.selling_price,
                        productId: null,
                        productName: null,
                        productPrice: null,
                        score: 0,
                        confidence: "none",
                    });
                }
            }
        }

        return NextResponse.json({
            recipes: recipes || [],
            products: products || [],
            suggestions,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Helper: 1:1制約を保証して紐付け（既存の紐付けを自動解除）
async function linkRecipeToProduct(
    supabase: any,
    recipeId: string,
    productId: string | null
): Promise<void> {
    if (productId) {
        // 1:1制約: この商品に既に紐付いている別レシピがあれば解除
        const { data: existing } = await supabase
            .from("recipes")
            .select("id")
            .eq("linked_product_id", productId)
            .neq("id", recipeId);

        if (existing && existing.length > 0) {
            for (const ex of existing) {
                await supabase
                    .from("recipes")
                    .update({ linked_product_id: null })
                    .eq("id", ex.id);
                console.log(`1:1制約: レシピ ${ex.id} の紐付けを解除（商品 ${productId} は別レシピに再割当）`);
            }
        }
    }

    await supabase
        .from("recipes")
        .update({ linked_product_id: productId })
        .eq("id", recipeId);
}

// Helper: レシピの価格をWEB販売商品に同期
async function syncPriceToProduct(
    supabase: any,
    recipeId: string,
    productId: string
): Promise<void> {
    const { data: recipe } = await supabase
        .from("recipes")
        .select("selling_price, total_cost")
        .eq("id", recipeId)
        .single();

    if (recipe && recipe.selling_price) {
        const profitRate = recipe.total_cost
            ? ((recipe.selling_price - recipe.total_cost) / recipe.selling_price) * 100
            : null;
        await supabase
            .from("products")
            .update({
                price: recipe.selling_price,
                profit_rate: profitRate ? Math.round(profitRate * 10) / 10 : null,
            })
            .eq("id", productId);
    }
}

// POST: Link/unlink or batch-link（1:1制約付き）
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();

        // Batch link mode
        if (body.batch && Array.isArray(body.links)) {
            let linked = 0;

            // 1:1制約チェック: 同じバッチ内で同じproductIdが複数ないか
            const productIdCounts = new Map<string, number>();
            for (const link of body.links) {
                if (link.productId) {
                    productIdCounts.set(link.productId, (productIdCounts.get(link.productId) || 0) + 1);
                }
            }
            const duplicates = [...productIdCounts.entries()].filter(([, count]) => count > 1);
            if (duplicates.length > 0) {
                return NextResponse.json(
                    { error: `同一商品に複数レシピを紐付けることはできません（対象商品ID: ${duplicates.map(([id]) => id).join(', ')}）` },
                    { status: 400 }
                );
            }

            for (const link of body.links) {
                await linkRecipeToProduct(supabase, link.recipeId, link.productId);
                linked++;
            }

            // Sync prices
            for (const link of body.links) {
                if (!link.productId) continue;
                await syncPriceToProduct(supabase, link.recipeId, link.productId);
            }

            return NextResponse.json({ success: true, linked });
        }

        // Single link mode
        const { recipeId, productId } = body;
        await linkRecipeToProduct(supabase, recipeId, productId);

        if (productId) {
            await syncPriceToProduct(supabase, recipeId, productId);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Sync all linked recipes to products (batch sync)
export async function PUT() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { data: linkedRecipes, error } = await supabase
            .from("recipes")
            .select("id, name, selling_price, total_cost, linked_product_id")
            .not("linked_product_id", "is", null);

        if (error) throw error;

        let synced = 0;
        for (const recipe of linkedRecipes || []) {
            if (!recipe.linked_product_id || !recipe.selling_price) continue;

            const profitRate = recipe.total_cost
                ? ((recipe.selling_price - recipe.total_cost) / recipe.selling_price) * 100
                : null;

            const { error: updateError } = await supabase
                .from("products")
                .update({
                    price: recipe.selling_price,
                    profit_rate: profitRate ? Math.round(profitRate * 10) / 10 : null,
                })
                .eq("id", recipe.linked_product_id);

            if (!updateError) synced++;
        }

        return NextResponse.json({ success: true, synced });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
