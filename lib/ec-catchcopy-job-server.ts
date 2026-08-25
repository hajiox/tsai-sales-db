import "server-only";

import {
  ecCatchcopyMapsEqual,
  normalizeEcCatchcopiesBySite,
  type EcCatchcopiesBySite,
} from "@/lib/ec-catchcopy-codex";

export type EcCatchcopyRecipeSnapshot = {
  recipeId: string;
  recipeName: string;
  fallbackCatchcopy: string;
  ecCatchcopiesBySite: EcCatchcopiesBySite;
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

export function normalizeFallbackCatchcopy(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 87);
}

export function buildEcCatchcopyRecipeSnapshot(
  recipe: Record<string, unknown>,
): EcCatchcopyRecipeSnapshot {
  const fallbackCatchcopy = normalizeFallbackCatchcopy(recipe.catchcopy);
  return {
    recipeId: String(recipe.id || ""),
    recipeName: String(recipe.name || "").trim().slice(0, 200),
    fallbackCatchcopy,
    ecCatchcopiesBySite: normalizeEcCatchcopiesBySite(
      recipe.ec_catchcopies_by_site,
      fallbackCatchcopy,
    ),
    linkedProductId: nullableText(recipe.linked_product_id, 100),
    janCode: nullableText(recipe.jan_code, 32),
    seriesCode: nullableText(recipe.series_code, 100),
    productCode: nullableText(recipe.product_code, 100),
    fillingQuantity: nullableText(recipe.filling_quantity, 50),
    fillingQuantityUnit: nullableText(recipe.filling_quantity_unit, 30),
    storageMethod: nullableText(recipe.storage_method, 100),
  };
}

export function ecCatchcopySnapshotsMatch(
  left: unknown,
  right: EcCatchcopyRecipeSnapshot,
) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcCatchcopyRecipeSnapshot>)
    .filter((key) => key !== "ecCatchcopiesBySite")
    .every((key) => candidate[key] === right[key])
    && ecCatchcopyMapsEqual(
      candidate.ecCatchcopiesBySite,
      right.ecCatchcopiesBySite,
      right.fallbackCatchcopy,
    );
}

export function ecCatchcopyRecipeIdentitiesMatch(
  left: unknown,
  right: EcCatchcopyRecipeSnapshot,
) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcCatchcopyRecipeSnapshot>)
    .filter((key) => key !== "fallbackCatchcopy" && key !== "ecCatchcopiesBySite")
    .every((key) => candidate[key] === right[key]);
}
