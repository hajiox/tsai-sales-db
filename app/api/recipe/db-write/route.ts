import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Generic database write operations for recipe-related tables
// Handles: ingredients, materials, expenses, recipe_items, recipes
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();
        const { operation, table, id, data, ids, filter } = body;

        // Allowed tables for safety
        const allowedTables = ["ingredients", "materials", "expenses", "recipe_items", "recipes"];
        if (!allowedTables.includes(table)) {
            return NextResponse.json({ error: `テーブル '${table}' は許可されていません` }, { status: 400 });
        }

        if (operation === "insert") {
            const { data: result, error } = await supabase
                .from(table)
                .insert(data)
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, data: result });
        }

        if (operation === "update") {
            if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
            const { error } = await supabase.from(table).update(data).eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true });
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
