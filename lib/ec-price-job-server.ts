import "server-only";
import { taxIncludedFromExcluded, yenFloor } from "@/lib/money";

export type EcPriceRecipeSnapshot = {
  recipeId: string;
  recipeName: string;
  ecProductName: string | null;
  linkedProductId: string | null;
  janCode: string | null;
  seriesCode: string | null;
  productCode: string | null;
  fillingQuantity: string | null;
  fillingQuantityUnit: string | null;
  storageMethod: string | null;
  newPriceExTax: number;
  newPriceInclTax: number;
};

function nullableText(value: unknown, maxLength: number) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim().slice(0, maxLength);
}

export function buildEcPriceRecipeSnapshot(recipe: Record<string, unknown>): EcPriceRecipeSnapshot {
  const storedPriceExTax = Number(recipe.selling_price);
  const newPriceExTax = yenFloor(storedPriceExTax);
  return {
    recipeId: String(recipe.id || ""),
    recipeName: String(recipe.name || "").trim().slice(0, 200),
    ecProductName: nullableText(recipe.ec_product_name, 200),
    linkedProductId: nullableText(recipe.linked_product_id, 100),
    janCode: nullableText(recipe.jan_code, 32),
    seriesCode: nullableText(recipe.series_code, 100),
    productCode: nullableText(recipe.product_code, 100),
    fillingQuantity: nullableText(recipe.filling_quantity, 50),
    fillingQuantityUnit: nullableText(recipe.filling_quantity_unit, 30),
    storageMethod: nullableText(recipe.storage_method, 100),
    newPriceExTax,
    newPriceInclTax: taxIncludedFromExcluded(storedPriceExTax),
  };
}

export function ecPriceSnapshotsMatch(left: unknown, right: EcPriceRecipeSnapshot) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcPriceRecipeSnapshot>).every(
    (key) => candidate[key] === right[key],
  );
}

export function ecPriceRecipeIdentitiesMatch(left: unknown, right: EcPriceRecipeSnapshot) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcPriceRecipeSnapshot>)
    .filter((key) => key !== "newPriceExTax" && key !== "newPriceInclTax")
    .every((key) => candidate[key] === right[key]);
}
