const DEFAULT_REDUCED_TAX_RATE = 0.08;

export function yenFloor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}

export function taxExcludedFromIncluded(value: unknown, taxRate = DEFAULT_REDUCED_TAX_RATE): number {
  return yenFloor(Number(value || 0) / (1 + taxRate));
}

export function taxIncludedFromExcluded(value: unknown, taxRate = DEFAULT_REDUCED_TAX_RATE): number {
  return yenFloor(Number(value || 0) * (1 + taxRate));
}

export function ratePriceFromTaxExcluded(value: unknown, rate: unknown): number {
  return yenFloor(Number(value || 0) * Number(rate || 0));
}

export function wholesalePriceFromTaxIncludedRetail(
  retailPriceInclTax: unknown,
  rate: unknown,
  taxRate = DEFAULT_REDUCED_TAX_RATE,
): number {
  const retailPriceExclTax = taxExcludedFromIncluded(retailPriceInclTax, taxRate);
  return taxIncludedFromExcluded(ratePriceFromTaxExcluded(retailPriceExclTax, rate), taxRate);
}

export function wholesalePriceFromTaxExcludedRetail(
  retailPriceExclTax: unknown,
  rate: unknown,
  taxRate = DEFAULT_REDUCED_TAX_RATE,
): number {
  return taxIncludedFromExcluded(ratePriceFromTaxExcluded(retailPriceExclTax, rate), taxRate);
}
