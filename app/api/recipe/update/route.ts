import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// PATCH: Update recipe fields (category, date, name, series, product_code, etc.)
export async function PATCH(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();
        const { recipeId, updates } = body;

        if (!recipeId || !updates) {
            return NextResponse.json({ error: "recipeIdとupdatesが必要です" }, { status: 400 });
        }

        // Allowed fields to update
        const allowedFields = [
            "name", "category", "is_intermediate", "development_date",
            "selling_price", "series", "series_code", "product_code",
            "linked_product_id", "ingredient_label",
            "manufacturing_notes", "filling_quantity",
            "storage_method", "label_quantity",
            "sterilization_method", "sterilization_temperature", "sterilization_time",
            "amazon_fee_enabled", "total_cost", "total_weight",
            "yield_rate",
        ];

        const safeUpdates: Record<string, any> = {};
        for (const key of Object.keys(updates)) {
            if (allowedFields.includes(key)) {
                safeUpdates[key] = updates[key];
            }
        }

        if (Object.keys(safeUpdates).length === 0) {
            return NextResponse.json({ error: "更新可能なフィールドがありません" }, { status: 400 });
        }

        // Auto-set is_intermediate when category changes
        if ("category" in safeUpdates) {
            safeUpdates.is_intermediate = safeUpdates.category === "中間部品";
        }

        const { error } = await supabase
            .from("recipes")
            .update(safeUpdates)
            .eq("id", recipeId);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Copy/duplicate a recipe
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();
        const { recipeId } = body;

        if (!recipeId) {
            return NextResponse.json({ error: "recipeIdが必要です" }, { status: 400 });
        }

        // 1. Get original recipe
        const { data: original, error: fetchError } = await supabase
            .from("recipes")
            .select("*")
            .eq("id", recipeId)
            .single();

        if (fetchError) throw fetchError;
        if (!original) throw new Error("レシピが見つかりません");

        // 2. Create new recipe (remove id, timestamps, linked_product_id)
        const { id, created_at, updated_at, linked_product_id, ...rest } = original;
        const { data: newRecipe, error: createError } = await supabase
            .from("recipes")
            .insert({ ...rest, name: `${original.name} (コピー)`, linked_product_id: null })
            .select()
            .single();

        if (createError) throw createError;

        // 3. Copy recipe items
        const { data: items } = await supabase
            .from("recipe_items")
            .select("*")
            .eq("recipe_id", recipeId);

        if (items && items.length > 0) {
            const newItems = items.map((item: any) => {
                const { id: itemId, recipe_id, created_at: itemCreated, ...itemRest } = item;
                return { ...itemRest, recipe_id: newRecipe.id };
            });
            const { error: insertError } = await supabase.from("recipe_items").insert(newItems);
            if (insertError) throw insertError;
        }

        return NextResponse.json({ success: true, newRecipeId: newRecipe.id });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
