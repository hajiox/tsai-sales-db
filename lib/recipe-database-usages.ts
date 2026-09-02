export type RecipeDatabaseRecipeRow = {
    id: string;
    name: string | null;
    category: string | null;
    is_intermediate: boolean | null;
};

export type RecipeDatabaseItemRow = {
    recipe_id: string | null;
    item_name: string | null;
    item_type: string | null;
    ingredient_id: string | null;
    material_id: string | null;
    usage_amount: number | string | null;
    cost: number | string | null;
};

export type RecipeDatabaseMasterRow = {
    id: string;
    name: string | null;
};

export type RecipeDatabaseUsageSummary = {
    recipeId: string;
    recipeName: string;
    category: string | null;
    isIntermediate: boolean;
    itemCount: number;
    totalUsage: number | null;
    totalCost: number | null;
};

type UsageMap = Record<string, Map<string, RecipeDatabaseUsageSummary>>;

function normalizedExactName(value: string | null | undefined) {
    return String(value || "").trim();
}

function uniqueMasterIdByName(rows: RecipeDatabaseMasterRow[]) {
    const grouped = new Map<string, string[]>();

    rows.forEach((row) => {
        const name = normalizedExactName(row.name);
        if (!name) return;
        const ids = grouped.get(name) || [];
        ids.push(row.id);
        grouped.set(name, ids);
    });

    return new Map(
        Array.from(grouped.entries())
            .filter(([, ids]) => ids.length === 1)
            .map(([name, ids]) => [name, ids[0]]),
    );
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
    target: UsageMap,
    masterId: string | null,
    item: RecipeDatabaseItemRow,
    recipeMap: Map<string, RecipeDatabaseRecipeRow>,
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

function normalizeUsageMap(source: UsageMap) {
    const result: Record<string, RecipeDatabaseUsageSummary[]> = {};

    Object.entries(source).forEach(([masterId, usageMap]) => {
        result[masterId] = Array.from(usageMap.values())
            .map((usage) => ({
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

export function buildRecipeDatabaseUsages(input: {
    recipes: RecipeDatabaseRecipeRow[];
    recipeItems: RecipeDatabaseItemRow[];
    ingredients: RecipeDatabaseMasterRow[];
    materials: RecipeDatabaseMasterRow[];
}) {
    const recipeMap = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
    const ingredientIdByName = uniqueMasterIdByName(input.ingredients);
    const materialIdByName = uniqueMasterIdByName(input.materials);
    const ingredientUsages: UsageMap = {};
    const materialUsages: UsageMap = {};

    input.recipeItems.forEach((item) => {
        const itemName = normalizedExactName(item.item_name);
        const ingredientId = item.ingredient_id || (
            item.item_type === "ingredient" ? ingredientIdByName.get(itemName) || null : null
        );
        const materialId = item.material_id || (
            item.item_type === "material" ? materialIdByName.get(itemName) || null : null
        );

        addUsage(ingredientUsages, ingredientId, item, recipeMap);
        addUsage(materialUsages, materialId, item, recipeMap);
    });

    return {
        ingredients: normalizeUsageMap(ingredientUsages),
        materials: normalizeUsageMap(materialUsages),
    };
}
