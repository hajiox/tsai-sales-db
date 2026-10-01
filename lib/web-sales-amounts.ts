export const WEB_SALES_CHANNELS = ["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"] as const;
export type WebSalesChannel = (typeof WEB_SALES_CHANNELS)[number];
type AmountRow = Partial<Record<`${WebSalesChannel}_amount` | `${WebSalesChannel}_count`, unknown>>;

type EcDeductionAdjustment<T extends number | null> = {
  ecDeductions: T;
  sellerDiscountsIncludedInSales?: number;
  ecDeductionAdjustmentNote?: string;
};

export function adjustWebSalesEcDeductions(channel: WebSalesChannel, rawEcDeductions: number, sellerDiscounts: number): EcDeductionAdjustment<number>;
export function adjustWebSalesEcDeductions(channel: WebSalesChannel, rawEcDeductions: number | null, sellerDiscounts: number | null): EcDeductionAdjustment<number | null>;
export function adjustWebSalesEcDeductions(channel: WebSalesChannel, rawEcDeductions: number | null, sellerDiscounts: number | null): EcDeductionAdjustment<number | null> {
  // TikTok's saved SKU amount already subtracts seller SKU discounts. Keep
  // settlement evidence intact; only remove that discount from profit costs.
  const includedDiscount = channel === "tiktok" ? sellerDiscounts : 0;
  return {
    ecDeductions: rawEcDeductions == null || includedDiscount == null ? null : rawEcDeductions - includedDiscount,
    ...(includedDiscount != null && includedDiscount > 0 ? {
      sellerDiscountsIncludedInSales: includedDiscount,
      ecDeductionAdjustmentNote: "TikTokの店舗負担割引は保存実売額に反映済みのため、利益計算のEC控除から除外しています。精算原本の内訳は保持しています。",
    } : {}),
  };
}

function finite(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getWebSalesSavedUnitCost(row: { unit_cost_ex_ec?: unknown; unit_price?: unknown; unit_profit_rate?: unknown }): number | null {
  const cost = finite(row.unit_cost_ex_ec);
  if (cost == null || cost <= 0) return null;
  if ((finite(row.unit_profit_rate) ?? 0) === 0 && cost === finite(row.unit_price)) return null;
  return cost;
}

export function summarizeWebSalesChannel(rows: readonly (AmountRow & { product_id?: unknown; unit_cost_ex_ec?: unknown; unit_price?: unknown; unit_profit_rate?: unknown })[], channel: WebSalesChannel) {
  let quantity = 0;
  let sales = 0;
  let productCost = 0;
  const missingAmountProducts: string[] = [];
  const missingCostProducts: string[] = [];
  for (const row of rows) {
    const count = finite(row[`${channel}_count`]) ?? 0;
    if (count <= 0) continue;
    quantity += count;
    const amount = resolveWebSalesAmount(row, channel);
    const cost = getWebSalesSavedUnitCost(row);
    if (amount == null) missingAmountProducts.push(String(row.product_id)); else sales += amount;
    if (cost == null) missingCostProducts.push(String(row.product_id)); else productCost += count * cost;
  }
  return {
    quantity,
    sales: missingAmountProducts.length ? null : sales,
    productCost: missingCostProducts.length ? null : productCost,
    amountComplete: missingAmountProducts.length === 0,
    costComplete: missingCostProducts.length === 0,
    missingAmountProducts,
    missingCostProducts,
  };
}

/** Official saved merchandise revenue. Missing sold revenue is never a price estimate. */
export function resolveWebSalesAmount(row: AmountRow, channel: WebSalesChannel): number | null {
  const amount = finite(row[`${channel}_amount`]);
  if (amount != null) return amount;
  return finite(row[`${channel}_count`]) === 0 ? 0 : null;
}

export function getWebSalesMissingAmountChannels(row: AmountRow): WebSalesChannel[] {
  return WEB_SALES_CHANNELS.filter(channel => resolveWebSalesAmount(row, channel) == null);
}

export function sumWebSalesAmounts(row: AmountRow): number | null {
  const amounts = WEB_SALES_CHANNELS.map(channel => resolveWebSalesAmount(row, channel));
  return amounts.some(amount => amount == null) ? null : (amounts as number[]).reduce((sum, amount) => sum + amount, 0);
}

export function getWebSalesAverageUnitPrice(row: AmountRow, channel: WebSalesChannel): number | null {
  const quantity = finite(row[`${channel}_count`]);
  const amount = resolveWebSalesAmount(row, channel);
  return quantity != null && quantity > 0 && amount != null ? amount / quantity : null;
}
