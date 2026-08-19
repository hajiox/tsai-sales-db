// The fiscal year starts in August and closes at the end of the following July.
export const INVENTORY_FISCAL_START_MONTH = 8;

export function normalizeInventoryFiscalYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

export function inventoryFiscalYearFromDate(value: string): number {
  const [year, month] = value.slice(0, 10).split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid inventory date: ${value}`);
  }
  return month >= INVENTORY_FISCAL_START_MONTH ? year + 1 : year;
}

export function currentInventoryFiscalYear(): number {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return inventoryFiscalYearFromDate(date);
}

export function inventoryFiscalRange(fiscalYear: number) {
  const normalized = normalizeInventoryFiscalYear(fiscalYear);
  if (!normalized) throw new Error(`Invalid fiscal year: ${fiscalYear}`);
  return {
    startMonth: `${normalized - 1}-08-01`,
    endMonth: `${normalized}-07-01`,
  };
}

export function inventoryFiscalLabel(fiscalYear: number) {
  const range = inventoryFiscalRange(fiscalYear);
  return `${fiscalYear}年度（${range.startMonth.slice(0, 7).replace("-", "年")}月〜${range.endMonth.slice(0, 7).replace("-", "年")}月）`;
}

export function inventoryFiscalYearOptions(existingYears: number[], before = 7, after = 1) {
  const current = currentInventoryFiscalYear();
  const years = new Set(existingYears.filter((year) => normalizeInventoryFiscalYear(year) !== null));
  for (let year = current - before; year <= current + after; year += 1) years.add(year);
  return Array.from(years).sort((left, right) => right - left);
}
