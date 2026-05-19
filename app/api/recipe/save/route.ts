import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST: Save recipe changes (items + recipe metadata)
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();
        const { recipeId, deletedItemIds, newItems, existingItems, recipeUpdates, replaceAllItems } = body;

        if (!recipeId) {
            return NextResponse.json({ error: "recipeIdが必要です" }, { status: 400 });
        }

        // 1. Delete removed items. Version restore uses a recipe-scoped full replace
        // so it cannot accidentally insert a snapshot on top of existing rows.
        if (replaceAllItems) {
            const { error: delError } = await supabase
                .from("recipe_items")
                .delete()
                .eq("recipe_id", recipeId);
            if (delError) throw delError;
        } else if (deletedItemIds && deletedItemIds.length > 0) {
            const { error: delError } = await supabase
                .from("recipe_items")
                .delete()
                .in("id", deletedItemIds);
            if (delError) throw delError;
        }

        // 2. Insert new items
        if (newItems && newItems.length > 0) {
            const { error: insError } = await supabase.from("recipe_items").insert(
                newItems.map((item: any) => ({
                    recipe_id: recipeId,
                    item_name: item.item_name,
                    item_type: item.item_type,
                    unit_quantity: item.unit_quantity,
                    unit_price: item.unit_price,
                    unit_weight: item.unit_weight,
                    usage_amount: item.usage_amount,
                    cost: item.cost,
                    tax_included: item.tax_included ?? true,
                    ingredient_id: item.ingredient_id || null,
                    material_id: item.material_id || null,
                    intermediate_recipe_id: item.intermediate_recipe_id || null,
                }))
            );
            if (insError) throw insError;
        }

        // 3. Update existing items
        if (existingItems && existingItems.length > 0) {
            for (const item of existingItems) {
                const { error: updError } = await supabase
                    .from("recipe_items")
                    .update({
                        item_name: item.item_name,
                        unit_quantity: item.unit_quantity,
                        unit_price: item.unit_price,
                        unit_weight: item.unit_weight,
                        usage_amount: item.usage_amount,
                        cost: item.cost,
                        tax_included: item.tax_included ?? true,
                        ingredient_id: item.ingredient_id || null,
                        material_id: item.material_id || null,
                        intermediate_recipe_id: item.intermediate_recipe_id || null,
                    })
                    .eq("id", item.id);
                if (updError) throw updError;
            }
        }

        // 4. Update recipe metadata
        if (recipeUpdates && Object.keys(recipeUpdates).length > 0) {
            // numeric カラムの空文字を null に変換（PostgresのDBエラー防止）
            const numericFields = [
                'filling_quantity', 'label_quantity', 'selling_price', 'total_cost',
                'total_weight', 'sterilization_temperature', 'sterilization_time',
                'yield_rate', 'lot_size', 'case_quantity', 'series_code', 'product_code',
            ];
            const sanitized = { ...recipeUpdates };
            for (const f of numericFields) {
                if (f in sanitized && (sanitized[f] === '' || sanitized[f] === undefined)) {
                    sanitized[f] = null;
                }
            }

            const { error: recipeError } = await supabase
                .from("recipes")
                .update(sanitized)
                .eq("id", recipeId);
            if (recipeError) throw recipeError;
        }

        // 5. Auto-sync to linked product
        if (recipeUpdates?.linked_product_id || true) {
            const { data: recipe } = await supabase
                .from("recipes")
                .select("linked_product_id, selling_price")
                .eq("id", recipeId)
                .single();

            if (recipe?.linked_product_id && recipe?.selling_price) {
                const totalCost = recipeUpdates?.total_cost;
                const profitRate = totalCost
                    ? ((recipe.selling_price - totalCost) / recipe.selling_price) * 100
                    : null;
                await supabase
                    .from("products")
                    .update({
                        price: recipe.selling_price,
                        profit_rate: profitRate ? Math.round(profitRate * 10) / 10 : null,
                    })
                    .eq("id", recipe.linked_product_id);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
