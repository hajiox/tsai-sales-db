import type { SyncPeriod } from "./types";

export type ProductSales = { quantity: number; amount: number };
export type SummarySalesRow = { product_id: unknown; [field: string]: unknown };

export function isFullCalendarMonth(period: SyncPeriod): boolean {
  if (!/^\d{4}-\d{2}-01$/.test(period.reportMonth) || period.startDate !== period.reportMonth) return false;
  const first = new Date(`${period.reportMonth}T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || first.toISOString().slice(0, 10) !== period.reportMonth) return false;
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return period.endDate === end;
}

function strictNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))) return;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** Compare totals and every mapped product. Equal grand totals can hide swapped products. */
export function reconcileApiSales(
  channel: string,
  incoming: Map<string, ProductSales>,
  summary: SummarySalesRow[],
  reconciliationRequired: boolean,
): { code: string | null; expected: Array<{ product_id: string; quantity: number; amount: number | null }> } {
  const expected: Array<{ product_id: string; quantity: number; amount: number | null }> = [];
  const baseline = new Map<string, ProductSales>();
  let invalid = false;
  for (const row of summary) {
    const quantity = strictNumber(row[`${channel}_count`]);
    const amount = strictNumber(row[`${channel}_amount`]);
    const productId = typeof row.product_id === "string" ? row.product_id : "";
    // Other channels can own a monthly row even when this channel has no values.
    if ((quantity == null || quantity === 0) && (amount == null || amount === 0)) continue;
    if (!productId || quantity == null || !Number.isSafeInteger(quantity) || quantity < 0 || amount == null) invalid = true;
    expected.push({ product_id: productId, quantity: quantity ?? 0, amount: amount ?? null });
    if (quantity != null && amount != null && productId) baseline.set(productId, { quantity, amount });
  }
  if (invalid) return { code: "saved_actual_amount_unverified", expected };
  if (!baseline.size) return { code: reconciliationRequired ? "order_basis_requires_verified_report" : null, expected };
  const sums = (values: Iterable<ProductSales>) => [...values].reduce((sum, item) => ({
    quantity: sum.quantity + item.quantity, amount: sum.amount + item.amount,
  }), { quantity: 0, amount: 0 });
  const prior = sums(baseline.values());
  const next = sums(incoming.values());
  if (prior.quantity !== next.quantity || Math.abs(prior.amount - next.amount) > 0.000001) {
    return { code: "official_report_total_mismatch", expected };
  }
  const ids = new Set([...baseline.keys(), ...incoming.keys()]);
  for (const id of ids) {
    const left = baseline.get(id) || { quantity: 0, amount: 0 };
    const right = incoming.get(id) || { quantity: 0, amount: 0 };
    if (left.quantity !== right.quantity || Math.abs(left.amount - right.amount) > 0.000001) {
      return { code: "official_report_product_mismatch", expected };
    }
  }
  return { code: null, expected };
}

export function salesApiErrorNeedsReview(code: string): boolean {
  return /(?:required|mismatch|invalid_|unverified|allocation|missing|unsupported)/.test(code);
}
