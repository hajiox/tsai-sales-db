import "server-only";

export type EcProductNameRecipeSnapshot = {
  recipeId: string;
  recipeName: string;
  ecProductName: string;
  linkedProductId: string | null;
  janCode: string | null;
  seriesCode: string | null;
  productCode: string | null;
  fillingQuantity: string | null;
  fillingQuantityUnit: string | null;
  storageMethod: string | null;
};

function nullableText(value: unknown, maxLength: number) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim().slice(0, maxLength);
}

export function normalizeEcProductName(value: unknown) {
  return String(value ?? "").trim().slice(0, 75);
}

export function buildEcProductNameRecipeSnapshot(
  recipe: Record<string, unknown>,
): EcProductNameRecipeSnapshot {
  return {
    recipeId: String(recipe.id || ""),
    recipeName: String(recipe.name || "").trim().slice(0, 200),
    ecProductName: normalizeEcProductName(recipe.ec_product_name),
    linkedProductId: nullableText(recipe.linked_product_id, 100),
    janCode: nullableText(recipe.jan_code, 32),
    seriesCode: nullableText(recipe.series_code, 100),
    productCode: nullableText(recipe.product_code, 100),
    fillingQuantity: nullableText(recipe.filling_quantity, 50),
    fillingQuantityUnit: nullableText(recipe.filling_quantity_unit, 30),
    storageMethod: nullableText(recipe.storage_method, 100),
  };
}

export function ecProductNameSnapshotsMatch(
  left: unknown,
  right: EcProductNameRecipeSnapshot,
) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcProductNameRecipeSnapshot>).every(
    (key) => candidate[key] === right[key],
  );
}

export function ecProductNameRecipeIdentitiesMatch(
  left: unknown,
  right: EcProductNameRecipeSnapshot,
) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcProductNameRecipeSnapshot>)
    .filter((key) => key !== "ecProductName")
    .every((key) => candidate[key] === right[key]);
}
