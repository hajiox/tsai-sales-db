import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type RecipeRow = {
    id: string;
    name: string | null;
    category: string | null;
    is_intermediate: boolean | null;
};

type RecipeItemRow = {
    recipe_id: string | null;
    ingredient_id: string | null;
    material_id: string | null;
    usage_amount: number | string | null;
    cost: number | string | null;
};

type UsageSummary = {
    recipeId: string;
    recipeName: string;
    category: string | null;
    isIntermediate: boolean;
    itemCount: number;
    totalUsage: number | null;
    totalCost: number | null;
};

async function fetchAll<T>(
    supabase: ReturnType<typeof createClient>,
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

function toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function roundNullable(value: number | null) {
    if (value === null) return null;
    return Math.round(value * 1000) / 1000;
}

function addUsage(
    target: Record<string, Map<string, UsageSummary>>,
    masterId: string | null,
    item: RecipeItemRow,
    recipeMap: Map<string, RecipeRow>
) {
    if (!masterId || !item.recipe_id) return;

    const recipe = recipeMap.get(item.recipe_id);
    const recipeName = recipe?.name || "(名称未設定レシピ)";
    const usage = toNumber(item.usage_amount);
    const cost = toNumber(item.cost);

    if (!target[masterId]) target[masterId] = new Map();
    const map = target[masterId];
    const current = map.get(item.recipe_id);

    if (current) {
        current.itemCount += 1;
        current.totalUsage = usage === null
            ? current.totalUsage
            : (current.totalUsage || 0) + usage;
        current.totalCost = cost === null
            ? current.totalCost
            : (current.totalCost || 0) + cost;
        return;
    }

    map.set(item.recipe_id, {
        recipeId: item.recipe_id,
        recipeName,
        category: recipe?.category || null,
        isIntermediate: !!recipe?.is_intermediate,
        itemCount: 1,
        totalUsage: usage,
        totalCost: cost,
    });
}

function normalizeUsageMap(source: Record<string, Map<string, UsageSummary>>) {
    const result: Record<string, UsageSummary[]> = {};

    Object.entries(source).forEach(([masterId, usageMap]) => {
        result[masterId] = Array.from(usageMap.values())
            .map(usage => ({
                ...usage,
                totalUsage: roundNullable(usage.totalUsage),
                totalCost: roundNullable(usage.totalCost),
            }))
            .sort((a, b) => {
                const categoryCompare = (a.category || "").localeCompare(b.category || "", "ja");
                if (categoryCompare !== 0) return categoryCompare;
                return a.recipeName.localeCompare(b.recipeName, "ja");
            });
    });

    return result;
}

export async function GET() {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const [recipes, recipeItems] = await Promise.all([
            fetchAll<RecipeRow>(
                supabase,
                "recipes",
                "id, name, category, is_intermediate"
            ),
            fetchAll<RecipeItemRow>(
                supabase,
                "recipe_items",
                "recipe_id, ingredient_id, material_id, usage_amount, cost"
            ),
        ]);

        const recipeMap = new Map(recipes.map(recipe => [recipe.id, recipe]));
        const ingredients: Record<string, Map<string, UsageSummary>> = {};
        const materials: Record<string, Map<string, UsageSummary>> = {};

        recipeItems.forEach(item => {
            addUsage(ingredients, item.ingredient_id, item, recipeMap);
            addUsage(materials, item.material_id, item, recipeMap);
        });

        return NextResponse.json({
            ingredients: normalizeUsageMap(ingredients),
            materials: normalizeUsageMap(materials),
        });
    } catch (error: any) {
        console.error("Recipe database usages error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
