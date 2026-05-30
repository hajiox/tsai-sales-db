import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Allowed fields for update
const ALLOWED_FIELDS = [
    "name",
    "unit_quantity",
    "calories",
    "protein",
    "fat",
    "carbohydrate",
    "sodium",
    "raw_materials",
    "allergens",
    "origin",
    "manufacturer",
    "product_description",
    "nutrition_per",
];

export async function POST(request: Request) {
    try {
        const { target_id, updates } = await request.json();

        if (!target_id || !updates) {
            return NextResponse.json(
                { error: "target_id と updates が必要です" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Filter to only allowed fields and non-null values
        const filteredUpdates: Record<string, any> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (ALLOWED_FIELDS.includes(key) && value !== null && value !== undefined) {
                filteredUpdates[key] = value;
            }
        }

        if (Object.keys(filteredUpdates).length === 0) {
            return NextResponse.json(
                { error: "更新する項目がありません" },
                { status: 400 }
            );
        }

        const shouldSyncRecipeItemNames =
            typeof filteredUpdates.name === "string" && filteredUpdates.name.trim().length > 0;
        let syncedRecipeItems = 0;

        const { data, error } = await supabase
            .from("ingredients")
            .update(filteredUpdates)
            .eq("id", target_id)
            .select();

        if (error) {
            console.error("Update Error:", error);
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        if (shouldSyncRecipeItemNames) {
            const { data: syncedItems, error: syncError } = await supabase
                .from("recipe_items")
                .update({ item_name: filteredUpdates.name })
                .eq("ingredient_id", target_id)
                .select("id");

            if (syncError) {
                console.error("Recipe item name sync error:", syncError);
                return NextResponse.json(
                    { error: syncError.message },
                    { status: 500 }
                );
            }

            syncedRecipeItems = syncedItems?.length || 0;
        }

        return NextResponse.json({
            success: true,
            updated_fields: Object.keys(filteredUpdates),
            synced_recipe_items: syncedRecipeItems,
            data: data?.[0],
        });
    } catch (error: any) {
        console.error("Label Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
