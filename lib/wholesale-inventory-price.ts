import {
  taxExcludedFromIncluded,
  taxIncludedFromExcluded,
} from "./money";

export type WholesaleInventoryTaxRate = 8 | 10;

export function normalizeWholesaleInventoryTaxRate(
  value: unknown,
): WholesaleInventoryTaxRate {
  return Number(value) === 10 ? 10 : 8;
}

export function wholesaleInventoryPrice(
  retailPriceExclTax: unknown,
  _taxRate: WholesaleInventoryTaxRate = 8,
): number | null {
  if (retailPriceExclTax === null || retailPriceExclTax === undefined || retailPriceExclTax === "") {
    return null;
  }
  const price = Number(retailPriceExclTax);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 0.7 * 100) / 100;
}

export function retailPriceExclTaxFromIncluded(
  retailPriceInclTax: unknown,
  taxRate: WholesaleInventoryTaxRate = 8,
): number | null {
  if (retailPriceInclTax === null || retailPriceInclTax === undefined || retailPriceInclTax === "") {
    return null;
  }
  const price = Number(retailPriceInclTax);
  if (!Number.isFinite(price) || price < 0) return null;
  return taxExcludedFromIncluded(price, taxRate / 100);
}

export function retailPriceInclTaxFromExcluded(
  retailPriceExclTax: unknown,
  taxRate: WholesaleInventoryTaxRate = 8,
): number | null {
  if (retailPriceExclTax === null || retailPriceExclTax === undefined || retailPriceExclTax === "") {
    return null;
  }
  const price = Number(retailPriceExclTax);
  if (!Number.isFinite(price) || price < 0) return null;
  return taxIncludedFromExcluded(price, taxRate / 100);
}
