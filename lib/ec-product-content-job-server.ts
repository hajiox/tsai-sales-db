import "server-only";

import {
  buildEcProductContents,
  ecProductContentValuesEqual,
  normalizeEcProductContentText,
  toSquareProductPoints,
  type EcProductContentTarget,
  type EcProductContentTargetValue,
} from "@/lib/ec-product-content-codex";

export type EcProductContentRecipeSnapshot = {
  recipeId: string;
  recipeName: string;
  productPoints: string;
  webDescription: string;
  ecProductName: string | null;
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

export function buildEcProductContentRecipeSnapshot(
  recipe: Record<string, unknown>,
): EcProductContentRecipeSnapshot {
  return {
    recipeId: String(recipe.id || ""),
    recipeName: String(recipe.name || "").trim().slice(0, 200),
    productPoints: toSquareProductPoints(recipe.product_points),
    webDescription: normalizeEcProductContentText(recipe.web_description),
    ecProductName: nullableText(recipe.ec_product_name, 75),
    linkedProductId: nullableText(recipe.linked_product_id, 100),
    janCode: nullableText(recipe.jan_code, 32),
    seriesCode: nullableText(recipe.series_code, 100),
    productCode: nullableText(recipe.product_code, 100),
    fillingQuantity: nullableText(recipe.filling_quantity, 50),
    fillingQuantityUnit: nullableText(recipe.filling_quantity_unit, 30),
    storageMethod: nullableText(recipe.storage_method, 100),
  };
}

export function ecProductContentSnapshotsMatch(
  left: unknown,
  right: EcProductContentRecipeSnapshot,
) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcProductContentRecipeSnapshot>)
    .every((key) => candidate[key] === right[key]);
}

export function buildEcProductContentTargetMap(
  targets: EcProductContentTarget[],
  snapshot: EcProductContentRecipeSnapshot,
): Record<EcProductContentTarget, EcProductContentTargetValue> {
  return buildEcProductContents(targets, snapshot.productPoints, snapshot.webDescription);
}

export function ecProductContentTargetMapsMatch(
  left: unknown,
  right: Record<EcProductContentTarget, EcProductContentTargetValue>,
  targets: EcProductContentTarget[],
) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return targets.every((target) => ecProductContentValuesEqual(candidate[target], right[target]));
}
