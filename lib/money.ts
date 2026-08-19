const DEFAULT_REDUCED_TAX_RATE = 0.08;

export function yenFloor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}

export function taxExcludedFromIncluded(value: unknown, taxRate = DEFAULT_REDUCED_TAX_RATE): number {
  return yenFloor(Number(value || 0) / (1 + taxRate));
}

export function taxExcludedForExactIncluded(
  value: unknown,
  taxRate = DEFAULT_REDUCED_TAX_RATE,
  precision = 4,
): number {
  const included = yenFloor(value);
  if (included <= 0) return included;

  const multiplier = 1 + taxRate;
  const factor = 10 ** precision;
  const roundedUp = Math.ceil((included / multiplier) * factor - Number.EPSILON) / factor;

  // 税込優先では、丸め戻した税込額が入力値から1円もずれない税抜値を保存する。
  if (taxIncludedFromExcluded(roundedUp, taxRate) === included) return roundedUp;
  return Math.ceil(((included + Number.EPSILON) / multiplier) * factor) / factor;
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
