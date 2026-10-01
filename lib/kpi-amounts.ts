/** A missing recorded WEB amount must also remain missing in company KPIs. */
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
