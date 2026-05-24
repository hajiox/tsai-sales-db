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
    if (selfShelfLifeOptions.includes(text as typeof selfShelfLifeOptions[number])) return text;

    const hasMonth = (month: number) => new RegExp(`(^|[^0-9])${month}\\s*カ月`).test(text);
    const hasYear = (year: number) => new RegExp(`(^|[^0-9])${year}\\s*年`).test(text);

    if (hasMonth(18)) return "製造から18カ月";
    if (hasMonth(24) || hasYear(2)) return "製造から24カ月";
    if (hasMonth(12) || hasYear(1)) return "製造から12カ月";
    if (text.includes("60日") || hasMonth(2)) return "製造から2カ月";
    return null;
}

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
            for (const f of ['filling_quantity_unit', 'net_content_unit']) {
                if (f in sanitized) {
                    const unit = typeof sanitized[f] === 'string' ? sanitized[f].trim() : '';
                    sanitized[f] = unit || null;
                }
            }
            if (sanitized.category === "自社" && "shelf_life" in sanitized) {
                sanitized.shelf_life = normalizeSelfShelfLife(sanitized.shelf_life);
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
