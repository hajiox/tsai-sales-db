import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
    findExistingMasterByNormalizedName,
    syncRecipeItemsForMaster,
} from "@/lib/recipe-cost-sync";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
    try {
        const { updates } = await request.json(); // Array of { id, type, price, name, isNew }

        if (!updates || !Array.isArray(updates)) {
            return NextResponse.json({ error: "Updates must be an array" }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const results = [];

        for (const update of updates) {
            const table = update.category === "ingredient" ? "ingredients" : "materials";
            const kind = update.category === "ingredient" ? "ingredient" : "material";

            if (update.suggestion_type === "update" && update.matched_id) {
                const { data, error } = await supabase
                    .from(table)
                    .update({ price: update.final_suggestion_price })
                    .eq("id", update.matched_id)
                    .select("id, name, price, unit_quantity, tax_included");

                if (error) {
                    results.push({ id: update.matched_id, status: 'error', error: error.message });
                    continue;
                }
                if (!data || data.length === 0) {
                    results.push({ id: update.matched_id, status: 'error', error: "更新先が見つかりません" });
                    continue;
                }

                const syncResult = await syncRecipeItemsForMaster(supabase, kind, update.matched_id);
                results.push({
                    id: update.matched_id,
                    status: 'success',
                    action: 'updated',
                    syncedRecipeItems: syncResult.updatedItems,
                    affectedRecipes: syncResult.affectedRecipes,
                });
            } else if (update.suggestion_type === "create") {
                const existing = await findExistingMasterByNormalizedName(supabase, table, update.original_name);
                if (existing) {
                    const { data, error } = await supabase
                        .from(table)
                        .update({ price: update.final_suggestion_price })
                        .eq("id", existing.id)
                        .select("id, name, price, unit_quantity, tax_included");

                    if (error) {
                        results.push({ id: existing.id, status: 'error', error: error.message });
                        continue;
                    }
                    if (!data || data.length === 0) {
                        results.push({ id: existing.id, status: 'error', error: "既存材料の更新に失敗しました" });
                        continue;
                    }

                    const syncResult = await syncRecipeItemsForMaster(supabase, kind, existing.id);
                    results.push({
                        id: existing.id,
                        name: existing.name,
                        status: 'success',
                        action: 'updated_existing_duplicate',
                        syncedRecipeItems: syncResult.updatedItems,
                        affectedRecipes: syncResult.affectedRecipes,
                    });
                    continue;
                }

                const newRecord = {
                    name: update.original_name,
                    price: update.final_suggestion_price,
                    unit_quantity: 1 // Default
                };
                const { data, error } = await supabase
                    .from(table)
                    .insert([newRecord])
                    .select();

                results.push({ name: update.original_name, status: error ? 'error' : 'success', error, data });
            }
        }

        const hasError = results.some((result: any) => result.status === "error");
        return NextResponse.json({ results }, { status: hasError ? 500 : 200 });

    } catch (error: any) {
        console.error("Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
