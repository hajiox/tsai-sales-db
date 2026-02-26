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
            "linked_product_id",
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
