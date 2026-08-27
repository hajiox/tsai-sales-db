import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALLERGEN_DISPLAY_ORDER_2026,
  INGREDIENT_LABEL_RULES_VERSION,
  MANDATORY_ALLERGENS_2026,
  RECOMMENDED_ALLERGENS_2026,
  type IngredientLabelValidationPolicy,
} from "@/lib/ingredient-label-codex";

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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function originLabelPolicy(recipeTree: Record<string, unknown>) {
  const candidates = (Array.isArray(recipeTree.items) ? recipeTree.items : [])
    .map(asObject)
    .filter((item) => item.labelScope === "food_candidate");
  const unknownWeights = candidates.filter((item) => (
    item.estimatedContributionWeight === null
    || item.estimatedContributionWeight === undefined
    || !Number.isFinite(Number(item.estimatedContributionWeight))
  ));
  if (candidates.length === 0 || unknownWeights.length > 0) {
    return {
      scope: "top_level_weight_rank_1_only",
      additionalOrigins: "omit",
      target: null,
      issue: candidates.length === 0
        ? "原産地表示対象となる食品原材料がありません"
        : `重量比較できない原材料があります: ${unknownWeights.map((item) => text(item.name, 300)).join("、")}`,
    };
  }
  const [top] = [...candidates].sort((left, right) => {
    const weightDifference = Number(right.estimatedContributionWeight) - Number(left.estimatedContributionWeight);
    return weightDifference || Number(left.sourceOrder) - Number(right.sourceOrder);
  });
  const source = asObject(top.ingredientSource);
  return {
    scope: "top_level_weight_rank_1_only",
    additionalOrigins: "omit",
    target: {
      sourceOrder: Number(top.sourceOrder),
      itemId: text(top.itemId, 200),
      name: text(top.name, 300),
      itemType: text(top.itemType, 40),
      estimatedContributionWeight: Number(top.estimatedContributionWeight),
      declaredOrigin: text(source.origin, 500) || null,
    },
    issue: source.origin ? null : "重量順位1位の保存済み原産地・製造地がありません",
  };
}

function allergensDeclaredInText(value: unknown) {
  const source = text(value, 4_000);
  if (!source) return [];
  return ALLERGEN_DISPLAY_ORDER_2026.filter((allergen) => {
    if (allergen === "乳成分") {
      return source.includes("乳成分")
        || /(?:^|[、,・／/\s（(])乳(?:由来)?(?:$|[、,・／/\s）)])/.test(source);
    }
    if (allergen === "落花生") return source.includes("落花生") || source.includes("ピーナッツ");
    if (allergen === "卵") return source.includes("卵");
    return source.includes(allergen);
  });
}

function collectSnapshotEvidence(recipeNode: unknown, evidence: { allergens: Set<string>; origins: Map<string, string> }) {
  const recipe = asObject(recipeNode);
  for (const entry of Array.isArray(recipe.items) ? recipe.items : []) {
    const item = asObject(entry);
    if (item.labelScope !== "food_candidate") continue;
    const source = asObject(item.ingredientSource);
    for (const allergen of [
      ...allergensDeclaredInText(source.allergens),
      ...allergensDeclaredInText(source.rawMaterials),
    ]) evidence.allergens.add(allergen);
    const itemId = text(item.itemId, 200);
    const origin = text(source.origin, 500);
    if (itemId && origin) evidence.origins.set(itemId, origin);
    if (item.subrecipe) collectSnapshotEvidence(item.subrecipe, evidence);
  }
}

export function ingredientLabelValidationPolicyFromSnapshot(value: unknown): IngredientLabelValidationPolicy {
  const snapshot = asObject(value);
  const labelPolicy = asObject(snapshot.labelPolicy);
  const originPolicy = asObject(labelPolicy.origin);
  const target = asObject(originPolicy.target);
  const expectedOriginTarget = target.itemId && target.name
    ? {
      itemId: text(target.itemId, 200),
      name: text(target.name, 300),
      declaredOrigin: text(target.declaredOrigin, 500) || null,
    }
    : null;
  const evidence = { allergens: new Set<string>(), origins: new Map<string, string>() };
  collectSnapshotEvidence(snapshot.recipe, evidence);
  return {
    expectedOriginTarget,
    forbiddenOriginTexts: [...evidence.origins.entries()]
      .filter(([itemId]) => itemId !== expectedOriginTarget?.itemId)
      .map(([, origin]) => origin),
    requiredAllergens: ALLERGEN_DISPLAY_ORDER_2026.filter((name) => evidence.allergens.has(name)),
  };
}

export async function buildIngredientLabelSourceSnapshot(supabase: SupabaseClient, recipeId: string) {
  const recipeTree = await loadRecipeNode(supabase, recipeId, 0, [], { value: 0 });
  const snapshotWithoutHash = {
    contractVersion: 2,
    rulesVersion: INGREDIENT_LABEL_RULES_VERSION,
    generatedFrom: "saved_tsa_recipe_and_ingredient_master_only",
    labelPolicy: {
      origin: originLabelPolicy(recipeTree),
      allergens: {
        displayMethod: "collective_review_draft",
        scope: "all_present_supported_current_items",
        mandatory: [...MANDATORY_ALLERGENS_2026],
        recommended: [...RECOMMENDED_ALLERGENS_2026],
      },
    },
    recipe: recipeTree,
  };
  return {
    ...snapshotWithoutHash,
    sourceHash: ingredientLabelSourceHash(snapshotWithoutHash),
  };
}
