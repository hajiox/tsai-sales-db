import type { SupabaseClient } from "@supabase/supabase-js";

export const EC_PROFIT_CHANNELS = [
  "amazon",
  "rakuten",
  "yahoo",
  "mercari",
  "base",
  "qoo10",
  "tiktok",
] as const;

export type EcProfitChannel = (typeof EC_PROFIT_CHANNELS)[number];

const COUNT_COLUMNS: Record<EcProfitChannel, string> = {
  amazon: "amazon_count",
  rakuten: "rakuten_count",
  yahoo: "yahoo_count",
  mercari: "mercari_count",
  base: "base_count",
  qoo10: "qoo10_count",
  tiktok: "tiktok_count",
};

const COST_FIELDS = [
  "refunds",
  "platform_fees",
  "payment_fees",
  "seller_discounts",
  "seller_coupons",
  "seller_points",
  "shipping_costs",
  "other_costs",
  "other_credits",
] as const;
const ALL_ESTIMATE_FIELDS = [...COST_FIELDS, "excluded_ad_costs"] as const;

type CostField = (typeof COST_FIELDS)[number];
type EstimateAmounts = Record<CostField, number> & { excluded_ad_costs: number };

type Baseline = {
  month: string;
  grossSales: number;
  amounts: EstimateAmounts;
  source: string;
};

// Verified from the official Rakuten BillPay monthly CSV for 2026-06.
// BillPay fee rows are tax-exclusive, so 10% rows are normalized here.
const OFFICIAL_BASELINES: Partial<Record<EcProfitChannel, Baseline>> = {
  // Qoo10's official fee table lists food at 10%; Japanese sellers also pay
  // 10% consumption tax on that fee, for an effective 11% estimate.
  qoo10: {
    month: "official-rate",
    grossSales: 100,
    source: "Qoo10 official food-category fee (10% fee + 10% tax on the fee)",
    amounts: {
      refunds: 0,
      platform_fees: 11,
      payment_fees: 0,
      seller_discounts: 0,
      seller_coupons: 0,
      seller_points: 0,
      shipping_costs: 0,
      other_costs: 0,
      other_credits: 0,
      excluded_ad_costs: 0,
    },
  },
  rakuten: {
    month: "2026-06",
    grossSales: 3_957_242,
    source: "楽天BillPay 2026年6月公式月次収支CSV",
    amounts: {
      refunds: 0,
      platform_fees: 177_240,
      payment_fees: 148_047,
      seller_discounts: 0,
      seller_coupons: 34_870,
      seller_points: 131_862,
      shipping_costs: 0,
      other_costs: 47_636,
      other_credits: 0,
      excluded_ad_costs: 180_190,
    },
  },
};

export type EcProfitEstimateResult = {
  channel: EcProfitChannel;
  status: "estimated" | "skipped";
  sales: number;
  ecDeductions: number;
  excludedAdCosts: number;
  basisMonths: string[];
  message: string;
};

