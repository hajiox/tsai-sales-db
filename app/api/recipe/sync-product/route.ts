import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: Fetch all recipes (ネット専用) and all products for linking UI
export async function GET() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Fetch recipes with category "ネット専用"
        const { data: recipes, error: recipesError } = await supabase
            .from("recipes")
            .select("id, name, selling_price, total_cost, linked_product_id, category")
            .eq("category", "ネット専用")
            .order("name");

        if (recipesError) throw recipesError;

        // Fetch all products
        const { data: products, error: productsError } = await supabase
            .from("products")
            .select("id, name, price, profit_rate, series, series_code, product_code")
            .order("series_code")
            .order("product_code");

        if (productsError) throw productsError;

        return NextResponse.json({ recipes: recipes || [], products: products || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Link a recipe to a product (or unlink)
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();
        const { recipeId, productId } = body; // productId can be null to unlink

        // Update the recipe's linked_product_id
        const { error } = await supabase
            .from("recipes")
            .update({ linked_product_id: productId })
            .eq("id", recipeId);

        if (error) throw error;

        // If linking (not unlinking), sync price/profit_rate immediately
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
        // Get all linked recipes
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
