import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    buildRecipeDatabaseUsages,
    type RecipeDatabaseItemRow,
    type RecipeDatabaseMasterRow,
    type RecipeDatabaseRecipeRow,
} from "@/lib/recipe-database-usages";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function fetchAll<T>(
    supabase: ReturnType<typeof createClient<any>>,
    table: string,
    select: string,
    applyFilters?: (query: any) => any
): Promise<T[]> {
    const pageSize = 1000;
    let from = 0;
    const rows: T[] = [];

    while (true) {
        let query = supabase
            .from(table)
            .select(select)
            .range(from, from + pageSize - 1);

        if (applyFilters) {
            query = applyFilters(query);
        }

        const { data, error } = await query;
        if (error) throw error;

        const chunk = (data || []) as T[];
        rows.push(...chunk);

        if (chunk.length < pageSize) break;
        from += pageSize;
    }

    return rows;
}

export async function GET() {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const [recipes, recipeItems, ingredients, materials] = await Promise.all([
            fetchAll<RecipeDatabaseRecipeRow>(
                supabase,
                "recipes",
                "id, name, category, is_intermediate"
            ),
            fetchAll<RecipeDatabaseItemRow>(
                supabase,
                "recipe_items",
                "recipe_id, item_name, item_type, ingredient_id, material_id, usage_amount, cost"
            ),
            fetchAll<RecipeDatabaseMasterRow>(
                supabase,
                "ingredients",
                "id, name"
            ),
            fetchAll<RecipeDatabaseMasterRow>(
                supabase,
                "materials",
                "id, name"
            ),
        ]);

        return NextResponse.json(buildRecipeDatabaseUsages({
            recipes,
            recipeItems,
            ingredients,
            materials,
        }));
    } catch (error: any) {
        console.error("Recipe database usages error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