export async function upsertEcProfitEstimate(input: {
  supabase: SupabaseClient;
  channel: EcProfitChannel;
  reportMonth: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<EcProfitEstimateResult> {
  const { supabase, channel } = input;
  if (!/^\d{4}-\d{2}$/.test(input.reportMonth)) {
    throw new Error("概算対象月が正しくありません");
  }

  const reportDate = `${input.reportMonth}-01`;
  const periodStart = input.periodStart || reportDate;
  const periodEnd = input.periodEnd || lastDayOfMonth(input.reportMonth);
  const { data: existing, error: existingError } = await supabase
    .from("ec_profit_monthly")
    .select("*")
    .eq("channel", channel)
    .eq("report_month", reportDate)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.coverage_level === "complete") {
    return skipped(channel, "公式精算が取得済みのため概算しません");
  }
  const existingRaw = asRecord(existing?.raw_summary);
  const canSupplementIncompleteQoo10 = channel === "qoo10"
    && existing?.coverage_level !== "complete"
    && !hasCostAmounts(existing);
  if (existing && existingRaw.estimated !== true && hasOfficialAmounts(existing) && !canSupplementIncompleteQoo10) {
    return skipped(channel, "取得済みの公式途中データを概算で上書きしません");
  }

  const sales = await calculateChannelSales(supabase, channel, reportDate);
  if (sales <= 0) {
    return skipped(channel, "当月の商品売上が未登録のため概算できません");
  }

  const history = await loadActualHistory(supabase, channel, reportDate);
  const baseline = OFFICIAL_BASELINES[channel];
  if (history.length === 0 && !baseline) {
    return skipped(channel, "過去の公式精算データがまだありません");
  }

  const basisMonths = history.length > 0
    ? history.map((row) => String(row.report_month).slice(0, 7))
    : [baseline!.month];
  const rates = history.length > 0
    ? ratesFromHistory(history)
    : ratesFromBaseline(baseline!);
  const amounts = Object.fromEntries(
    ALL_ESTIMATE_FIELDS.map((field) => [field, round(sales * rates[field])]),
  ) as EstimateAmounts;
  const ecDeductions = COST_FIELDS
    .filter((field) => field !== "other_credits")
    .reduce((sum, field) => sum + amounts[field], 0) - amounts.other_credits;
  const now = new Date().toISOString();
  const basisLabel = history.length > 0
    ? `過去${history.length}か月の公式精算実績（${basisMonths.join("・")}）`
    : `${baseline!.source}`;
  const note = `${input.reportMonth}は公式費目別明細の照合が未完了のため概算。${basisLabel}の費目別売上比率を当月売上${yen(sales)}へ適用。照合完了後に自動で確定値へ更新します。`;

  const row = {
    channel,
    report_month: reportDate,
    period_start: periodStart,
    period_end: periodEnd,
    report_basis: "mixed",
    coverage_level: "partial",
    gross_sales: sales,
    ...Object.fromEntries(COST_FIELDS.map((field) => [field, amounts[field]])),
    net_payout: null,
    source_job_id: existing?.source_job_id || null,
    source_files: Array.isArray(existing?.source_files) ? existing.source_files : [],
    raw_summary: {
      ...existingRaw,
      estimated: true,
      estimate_version: 1,
      estimate_basis: basisLabel,
      estimate_basis_months: basisMonths,
      estimate_rates: rates,
      estimated_at: now,
      excluded_ad_costs: amounts.excluded_ad_costs,
      official_recheck_required: true,
    },
    notes: note,
    imported_at: now,
    updated_at: now,
  };
  const { error: upsertError } = await supabase
    .from("ec_profit_monthly")
    .upsert(row, { onConflict: "channel,report_month" });
  if (upsertError) throw upsertError;

  return {
    channel,
    status: "estimated",
    sales: round(sales),
    ecDeductions: round(ecDeductions),
    excludedAdCosts: round(amounts.excluded_ad_costs),
    basisMonths,
    message: note,
  };
}

async function calculateChannelSales(
  supabase: SupabaseClient,
  channel: EcProfitChannel,
  reportDate: string,
) {
  const [salesResult, productsResult] = await Promise.all([
    supabase
      .from("web_sales_summary")
      .select("product_id,amazon_count,rakuten_count,yahoo_count,mercari_count,base_count,qoo10_count,tiktok_count,base_amount,unit_price")
      .eq("report_month", reportDate),
    supabase.from("products").select("id,price"),
  ]);
  if (salesResult.error) throw salesResult.error;
  if (productsResult.error) throw productsResult.error;
  const products = new Map((productsResult.data || []).map((row) => [String(row.id), row]));
  let sales = 0;
  for (const row of salesResult.data || []) {
    const quantity = number((row as Record<string, unknown>)[COUNT_COLUMNS[channel]]);
    if (quantity <= 0) continue;
    const product = products.get(String(row.product_id));
    const unitPrice = number(row.unit_price ?? product?.price);
    sales += channel === "base" && number(row.base_amount) > 0
      ? number(row.base_amount)
      : quantity * unitPrice;
  }
  return round(sales);
}

async function loadActualHistory(
  supabase: SupabaseClient,
  channel: EcProfitChannel,
  reportDate: string,
) {
  const { data, error } = await supabase
    .from("ec_profit_monthly")
    .select("report_month,gross_sales,refunds,platform_fees,payment_fees,seller_discounts,seller_coupons,seller_points,shipping_costs,other_costs,other_credits,raw_summary")
    .eq("channel", channel)
    .eq("coverage_level", "complete")
    .lt("report_month", reportDate)
    .order("report_month", { ascending: false })
    .limit(6);
  if (error) throw error;
  return (data || []).filter((row) => number(row.gross_sales) > 0 && asRecord(row.raw_summary).estimated !== true);
}

function ratesFromHistory(history: Array<Record<string, unknown>>) {
  const gross = history.reduce((sum, row) => sum + number(row.gross_sales), 0);
  const rates = Object.fromEntries(COST_FIELDS.map((field) => [
    field,
    history.reduce((sum, row) => sum + number(row[field]), 0) / gross,
  ])) as Record<CostField, number> & { excluded_ad_costs: number };
  rates.excluded_ad_costs = history.reduce(
    (sum, row) => sum + number(asRecord(row.raw_summary).excluded_ad_costs),
    0,
  ) / gross;
  return rates;
}

function ratesFromBaseline(baseline: Baseline) {
  return Object.fromEntries(
    ALL_ESTIMATE_FIELDS.map((field) => [field, baseline.amounts[field] / baseline.grossSales]),
  ) as Record<CostField, number> & { excluded_ad_costs: number };
}

function hasOfficialAmounts(row: Record<string, unknown>) {
  return number(row.gross_sales) > 0
    || hasCostAmounts(row)
    || row.net_payout != null;
}

function hasCostAmounts(row: Record<string, unknown>) {
  return COST_FIELDS.some((field) => number(row[field]) > 0);
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function skipped(channel: EcProfitChannel, message: string): EcProfitEstimateResult {
  return { channel, status: "skipped", sales: 0, ecDeductions: 0, excludedAdCosts: 0, basisMonths: [], message };
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function yen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}
