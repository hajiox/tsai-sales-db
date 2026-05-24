import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const selfShelfLifeOptions = [
    "製造から12カ月",
    "製造から18カ月",
    "製造から24カ月",
    "製造から2カ月",
] as const;

function normalizeSelfShelfLife(value?: string | null) {
    if (!value) return null;
    const text = value
        .trim()
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
        .replace(/ヶ月|か月|ヵ月|ケ月/g, "カ月")
        .replace(/より/g, "から");
    if (text.includes("60日") || /2\s*カ月/.test(text)) return "製造から2カ月";
    if (/18\s*カ月/.test(text)) return "製造から18カ月";
    if (/24\s*カ月/.test(text) || /2\s*年/.test(text)) return "製造から24カ月";
    if (/12\s*カ月/.test(text) || /1\s*年/.test(text)) return "製造から12カ月";
    return selfShelfLifeOptions.includes(text as typeof selfShelfLifeOptions[number]) ? text : null;
}

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
            "linked_product_id", "ingredient_label", "ai_ingredient_label",
            "manufacturing_notes", "filling_quantity", "filling_quantity_unit",
            "storage_method", "label_quantity", "net_content_unit", "shelf_life",
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
        if (safeUpdates.category === "自社" && "shelf_life" in safeUpdates) {
            safeUpdates.shelf_life = normalizeSelfShelfLife(safeUpdates.shelf_life);
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

        // 2. Create new recipe (remove id, timestamps, linked_product_id, product_image_url)
        // product_image_url はrecipe_imagesテーブルで管理されるため、コピーしない
        // （URLだけコピーするとrecipe_imagesにレコードがなく削除できなくなる）
        const { id, created_at, updated_at, linked_product_id, product_image_url, ...rest } = original;
        const { data: newRecipe, error: createError } = await supabase
            .from("recipes")
            .insert({ ...rest, name: `${original.name} (コピー)`, linked_product_id: null, product_image_url: null })
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
