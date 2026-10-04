/** Prefer complete EC amounts, then a separately verified monthly KPI record. */
export function resolveKpiWebActual(
  reportedAmount: number | null | undefined,
  recordedActual?: number,
  historicalActual?: number,
): number | null {
  if (reportedAmount != null) return reportedAmount;
  const recordedAmount = recordedActual ?? historicalActual;
  if (recordedAmount != null) return recordedAmount;
  // Preserve zero for months without sales rows; a returned incomplete month stays null.
  return reportedAmount === undefined ? 0 : null;
}

/** Incomplete monthly amounts must also remain missing in company totals. */
export function sumKpiAmounts(values: readonly number[]): number;
export function sumKpiAmounts(values: readonly (number | null)[]): number | null;
export function sumKpiAmounts(values: readonly (number | null)[]): number | null {
  return values.some(value => value === null) ? null : (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function kpiRatio(value: number | null, baseline: number | null): number | null {
  return value === null || baseline === null ? null : baseline > 0 ? value / baseline * 100 : 0;
}

export function formatKpiAmount(value: number | null): string {
  return value === null ? '実売額未取得' : value.toLocaleString('ja-JP');
}
