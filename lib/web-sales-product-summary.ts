import { WEB_SALES_CHANNELS, resolveWebSalesAmount } from "./web-sales-amounts";

export type WebSalesProductSummary = {
  productId: string;
  productName: string;
  seriesCode: number | null;
  seriesName: string;
  count: number;
  sales: number | null;
};

export function buildWebSalesProductSummary(
  salesRows: readonly Record<string, unknown>[],
  products: ReadonlyMap<string, { name?: unknown; series_code?: unknown; series?: unknown }>,
  scope: "month" | "period",
): WebSalesProductSummary[] {
  const grouped = new Map<string, WebSalesProductSummary>();
  for (const row of salesRows) {
    const productId = String(row.product_id);
    const product = products.get(productId);
    let entry = grouped.get(productId);
    if (!entry) {
      const code = product?.series_code;
      entry = {
        productId,
        productName: String(product?.name || "商品名未登録"),
        seriesCode: code == null || code === "" || !Number.isFinite(Number(code)) ? null : Number(code),
        seriesName: String(product?.series || "未分類"),
        count: 0,
        sales: 0,
      };
      grouped.set(productId, entry);
    }
    for (const channel of WEB_SALES_CHANNELS) {
      const count = Number(row[`${channel}_count`] || 0);
      if (!Number.isFinite(count) || (scope === "month" && count <= 0)) continue;
      const amount = resolveWebSalesAmount(row, channel);
      entry.count += count;
      entry.sales = entry.sales === null || amount === null ? null : entry.sales + amount;
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count
    || (b.sales ?? -Infinity) - (a.sales ?? -Infinity)
    || a.productName.localeCompare(b.productName, "ja"));
}
