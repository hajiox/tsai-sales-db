import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncRecipeItemsForMaster } from "@/lib/recipe-cost-sync";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const normalizeName = (value: unknown) =>
    String(value || "").trim().replace(/[\s\u3000]+/g, " ").toLowerCase();

// Generic database write operations for recipe-related tables
// Handles: ingredients, materials, expenses, recipe_items, recipes
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();
        const { operation, table, id, data, ids, filter, dedupeByName } = body;

        // Allowed tables for safety
        const allowedTables = ["ingredients", "materials", "expenses", "recipe_items", "recipes"];
        if (!allowedTables.includes(table)) {
            return NextResponse.json({ error: `テーブル '${table}' は許可されていません` }, { status: 400 });
        }

        if (operation === "insert") {
            if (dedupeByName === true && table === "ingredients" && data?.name) {
                const normalizedIncomingName = normalizeName(data.name);
                const { data: existingRows, error: existingError } = await supabase
                    .from("ingredients")
                    .select("*")
                    .ilike("name", String(data.name).trim());

                if (existingError) throw existingError;

                const existing = (existingRows || []).find((row: any) => normalizeName(row.name) === normalizedIncomingName);
                if (existing) {
                    const cleanUpdates = Object.fromEntries(
                        Object.entries(data).filter(([, value]) => value !== undefined && value !== null)
                    );
                    const { data: updated, error: updateError } = await supabase
                        .from("ingredients")
                        .update(cleanUpdates)
                        .eq("id", existing.id)
                        .select()
                        .single();

                    if (updateError) throw updateError;
                    return NextResponse.json({ success: true, data: updated, deduped: true });
                }
            }

            const { data: result, error } = await supabase
                .from(table)
                .insert(data)
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, data: result });
        }

        if (operation === "insert_many") {
            const { data: result, error } = await supabase
                .from(table)
                .insert(data)
                .select();
            if (error) throw error;
            return NextResponse.json({ success: true, data: result });
        }

        if (operation === "update") {
            if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

            // 名称変更時はrecipe_itemsのitem_nameも連動更新
            if (data.name && ["ingredients", "materials", "expenses"].includes(table)) {
                // 旧名称を取得
                const { data: oldRecord } = await supabase
                    .from(table)
                    .select("name")
                    .eq("id", id)
                    .single();

                if (oldRecord && oldRecord.name !== data.name) {
                    // recipe_items で旧名称を使っているアイテムを新名称に一括更新
                    const itemType = table === "ingredients"
                        ? "ingredient"
                        : table === "materials"
                            ? "material"
                            : "expense";
                    const { error: syncError } = await supabase
                        .from("recipe_items")
                        .update({ item_name: data.name })
                        .eq("item_name", oldRecord.name)
                        .eq("item_type", itemType);

                    if (syncError) {
                        console.error("recipe_items sync error:", syncError);
                        // 同期エラーは警告のみ、メインの更新は続行
                    }
                }
            }

            const { data: updatedRows, error } = await supabase
                .from(table)
                .update(data)
                .eq("id", id)
                .select("id");
            if (error) throw error;
            if (!updatedRows || updatedRows.length === 0) {
                return NextResponse.json({ error: "更新対象が見つかりません" }, { status: 404 });
            }

            const shouldSyncRecipeCosts =
                ["ingredients", "materials", "expenses"].includes(table) &&
                ["price", "unit_price", "unit_quantity", "tax_included"].some((field) => field in data);
            const syncResult = shouldSyncRecipeCosts
                ? await syncRecipeItemsForMaster(
                    supabase,
                    table === "ingredients"
                        ? "ingredient"
                        : table === "materials"
                            ? "material"
                            : "expense",
                    id,
                )
                : null;

            return NextResponse.json({ success: true, syncResult });
        }

        if (operation === "delete") {
            if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
            const { error } = await supabase.from(table).delete().eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        if (operation === "bulk_update") {
            // Update all rows matching a filter condition
            const { field, value, filterField, filterOp, filterValue } = body;
            let query = supabase.from(table).update({ [field]: value });

            if (filterOp === "is_null") {
                query = query.is(filterField, null);
            } else if (filterOp === "neq") {
                query = query.neq(filterField, filterValue);
            }

            const { error } = await query;
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
