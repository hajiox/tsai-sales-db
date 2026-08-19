import { taxIncludedFromExcluded } from "@/lib/money";
import { syncRecipeLinkedProductPrices } from "@/lib/recipe-linked-product-prices";

export type MasterKind = "ingredient" | "material" | "expense";

const TAX_MULTIPLIER: Record<MasterKind, number> = {
  ingredient: 1.08,
  material: 1.1,
  expense: 1.1,
};

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function roundRecipeCost(value: unknown, decimals = 4): number {
  const n = toNumber(value);
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function normalizeMasterName(value: unknown): string {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000\t\r\n]/g, "")
    .replace(/[【】\[\]（）()・･\-ー_／/]/g, "")
    .replace(/原材料$/g, "")
    .replace(/税込|税別/g, "");
}

export function calculateRecipeItemCost(params: {
  itemType: string;
  usageAmount: unknown;
  unitPrice: unknown;
  unitQuantity?: unknown;
  unitWeight?: unknown;
  taxIncluded?: boolean | null;
}): number {
  const usage = toNumber(params.usageAmount);
  const price = toNumber(params.unitPrice);
  const unitQuantity = toNumber(params.unitQuantity, 1) || 1;
  const unitWeight = toNumber(params.unitWeight);
  const type = params.itemType;

  if (type === "intermediate" || type === "product") {
    if (unitQuantity === -1 && unitWeight > 0) {
      return roundRecipeCost((usage / unitWeight) * price);
    }
    return roundRecipeCost(usage * price);
  }

  const kind: MasterKind = type === "expense"
    ? "expense"
    : type === "material"
      ? "material"
      : "ingredient";
  const taxMultiplier = params.taxIncluded === false ? TAX_MULTIPLIER[kind] : 1;

  if (kind === "material" || kind === "expense") {
    return roundRecipeCost(usage * price * taxMultiplier);
  }

  return roundRecipeCost(usage * (price / unitQuantity) * taxMultiplier);
}

export async function findExistingMasterByNormalizedName(
  supabase: any,
  table: "ingredients" | "materials",
  name: string,
  excludeId?: string | null,
) {
  const normalized = normalizeMasterName(name);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from(table)
    .select("id, name, price, unit_quantity, tax_included")
    .limit(10000);
  if (error) throw error;

  return (data || []).find(
    (row: any) => row.id !== excludeId && normalizeMasterName(row.name) === normalized,
  ) || null;
}

export async function recalculateRecipeTotalCost(supabase: any, recipeId: string) {
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id, selling_price, amazon_fee_enabled")
    .eq("id", recipeId)
    .maybeSingle();
  if (recipeError) throw recipeError;
  if (!recipe) return null;

  const { data: items, error: itemError } = await supabase
    .from("recipe_items")
    .select("item_type, item_name, cost")
    .eq("recipe_id", recipeId);
  if (itemError) throw itemError;

  const baseCost = (items || [])
    .filter((item: any) => !(item.item_type === "expense" && item.item_name === "Amazon手数料"))
    .reduce((sum: number, item: any) => sum + toNumber(item.cost), 0);

  const amazonFee = recipe.amazon_fee_enabled && recipe.selling_price
    ? Math.round(taxIncludedFromExcluded(recipe.selling_price) * 0.1)
    : 0;
  const totalCost = roundRecipeCost(baseCost + amazonFee);

  const { error: updateError } = await supabase
    .from("recipes")
    .update({ total_cost: totalCost })
    .eq("id", recipeId);
  if (updateError) throw updateError;

  await syncRecipeLinkedProductPrices(supabase, recipeId);
  return totalCost;
}

export async function syncRecipeItemsForMaster(
  supabase: any,
  kind: MasterKind,
  masterId: string,
) {
  const table = kind === "ingredient"
    ? "ingredients"
    : kind === "material"
      ? "materials"
      : "expenses";
  const idColumn = kind === "ingredient"
    ? "ingredient_id"
    : kind === "material"
      ? "material_id"
      : "expense_id";
  const priceColumn = kind === "expense" ? "unit_price" : "price";

  const { data: master, error: masterError } = await supabase
    .from(table)
    .select(`id, name, ${priceColumn}, unit_quantity, tax_included`)
    .eq("id", masterId)
    .maybeSingle();
  if (masterError) throw masterError;
  if (!master) throw new Error("更新先マスターが見つかりません");

  const price = toNumber(master[priceColumn]);
  const unitQuantity = toNumber(master.unit_quantity, 1) || 1;
  const taxIncluded = master.tax_included !== false;

  const { data: rows, error: rowsError } = await supabase
    .from("recipe_items")
    .select("id, recipe_id, item_type, usage_amount, unit_quantity, unit_price, unit_weight, cost, tax_included")
    .eq(idColumn, masterId);
  if (rowsError) throw rowsError;

  const affectedRecipeIds = new Set<string>();
  let updatedItems = 0;

  for (const row of rows || []) {
    const nextCost = calculateRecipeItemCost({
      itemType: kind,
      usageAmount: row.usage_amount,
      unitPrice: price,
      unitQuantity: kind === "ingredient" ? unitQuantity : row.unit_quantity,
      unitWeight: row.unit_weight,
      taxIncluded,
    });

    const nextData: Record<string, any> = {
      unit_price: price,
      cost: nextCost,
      tax_included: taxIncluded,
    };
    if (kind === "ingredient") {
      nextData.unit_quantity = unitQuantity;
    }

    const priceChanged = Math.abs(toNumber(row.unit_price) - price) > 0.0001;
    const costChanged = Math.abs(toNumber(row.cost) - nextCost) > 0.0001;
    const taxChanged = (row.tax_included !== false) !== taxIncluded;
    const qtyChanged = kind === "ingredient" && Math.abs(toNumber(row.unit_quantity) - unitQuantity) > 0.0001;
    if (!priceChanged && !costChanged && !taxChanged && !qtyChanged) continue;

    const { data: updated, error: updateError } = await supabase
      .from("recipe_items")
      .update(nextData)
      .eq("id", row.id)
      .select("id, recipe_id");
    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new Error("レシピ明細の更新に失敗しました");
    }

    updatedItems++;
    if (row.recipe_id) affectedRecipeIds.add(row.recipe_id);
  }

  for (const recipeId of affectedRecipeIds) {
    await recalculateRecipeTotalCost(supabase, recipeId);
  }

  return {
    updatedItems,
    affectedRecipes: affectedRecipeIds.size,
    master,
  };
}
