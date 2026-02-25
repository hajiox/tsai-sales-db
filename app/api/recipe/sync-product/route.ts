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

function similarity(a: string, b: string): number {
    const ba = bigrams(a);
    const bb = bigrams(b);
    if (ba.size === 0 && bb.size === 0) return 0;
    let intersection = 0;
    ba.forEach((bg) => { if (bb.has(bg)) intersection++; });
    return intersection / (ba.size + bb.size - intersection); // Jaccard
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
            .select("id, name, price, profit_rate, series, series_code, product_code")
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

            for (const recipe of unlinkedRecipes) {
                let bestMatch: any = null;
                let bestScore = 0;

                for (const product of availableProducts) {
                    if (usedProductIds.has(product.id)) continue;

                    // Exact match (normalized)
                    if (normalizeForExact(recipe.name) === normalizeForExact(product.name)) {
                        bestMatch = product;
                        bestScore = 1.0;
                        break;
                    }

                    // Fuzzy match
                    const score = similarity(recipe.name, product.name);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = product;
                    }
                }

                if (bestMatch && bestScore > 0.15) {
                    usedProductIds.add(bestMatch.id);
                    suggestions.push({
                        recipeId: recipe.id,
                        recipeName: recipe.name,
                        recipePrice: recipe.selling_price,
                        productId: bestMatch.id,
                        productName: bestMatch.name,
                        productPrice: bestMatch.price,
                        score: Math.round(bestScore * 100),
                        confidence: bestScore >= 0.8 ? "high" : bestScore >= 0.4 ? "medium" : "low",
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

// POST: Link/unlink or batch-link
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();

        // Batch link mode
        if (body.batch && Array.isArray(body.links)) {
            let linked = 0;
            for (const link of body.links) {
                const { error } = await supabase
                    .from("recipes")
                    .update({ linked_product_id: link.productId })
                    .eq("id", link.recipeId);
                if (!error) linked++;
            }

            // Sync all linked
            for (const link of body.links) {
                if (!link.productId) continue;
                const { data: recipe } = await supabase
                    .from("recipes")
                    .select("selling_price, total_cost")
                    .eq("id", link.recipeId)
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
                        .eq("id", link.productId);
                }
            }

            return NextResponse.json({ success: true, linked });
        }

        // Single link mode
        const { recipeId, productId } = body;
        const { error } = await supabase
            .from("recipes")
            .update({ linked_product_id: productId })
            .eq("id", recipeId);

        if (error) throw error;

        if (productId) {
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
