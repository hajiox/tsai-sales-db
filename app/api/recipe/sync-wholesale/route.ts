// /api/recipe/sync-wholesale/route.ts
// 自社レシピ → 卸販売商品 紐付けAPI
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
    return intersection / (ba.size + bb.size - intersection);
}

function tokenize(s: string): string[] {
    const cleaned = s
        .replace(/【.*?】/g, " ")
        .replace(/[（()）\[\]・\-×x]/g, " ")
        .replace(/[\s　]+/g, " ")
        .trim()
        .toLowerCase();
    const tokens: string[] = [];
    const numUnitPattern = /(\d+(?:\.\d+)?)\s*(食|個|本|枚|g|kg|ml|set|セット|キロ)/gi;
    let numMatch;
    const numTokens: string[] = [];
    while ((numMatch = numUnitPattern.exec(cleaned)) !== null) {
        numTokens.push(numMatch[0].replace(/\s/g, ""));
    }
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
            if (ta === tokensB[j]) { bestIdx = j; bestSim = 1.0; break; }
            if (ta.includes(tokensB[j]) || tokensB[j].includes(ta)) {
                const sim = Math.min(ta.length, tokensB[j].length) / Math.max(ta.length, tokensB[j].length);
                if (sim > bestSim) { bestSim = sim; bestIdx = j; }
            }
        }
        if (bestIdx >= 0 && bestSim >= 0.5) { matched += bestSim; usedB.add(bestIdx); }
    }
    const total = Math.max(tokensA.length, tokensB.length);
    return total > 0 ? matched / total : 0;
}

function compositeScore(recipeName: string, productName: string): number {
    const bgScore = bigramSimilarity(recipeName, productName);
    const tkScore = tokenSimilarity(recipeName, productName);
    return tkScore * 0.6 + bgScore * 0.4;
}

function normalizeForExact(s: string): string {
    return s.replace(/[\s　\-・（）()【】\[\]]/g, "").toLowerCase();
}

