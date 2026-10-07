export type IngredientPackSource = {
  id?: string;
  name: string;
  unit_quantity?: number | string | null;
};

type IngredientPackItem = {
  item_type: string;
  ingredient_id?: string | null;
  item_name: string;
  unit_quantity?: number | string | null;
};

function finiteQuantity(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    return null;
  }
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : null;
}

export function getIngredientPackQuantity(
  item: IngredientPackItem,
  sources: IngredientPackSource[],
  useSnapshot = false,
): number | null {
  if (item.item_type !== "ingredient") return null;

  let value = item.unit_quantity;
  if (!useSnapshot) {
    // A stored ID must never resolve to a different material with the same name.
    const matches = sources.filter((source) => item.ingredient_id
      ? source.id === item.ingredient_id
      : source.name === item.item_name);
    if (matches.length !== 1) return null;
    value = matches[0].unit_quantity;
  }

  const quantity = finiteQuantity(value);
  return quantity !== null && quantity > 0 ? quantity : null;
}

export function calculateIngredientPackRequirement(
  usage: number | string | null | undefined,
  batchSize: number,
  packQuantity: number | null,
): { usedPacks: number; requiredPacks: number } | null {
  const usageQuantity = finiteQuantity(usage);
  const batchQuantity = finiteQuantity(batchSize);
  const pack = finiteQuantity(packQuantity);
  if (usageQuantity === null || usageQuantity < 0
    || batchQuantity === null || batchQuantity < 0
    || pack === null || pack <= 0) return null;
  if (usageQuantity === 0 || batchQuantity === 0) return { usedPacks: 0, requiredPacks: 0 };

  const usedPacks = (usageQuantity * batchQuantity) / pack;
  if (!Number.isFinite(usedPacks)) return null;

  // Multiplication/division can put an exact integer a few ulps above its boundary.
  const tolerance = Math.min(1e-9, Number.EPSILON * Math.max(1, Math.abs(usedPacks)) * 4);
  const nearestInteger = Math.round(usedPacks);
  const roundedPacks = Math.abs(usedPacks - nearestInteger) <= tolerance
    ? nearestInteger
    : usedPacks;
  const requiredPacks = Math.max(1, Math.ceil(roundedPacks));
  return { usedPacks, requiredPacks };
}
