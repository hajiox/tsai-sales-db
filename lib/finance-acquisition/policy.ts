import type { EcProfitData, SyncPeriod } from "./types";

export function money(value: unknown, label = "金額"): number {
  if (value == null || value === "") throw new Error(`${label}が欠落しています。`);
  const text = String(value).trim();
  // Japanese account amounts only. Decimal-comma currencies must not silently
  // become a hundredfold JPY value.
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) throw new Error(`${label}の形式が不明です。`);
  const parsed = Number(text.replaceAll(",", ""));
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000_000) throw new Error(`${label}が範囲外です。`);
  return parsed;
}

export function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(record) : []; }

export function assertFullMonth(period: SyncPeriod) {
  if (!/^\d{4}-\d{2}$/.test(period.reportMonth)) throw new Error("対象月はYYYY-MM形式で指定してください。");
  const first = `${period.reportMonth}-01`;
  const [year, month] = period.reportMonth.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (month < 1 || month > 12 || period.startDate !== first || period.endDate !== last) {
    throw new Error("月次精算・広告費APIは月初から月末の期間を指定してください。");
  }
}

export function emptyProfit(channel: EcProfitData["channel"], period: SyncPeriod): EcProfitData {
  return { channel, report_month: period.reportMonth, period_start: period.startDate, period_end: period.endDate,
    report_basis: "mixed", coverage_level: "partial", gross_sales: 0, refunds: 0, platform_fees: 0,
    payment_fees: 0, seller_discounts: 0, seller_coupons: 0, seller_points: 0, shipping_costs: 0,
    other_costs: 0, other_credits: 0, net_payout: null, excluded_marketplace_funded_discounts: 0,
    excluded_ad_costs: 0, source_files: [], notes: "" };
}

function optionalFee(value: unknown, label: string) {
  if (value == null) return 0;
  const amount = money(value, label);
  if (amount < 0) throw new Error(`${label}に負値があります。`);
  return amount;
}
function requiredAmount(value: unknown, label: string) {
  const amount = money(value, label);
  if (amount < 0) throw new Error(`${label}に負値があります。`);
  return amount;
}

// Only documented order fields are included; customer shipping_fee is revenue,
// never a seller carrier cost. Partner group fees are not counted twice.
export function normalizeBaseFinance(orders: unknown[], savings: unknown[], period: SyncPeriod) {
  const data = emptyProfit("base", period);
  const warnings = new Set<string>(["注文月の手数料と振込申請月の入金は一致しません。返金・月額料金・配送実費の全件性は精算原本で補完してください。"]);
  let orderCount = 0;
  let savingCount = 0;
  let payout = 0;
  const paymentFields = ["c_c_payment_transaction", "cvs_payment_transaction", "bt_payment_transaction", "atobarai_payment_transaction", "carrier_payment_transaction", "paypal_payment_transaction", "amazon_payment_transaction", "paypay_payment_transaction", "bnpl_payment_transaction"];
  for (const value of orders) {
    const order = record(value);
    if (order.cancelled || ["cancelled", "unpaid", "unshippable"].includes(String(order.dispatch_status))) continue;
    orderCount++;
    const discount = record(order.order_discount);
    const discountAmount = optionalFee(discount.discount, "BASE割引");
    const fundingValue = discount.is_allocate_user_balance_log;
    const funded = fundingValue === 0 || fundingValue === "0" ? 0 : fundingValue === 1 || fundingValue === "1" ? 1 : NaN;
    if (discountAmount > 0 && funded !== 0 && funded !== 1) {
      warnings.add("負担者を確認できないBASE割引があります。店舗負担額には含めていません。");
      data.coverage_level = "needs_review";
    } else if (funded === 1) data.excluded_marketplace_funded_discounts += discountAmount;
    else data.seller_coupons += discountAmount;
    // total is already discounted; add back only verified seller coupons to
    // retain gross - seller deduction accounting without double deduction.
    data.gross_sales += requiredAmount(order.total, "BASE注文合計") + (funded === 0 ? discountAmount : 0);
    data.platform_fees += optionalFee(record(order.order_charge).collected_fee, "BASEサービス手数料");
    if (record(order.order_group_order_charge).collected_fee != null || record(order.order_group_c_c_payment_transaction).collected_fee != null) {
      warnings.add("販売パートナー注文群の手数料は重複・月跨ぎを避けるため未計上です。");
      data.coverage_level = "needs_review";
    }
    for (const key of paymentFields) {
      const fee = record(order[key]);
      if (fee.status === "cancelled") continue;
      data.payment_fees += optionalFee(fee.collected_fee, `BASE決済手数料 ${key}`);
    }
    for (const charge of records(order.additional_charges)) {
      if (/広告|advertis|promotion/i.test(String(charge.name || ""))) data.excluded_ad_costs += optionalFee(charge.collected_fee, "BASE広告費");
      else data.other_costs += optionalFee(charge.collected_fee, "BASEオプション手数料");
    }
    if (optionalFee(record(order.order_header_coin).discount, "BASEコイン割引") > 0) warnings.add("コイン割引の負担者は注文APIだけでは確定できません。精算原本の確認が必要です。");
    if (records(order.sales_partner_order_brand_charges).length) warnings.add("販売パートナー報酬の負担先を精算原本で確認してください。");
  }
  for (const value of savings) {
    const saving = record(value);
    if (saving.status !== "done") continue;
    savingCount++;
    const fees = optionalFee(saving.administrative_fee, "BASE振込事務手数料")
      + optionalFee(saving.bank_transfer_fee, "BASE振込手数料")
      + optionalFee(saving.early_transfer_fee, "BASEお急ぎ振込手数料");
    data.payment_fees += fees;
    const drawings = requiredAmount(saving.drawings, "BASE振込申請額");
    if (drawings < fees) throw new Error("BASE振込申請額が手数料より小さいため確認が必要です。");
    payout += drawings - fees;
  }
  data.net_payout = savingCount ? round(payout) : null;
  data.source_files = ["official-api-base-orders", "official-api-base-savings"];
  data.notes = [...warnings].join(" ");
  for (const key of Object.keys(data)) if (typeof data[key as keyof EcProfitData] === "number") (data as unknown as Record<string, unknown>)[key] = round(Number(data[key as keyof EcProfitData]));
  return { data, warnings: [...warnings], metadata: { orderCount, completedSavingsCount: savingCount } };
}

export function sameCostTotals(existing: Record<string, unknown>[], incoming: Record<string, unknown>[], costColumn: string, keys: string[]): boolean {
  const aggregate = (rows: Record<string, unknown>[]) => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = JSON.stringify(keys.map((name) => String(row[name] || "")));
      totals.set(key, round((totals.get(key) || 0) + money(row[costColumn] ?? 0)));
    }
    return totals;
  };
  const left = aggregate(existing), right = aggregate(incoming);
  return left.size === right.size && [...left].every(([key, value]) => Math.abs(value - (right.get(key) ?? Infinity)) <= 1);
}
