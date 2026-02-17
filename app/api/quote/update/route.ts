import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
            if (update.suggestion_type === "update" && update.matched_id) {
                const table = update.category === "ingredient" ? "ingredients" : "materials";
                const { data, error } = await supabase
                    .from(table)
                    .update({ price: update.extracted_price })
                    .eq("id", update.matched_id)
                    .select();

                results.push({ id: update.matched_id, status: error ? 'error' : 'success', error });
            } else if (update.suggestion_type === "create") {
                const table = update.category === "ingredient" ? "ingredients" : "materials";
                const newRecord = {
                    name: update.original_name,
                    price: update.extracted_price,
                    unit_quantity: 1 // Default
                };
                const { data, error } = await supabase
                    .from(table)
                    .insert([newRecord])
                    .select();

                results.push({ name: update.original_name, status: error ? 'error' : 'success', error, data });
            }
        }

        return NextResponse.json({ results });

    } catch (error: any) {
        console.error("Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
