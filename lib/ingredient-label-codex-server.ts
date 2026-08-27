import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INGREDIENT_LABEL_RULES_VERSION } from "@/lib/ingredient-label-codex";

const MAX_DEPTH = 4;
const MAX_ITEMS = 160;

type RecipeItemRow = {
  id: string;
  item_name: string;
  item_type: string;
  ingredient_id: string | null;
  intermediate_recipe_id: string | null;
  unit_quantity: number | string | null;
  unit_weight: number | string | null;
  usage_amount: number | string | null;
};

type IngredientRow = {
  id: string;
  name: string;
  raw_materials: string | null;
  allergens: string | null;
  origin: string | null;
  manufacturer: string | null;
  product_description: string | null;
};

function text(value: unknown, maxLength = 4_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortedObject(entry)]),
  );
}

export function ingredientLabelSourceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(sortedObject(value)), "utf8").digest("hex");
}

function estimatedContributionWeight(item: RecipeItemRow) {
  const usage = numberOrNull(item.usage_amount);
  const unitQuantity = numberOrNull(item.unit_quantity);
  const unitWeight = numberOrNull(item.unit_weight);
  if (usage === null) return null;
  if ((item.item_type === "intermediate" || item.item_type === "product")
    && unitQuantity !== -1 && unitWeight !== null && unitWeight > 0) {
    return usage * unitWeight;
  }
  return usage;
}

async function loadIngredientSources(supabase: SupabaseClient, items: RecipeItemRow[]) {
  const ids = [...new Set(items.map((item) => item.ingredient_id).filter((id): id is string => Boolean(id)))];
  const unresolvedNames = [...new Set(items
    .filter((item) => item.item_type === "ingredient" && !item.ingredient_id && text(item.item_name))
    .map((item) => text(item.item_name, 300)))];
  const columns = "id,name,raw_materials,allergens,origin,manufacturer,product_description";
  const [byIdResult, byNameResult] = await Promise.all([
    ids.length > 0
      ? supabase.from("ingredients").select(columns).in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    unresolvedNames.length > 0
      ? supabase.from("ingredients").select(columns).in("name", unresolvedNames)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byIdResult.error) throw byIdResult.error;
  if (byNameResult.error) throw byNameResult.error;
  const byId = new Map((byIdResult.data || []).map((row) => [String(row.id), row as IngredientRow]));
  const byName = new Map<string, IngredientRow[]>();
  for (const row of (byNameResult.data || []) as IngredientRow[]) {
    const rows = byName.get(row.name) || [];
    rows.push(row);
    byName.set(row.name, rows);
  }
  return { byId, byName };
}

function ingredientSourceView(item: RecipeItemRow, sources: Awaited<ReturnType<typeof loadIngredientSources>>) {
  const idMatch = item.ingredient_id ? sources.byId.get(item.ingredient_id) : null;
  const exactMatches = !item.ingredient_id ? sources.byName.get(text(item.item_name, 300)) || [] : [];
  const match = idMatch || (exactMatches.length === 1 ? exactMatches[0] : null);
  const resolution = idMatch ? "ingredient_id" : exactMatches.length === 1 ? "exact_name" : exactMatches.length > 1 ? "ambiguous_exact_name" : "unresolved";
  return {
    resolution,
    ingredientId: match?.id || item.ingredient_id || null,
    masterName: match ? text(match.name, 300) : null,
    rawMaterials: match ? text(match.raw_materials) || null : null,
    allergens: match ? text(match.allergens, 1_000) || null : null,
    origin: match ? text(match.origin, 500) || null : null,
    manufacturer: match ? text(match.manufacturer, 500) || null : null,
    productDescription: match ? text(match.product_description, 1_000) || null : null,
  };
}

async function loadRecipeNode(
  supabase: SupabaseClient,
  recipeId: string,
  depth: number,
  trail: string[],
  itemCounter: { value: number },
): Promise<Record<string, unknown>> {
  if (depth > MAX_DEPTH) {
    return { recipeId, issue: `中間部品の展開が${MAX_DEPTH}階層を超えました` };
  }
  if (trail.includes(recipeId)) {
    return { recipeId, issue: "中間部品レシピが循環参照しています" };
  }
  const [recipeResult, itemsResult] = await Promise.all([
    supabase.from("recipes").select("id,name,category,series,total_weight,is_intermediate").eq("id", recipeId).single(),
    supabase.from("recipe_items")
      .select("id,item_name,item_type,ingredient_id,intermediate_recipe_id,unit_quantity,unit_weight,usage_amount")
      .eq("recipe_id", recipeId)
      .order("usage_amount", { ascending: false }),
  ]);
  if (recipeResult.error || !recipeResult.data) throw new Error(`レシピを取得できません: ${recipeId}`);
  if (itemsResult.error) throw itemsResult.error;
  const items = (itemsResult.data || []) as RecipeItemRow[];
  itemCounter.value += items.length;
  if (itemCounter.value > MAX_ITEMS) throw new Error(`原材料の展開件数が上限${MAX_ITEMS}件を超えました`);
  const sources = await loadIngredientSources(supabase, items);
  const nextTrail = [...trail, recipeId];
  const itemViews = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const isFoodCandidate = ["ingredient", "intermediate", "product"].includes(item.item_type);
    const source = item.item_type === "ingredient" ? ingredientSourceView(item, sources) : null;
    const subrecipe = item.intermediate_recipe_id && ["intermediate", "product"].includes(item.item_type)
      ? await loadRecipeNode(supabase, item.intermediate_recipe_id, depth + 1, nextTrail, itemCounter)
      : null;
    itemViews.push({
      sourceOrder: index + 1,
      itemId: item.id,
      name: text(item.item_name, 300),
      itemType: text(item.item_type, 40),
      labelScope: isFoodCandidate ? "food_candidate" : "excluded_non_food_cost",
      usageAmount: numberOrNull(item.usage_amount),
      unitQuantity: numberOrNull(item.unit_quantity),
      unitWeight: numberOrNull(item.unit_weight),
      estimatedContributionWeight: estimatedContributionWeight(item),
      ingredientSource: source,
      subrecipe,
      issue: item.item_type === "ingredient" && source?.resolution !== "ingredient_id" && source?.resolution !== "exact_name"
        ? "食材マスターを安全に特定できません"
        : ["intermediate", "product"].includes(item.item_type) && !item.intermediate_recipe_id
          ? "中間部品または商品レシピへの参照がありません"
          : null,
    });
  }
  return {
    recipeId: String(recipeResult.data.id),
    name: text(recipeResult.data.name, 300),
    category: text(recipeResult.data.category, 100) || null,
    series: text(recipeResult.data.series, 120) || null,
    totalWeight: numberOrNull(recipeResult.data.total_weight),
    isIntermediate: Boolean(recipeResult.data.is_intermediate),
    items: itemViews,
  };
}

export async function buildIngredientLabelSourceSnapshot(supabase: SupabaseClient, recipeId: string) {
  const recipeTree = await loadRecipeNode(supabase, recipeId, 0, [], { value: 0 });
  const snapshotWithoutHash = {
    contractVersion: 1,
    rulesVersion: INGREDIENT_LABEL_RULES_VERSION,
    generatedFrom: "saved_tsa_recipe_and_ingredient_master_only",
    recipe: recipeTree,
  };
  return {
    ...snapshotWithoutHash,
    sourceHash: ingredientLabelSourceHash(snapshotWithoutHash),
  };
}