// GET: Fetch all 自社 recipes and all wholesale_products + auto-match suggestions
export async function GET(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(request.url);
    const autoMatch = url.searchParams.get("autoMatch") === "true";

    try {
        const { data: recipes, error: recipesError } = await supabase
            .from("recipes")
            .select("id, name, selling_price, total_cost, linked_wholesale_product_id, category")
            .order("name");

        if (recipesError) throw recipesError;

        const { data: products, error: productsError } = await supabase
            .from("wholesale_products")
            .select("id, product_code, product_name, price, profit_rate, is_active")
            .eq("is_active", true)
            .order("display_order")
            .order("product_code");

        if (productsError) throw productsError;

        let suggestions: any[] = [];

        if (autoMatch) {
            const unlinkedRecipes = (recipes || []).filter((r) => !r.linked_wholesale_product_id);
            const linkedProductIds = new Set(
                (recipes || []).filter((r) => r.linked_wholesale_product_id).map((r) => r.linked_wholesale_product_id)
            );
            const availableProducts = (products || []).filter((p) => !linkedProductIds.has(p.id));

            const allScores: { recipe: any; product: any; score: number }[] = [];
            for (const recipe of unlinkedRecipes) {
                for (const product of availableProducts) {
                    if (normalizeForExact(recipe.name) === normalizeForExact(product.product_name)) {
                        allScores.push({ recipe, product, score: 1.0 });
                    } else {
                        const score = compositeScore(recipe.name, product.product_name);
                        allScores.push({ recipe, product, score });
                    }
                }
            }

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
                        productName: match.product.product_name,
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
            products: (products || []).map(p => ({
                id: p.id,
                name: p.product_name,
                product_code: p.product_code,
                price: p.price,
                profit_rate: p.profit_rate,
            })),
            suggestions,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Helper: 1:1 linking
async function linkRecipeToWholesaleProduct(
    supabase: any,
    recipeId: string,
    productId: string | null
): Promise<void> {
    if (productId) {
        const { data: existing } = await supabase
            .from("recipes")
            .select("id")
            .eq("linked_wholesale_product_id", productId)
            .neq("id", recipeId);

        if (existing && existing.length > 0) {
            for (const ex of existing) {
                await supabase
                    .from("recipes")
                    .update({ linked_wholesale_product_id: null })
                    .eq("id", ex.id);
            }
        }
    }

    await supabase
        .from("recipes")
        .update({ linked_wholesale_product_id: productId })
        .eq("id", recipeId);
}

// Helper: Sync recipe price to wholesale product
async function syncPriceToWholesaleProduct(
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
        // 7掛の卸価格ベースの利益率
        const wholesalePrice = Math.round(recipe.selling_price * 0.7);
        const profitRate = recipe.total_cost
            ? ((wholesalePrice - recipe.total_cost) / wholesalePrice) * 100
            : null;
        await supabase
            .from("wholesale_products")
            .update({
                price: wholesalePrice,
                profit_rate: profitRate ? Math.round(profitRate * 10) / 10 : null,
            })
            .eq("id", productId);
    }
}

// POST: Link/unlink, batch-link, or create-and-link
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();

        // ─── Create and Link mode: 卸商品を新規作成して紐付け ───
        if (body.createAndLink) {
            const { recipeId, recipeName, recipePrice } = body;
            if (!recipeId || !recipeName) {
                return NextResponse.json({ error: "recipeId and recipeName are required" }, { status: 400 });
            }

            // 7掛の卸価格
            const wholesalePrice = recipePrice ? Math.round(recipePrice * 0.7) : null;

            // wholesale_productsテーブルに新規作成
            const { data: newProduct, error: insertError } = await supabase
                .from("wholesale_products")
                .insert({
                    product_name: recipeName,
                    price: wholesalePrice,
                    product_type: '通常卸',
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // 紐付け
            await linkRecipeToWholesaleProduct(supabase, recipeId, newProduct.id);

            // 価格同期
            await syncPriceToWholesaleProduct(supabase, recipeId, newProduct.id);

            return NextResponse.json({ success: true, productId: newProduct.id, productName: newProduct.product_name });
        }

        if (body.batch && Array.isArray(body.links)) {
            let linked = 0;
            const productIdCounts = new Map<string, number>();
            for (const link of body.links) {
                if (link.productId) {
                    productIdCounts.set(link.productId, (productIdCounts.get(link.productId) || 0) + 1);
                }
            }
            const duplicates = [...productIdCounts.entries()].filter(([, count]) => count > 1);
            if (duplicates.length > 0) {
                return NextResponse.json(
                    { error: `同一商品に複数レシピを紐付けることはできません` },
                    { status: 400 }
                );
            }

            for (const link of body.links) {
                await linkRecipeToWholesaleProduct(supabase, link.recipeId, link.productId);
                linked++;
            }

            for (const link of body.links) {
                if (!link.productId) continue;
                await syncPriceToWholesaleProduct(supabase, link.recipeId, link.productId);
            }

            return NextResponse.json({ success: true, linked });
        }

        const { recipeId, productId } = body;
        await linkRecipeToWholesaleProduct(supabase, recipeId, productId);

        if (productId) {
            await syncPriceToWholesaleProduct(supabase, recipeId, productId);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Batch sync all linked recipes
export async function PUT() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { data: linkedRecipes, error } = await supabase
            .from("recipes")
            .select("id, name, selling_price, total_cost, linked_wholesale_product_id")
            .not("linked_wholesale_product_id", "is", null);

        if (error) throw error;

        let synced = 0;
        for (const recipe of linkedRecipes || []) {
            if (!recipe.linked_wholesale_product_id || !recipe.selling_price) continue;

            const wholesalePrice = Math.round(recipe.selling_price * 0.7);
            const profitRate = recipe.total_cost
                ? ((wholesalePrice - recipe.total_cost) / wholesalePrice) * 100
                : null;

            const { error: updateError } = await supabase
                .from("wholesale_products")
                .update({
                    price: wholesalePrice,
                    profit_rate: profitRate ? Math.round(profitRate * 10) / 10 : null,
                })
                .eq("id", recipe.linked_wholesale_product_id);

            if (!updateError) synced++;
        }

        return NextResponse.json({ success: true, synced });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
