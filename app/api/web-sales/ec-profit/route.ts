import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { isQoo10SettledDetailUnavailable } from "@/lib/web-sales-codex/ec-profit-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = ["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"] as const;
type Channel = (typeof CHANNELS)[number];
type JobState = {
  status: string;
  progress?: number | null;
  current_step?: string | null;
  error_message?: string | null;
  result?: unknown;
  created_at?: string | null;
  started_at?: string | null;
  heartbeat_at?: string | null;
  completed_at?: string | null;
};

const CHANNEL_LABELS: Record<Channel, string> = {
  amazon: "Amazon",
  rakuten: "楽天市場",
  yahoo: "Yahoo!",
  mercari: "メルカリShops",
  base: "BASE",
  qoo10: "Qoo10",
  tiktok: "TikTok Shop",
};

const countColumn: Record<Channel, string> = {
  amazon: "amazon_count",
  rakuten: "rakuten_count",
  yahoo: "yahoo_count",
  mercari: "mercari_count",
  base: "base_count",
  qoo10: "qoo10_count",
  tiktok: "tiktok_count",
};

type Totals = {
  quantity: number;
  sales: number;
  productCost: number;
  productProfit: number;
  refunds: number;
  platformFees: number;
  paymentFees: number;
  sellerDiscounts: number;
  sellerCoupons: number;
  sellerPoints: number;
  shippingCosts: number;
  otherCosts: number;
  otherCredits: number;
  marketplaceFundedDiscounts: number;
  ecDeductions: number;
  directAdCost: number;
  finalProfit: number;
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const month = new URL(request.url).searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "対象月が正しくありません" }, { status: 400 });
  }

  try {
    const supabase = getWebSalesAutomationServiceClient();
    const reportMonth = `${month}-01`;
    const previousMonth = shiftMonth(month, -1);
    const previousYearMonth = shiftMonth(month, -12);
    const reportMonths = [reportMonth, `${previousMonth}-01`, `${previousYearMonth}-01`];
    const [salesResult, productsResult, settlementResult, adsResult, jobsResult] = await Promise.all([
      supabase
        .from("web_sales_summary")
        .select("report_month,product_id,amazon_count,rakuten_count,yahoo_count,mercari_count,base_count,qoo10_count,tiktok_count,base_amount,unit_price,unit_profit_rate,unit_cost_ex_ec")
        .in("report_month", reportMonths),
      supabase.from("products").select("id,price,profit_rate,series_code,series"),
      supabase.from("ec_profit_monthly").select("*").in("report_month", reportMonths),
      supabase
        .from("advertising_costs")
        .select("report_month,series_code,google_cost,meta_cost,amazon_cost,rakuten_cost,yahoo_cost,other_cost")
        .in("report_month", reportMonths),
      supabase
        .from("web_sales_codex_jobs")
        .select("id,task_key,channel,status,progress,current_step,error_message,result,started_at,heartbeat_at,completed_at,created_at")
        .in("task_key", ["web_sales_import", "ad_cost_import", "ec_profit_import"])
        .eq("report_month", reportMonth)
        .order("created_at", { ascending: false }),
    ]);
    for (const result of [salesResult, productsResult, settlementResult, adsResult, jobsResult]) {
      if (result.error) throw result.error;
    }

    const allSales = (salesResult.data || []) as Array<Record<string, unknown>>;
    const allSettlements = (settlementResult.data || []) as Array<Record<string, unknown>>;
    const allAds = (adsResult.data || []) as Array<Record<string, unknown>>;
    const currentSales = rowsForMonth(allSales, reportMonth);
    const currentSettlements = rowsForMonth(allSettlements, reportMonth);
    const currentAds = rowsForMonth(allAds, reportMonth);
    const products = new Map((productsResult.data || []).map((product) => [String(product.id), product as Record<string, unknown>]));
    const settlements = new Map(currentSettlements.map((row) => [String(row.channel), row]));
    const adTotals = sumAdTotals(currentAds);

    const latestJobs = new Map<string, JobState>();
    for (const job of jobsResult.data || []) {
      const key = `${job.task_key}:${job.channel}`;
      if (!latestJobs.has(key)) latestJobs.set(key, job);
    }

    const channels = CHANNELS.map((channel) => {
      let quantity = 0;
      let sales = 0;
      let productCost = 0;
      for (const row of currentSales) {
        const count = number((row as Record<string, unknown>)[countColumn[channel]]);
        if (count <= 0) continue;
        const fallback = products.get(String(row.product_id));
        const unitPrice = number(row.unit_price ?? fallback?.price);
        const unitProfitRate = number(row.unit_profit_rate ?? fallback?.profit_rate);
        const frozenCost = row.unit_cost_ex_ec == null
          ? unitPrice * (1 - unitProfitRate / 100)
          : number(row.unit_cost_ex_ec);
        quantity += count;
        sales += channel === "base" && number(row.base_amount) > 0
          ? number(row.base_amount)
          : count * unitPrice;
        productCost += count * frozenCost;
      }

      const settlement = settlements.get(channel);
      const settlementJob = latestJobs.get(`ec_profit_import:${channel}`);
      const refunds = number(settlement?.refunds);
      const platformFees = number(settlement?.platform_fees);
      const paymentFees = number(settlement?.payment_fees);
      const sellerDiscounts = number(settlement?.seller_discounts);
      const sellerCoupons = number(settlement?.seller_coupons);
      const sellerPoints = number(settlement?.seller_points);
      const shippingCosts = number(settlement?.shipping_costs);
      const otherCosts = number(settlement?.other_costs);
      const otherCredits = number(settlement?.other_credits);
      const ecDeductions = refunds + platformFees + paymentFees + sellerDiscounts
        + sellerCoupons + sellerPoints + shippingCosts + otherCosts - otherCredits;
      const importedAdCost = channel === "amazon"
        ? adTotals.amazon
        : channel === "rakuten"
          ? adTotals.rakuten
          : channel === "yahoo"
            ? adTotals.yahoo
            : 0;
      const rawSummary = settlement?.raw_summary && typeof settlement.raw_summary === "object"
        ? settlement.raw_summary as Record<string, unknown>
        : {};
      const marketplaceFundedDiscounts = number(rawSummary.excluded_marketplace_funded_discounts);
      // Settlement reports can contain a broader ad total than the dedicated
      // ad importer. Use the larger total so overlapping RPP/SP costs are not
      // counted twice and extra billed ad products are not dropped.
      const settlementAdCost = number(rawSummary.excluded_ad_costs);
      const directAdCost = Math.max(importedAdCost, settlementAdCost);
      const isEstimate = rawSummary.estimated === true;
      const officialReason = settlementReason(settlementJob, channel, settlement?.notes == null ? null : String(settlement.notes));
      const estimateCompatibleOfficialReason = officialReason.replace(
        "月をまたぐ精算書は代用せず、金額も推定していません。",
        "月をまたぐ精算書は代用していません。",
      );
      const displayedReason = isEstimate
        ? `${String(settlement?.notes || "概算値を表示しています")} 公式取得状況: ${estimateCompatibleOfficialReason}`.trim()
        : officialReason;
      const productProfit = sales - productCost;
      // TSA sales use the saved full unit price, so marketplace-funded coupons
      // are already represented in sales. Keep the reimbursement visible for
      // reconciliation, but do not add it to profit a second time.
      const finalProfit = productProfit - ecDeductions - directAdCost;
      const reportedGross = number(settlement?.gross_sales);
      const adjustedReportedGross = reportedGross + marketplaceFundedDiscounts;
      const settlementComplete = settlement?.coverage_level === "complete";
      const settlementStatus = String(settlementJob?.status || (settlementComplete ? "completed" : settlement ? "needs_review" : "not_started"));
      const settlementAttemptedAt = settlementJob?.completed_at || settlementJob?.created_at || null;

      return {
        channel,
        label: CHANNEL_LABELS[channel],
        quantity: round(quantity),
        sales: round(sales),
        productCost: round(productCost),
        productProfit: round(productProfit),
        refunds: round(refunds),
        platformFees: round(platformFees),
        paymentFees: round(paymentFees),
        sellerDiscounts: round(sellerDiscounts),
        sellerCoupons: round(sellerCoupons),
        sellerPoints: round(sellerPoints),
        shippingCosts: round(shippingCosts),
        otherCosts: round(otherCosts),
        otherCredits: round(otherCredits),
        marketplaceFundedDiscounts: round(marketplaceFundedDiscounts),
        ecDeductions: round(ecDeductions),
        directAdCost: round(directAdCost),
        adCostSource: settlementAdCost > importedAdCost ? "settlement" : "advertising_import",
        isEstimate,
        estimateBasis: typeof rawSummary.estimate_basis === "string" ? rawSummary.estimate_basis : null,
        estimateBasisMonths: Array.isArray(rawSummary.estimate_basis_months) ? rawSummary.estimate_basis_months : [],
        finalProfit: round(finalProfit),
        profitRate: sales > 0 ? round(finalProfit / sales * 100, 1) : 0,
        reportedGross: round(reportedGross),
        adjustedReportedGross: round(adjustedReportedGross),
        reconciliationDifference: settlement ? round(adjustedReportedGross - sales) : null,
        netPayout: settlement?.net_payout == null ? null : round(number(settlement.net_payout)),
        reportBasis: settlement?.report_basis || null,
        coverageLevel: settlement?.coverage_level || null,
        importedAt: settlement?.imported_at || null,
        notes: settlement?.notes || null,
        settlementStatus,
        settlementProgress: number(settlementJob?.progress),
        settlementCurrentStep: settlementJob?.current_step || null,
        settlementStartedAt: settlementJob?.started_at || null,
        settlementHeartbeatAt: settlementJob?.heartbeat_at || null,
        settlementAttemptedAt,
        settlementReason: displayedReason,
        retryPolicy: settlementRetryPolicy(channel, settlementStatus, settlementAttemptedAt, displayedReason),
        hasSettlement: Boolean(settlement),
        settlementComplete,
      };
    });

    const sharedAdCost = adTotals.google + adTotals.meta + adTotals.other;
    const totals = channels.reduce<Totals>((sum, row) => {
      for (const key of Object.keys(sum) as (keyof Totals)[]) sum[key] += number(row[key]);
      return sum;
    }, {
      quantity: 0,
      sales: 0,
      productCost: 0,
      productProfit: 0,
      refunds: 0,
      platformFees: 0,
      paymentFees: 0,
      sellerDiscounts: 0,
      sellerCoupons: 0,
      sellerPoints: 0,
      shippingCosts: 0,
      otherCosts: 0,
      otherCredits: 0,
      marketplaceFundedDiscounts: 0,
      ecDeductions: 0,
      directAdCost: 0,
      finalProfit: 0,
    });
    totals.finalProfit -= sharedAdCost;
    const totalAdCost = totals.directAdCost + sharedAdCost;
    const previousMonthSummary = summarizeMonth(previousMonth, allSales, products, allSettlements, allAds);
    const previousYearSummary = summarizeMonth(previousYearMonth, allSales, products, allSettlements, allAds);
    const series = buildSeriesSummary({
      salesRows: currentSales,
      products,
      adRows: currentAds,
      adTotals,
      channels,
      sharedAdCost,
    });
    const incompleteSettlements = channels.filter((row) => !row.settlementComplete);
    const estimatedSettlements = channels.filter((row) => row.isEstimate);
    const missingChannels = incompleteSettlements.map((row) => row.channel);

    return NextResponse.json({
      month,
      channels,
      series,
      totals: {
        ...mapRounded(totals),
        adCost: round(totalAdCost),
        sharedAdCost: round(sharedAdCost),
        profitRate: totals.sales > 0 ? round(totals.finalProfit / totals.sales * 100, 1) : 0,
        reportedGross: round(channels.reduce((sum, row) => sum + row.reportedGross, 0)),
        adjustedReportedGross: round(channels.reduce((sum, row) => sum + row.adjustedReportedGross, 0)),
        netPayout: round(channels.reduce((sum, row) => sum + number(row.netPayout), 0)),
      },
      completeness: {
        isFinal: missingChannels.length === 0,
        completedSettlements: CHANNELS.length - missingChannels.length,
        estimatedSettlements: estimatedSettlements.length,
        totalSettlements: CHANNELS.length,
        missingChannels,
        settlementIssues: incompleteSettlements.map((row) => ({
          channel: row.channel,
          label: row.label,
          status: row.settlementStatus,
          progress: row.settlementProgress,
          currentStep: row.settlementCurrentStep,
          startedAt: row.settlementStartedAt,
          heartbeatAt: row.settlementHeartbeatAt,
          attemptedAt: row.settlementAttemptedAt,
          reason: row.settlementReason,
          isEstimate: row.isEstimate,
          estimateBasis: row.estimateBasis,
          retryPolicy: row.retryPolicy,
        })),
        salesJobs: statusCounts(latestJobs, "web_sales_import"),
        adJobs: statusCounts(latestJobs, "ad_cost_import", ["google", "meta", "rakuten", "yahoo", "amazon"]),
      },
      adCosts: mapRounded(adTotals),
      comparisons: {
        previousMonth: previousMonthSummary,
        previousYear: previousYearSummary,
      },
      calculation: {
        formula: "売上 - 商品原価 - EC控除 - 広告費",
        productCostBasis: "月次保存原価（Amazon手数料などEC控除を除外）",
        sharedAds: "Google・Meta・その他広告は総合利益でのみ控除",
        seriesAllocation: "EC手数料・控除は各EC内のシリーズ売上構成比で按分。広告費はシリーズ紐付けを優先し、未紐付け分のみ売上比で按分。",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "EC利益を集計できません" },
      { status: 500 },
    );
  }
}

function statusCounts(statuses: ReadonlyMap<string, JobState>, taskKey: string, channels: readonly string[] = CHANNELS) {
  const values = channels.map((channel) => statuses.get(`${taskKey}:${channel}`)?.status || "not_started");
  return {
    total: channels.length,
    completed: values.filter((status) => status === "completed").length,
    waiting: values.filter((status) => ["waiting_for_user", "needs_review", "failed"].includes(status)).length,
  };
}

function settlementReason(
  job: { status?: string; result?: unknown; error_message?: string | null; current_step?: string | null } | undefined,
  channel: Channel,
  notes?: string | null,
) {
  const result = job?.result && typeof job.result === "object" ? job.result as Record<string, unknown> : {};
  const details = typeof result.details === "string" ? result.details.trim() : "";
  const summary = typeof result.summary === "string" ? result.summary.trim() : "";
  if (["queued", "running"].includes(job?.status || "")) {
    return "前回未完了だった精算情報を現在、自動で再取得しています。";
  }
  if (job?.status === "completed" && notes) return automaticRetryWording(notes);
  if (details) return automaticRetryWording(details);
  if (notes) return automaticRetryWording(notes);
  if (summary) return automaticRetryWording(summary);
  if (job?.error_message) return job.error_message;
  if (job?.current_step) return job.current_step;
  return channel === "qoo10"
    ? "Qoo10は配送完了後の水曜に注文単位で精算されます。毎週木曜に精算履歴を照合します。"
    : "精算明細がまだ取り込まれていません。";
}

function automaticRetryWording(value: string) {
  return value
    .replace(
      "Chromeで認証を完了後、同じタスクを再実行してください。",
      "Chromeで認証を完了してください。完了後は毎朝9:15に自動再実行します。",
    )
    .replace(
      "QSM記載の毎月5日発行後に再取得が必要です。",
      "Qoo10は注文単位の水曜精算です。毎週木曜9:15に精算履歴を自動再照合します。",
    )
    .replace(
      "Qoo10の月次精算明細は翌月5日の発行後に取得します。",
      "Qoo10は注文単位の水曜精算です。毎週木曜9:15に精算履歴を自動再照合します。",
    );
}

function settlementRetryPolicy(channel: Channel, status: string, attemptedAt?: string | null, reason = "") {
  if (channel === "qoo10" && isQoo10SettledDetailUnavailable({ summary: reason })) {
    return {
      mode: "after_action" as const,
      label: "精算済み・費目別内訳は必要時のみ確認",
    };
  }
  const requiresOperator = status === "waiting_for_user"
    && /(ログイン|MFA|CAPTCHA|アカウント選択|browser security policy|declined permission|Chrome.*(?:アクセス|許可|セキュリティ))/i.test(reason);
  if (requiresOperator) {
    return {
      mode: "after_action",
      label: "ログイン・認証・許可後に手動再取得",
    };
  }
  return {
    mode: "automatic",
    label: channel === "qoo10"
      ? "毎週木曜9:15に自動再照合"
      : channel === "rakuten"
        ? "毎月5日・20日／10営業日ごろ9:15に自動再照合"
        : attemptedAt
          ? "毎朝9:15に自動再実行"
          : "次回9:15に自動実行",
  };
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function mapRounded<T extends Record<string, number>>(value: T): T {
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, round(amount)])) as T;
}

type AdTotals = {
  google: number;
  meta: number;
  amazon: number;
  rakuten: number;
  yahoo: number;
  other: number;
};

type FinancialChannel = {
  channel: Channel;
  label: string;
  quantity: number;
  sales: number;
  productCost: number;
  productProfit: number;
  refunds: number;
  platformFees: number;
  paymentFees: number;
  sellerDiscounts: number;
  sellerCoupons: number;
  sellerPoints: number;
  shippingCosts: number;
  otherCosts: number;
  otherCredits: number;
  marketplaceFundedDiscounts: number;
  ecDeductions: number;
  directAdCost: number;
  finalProfit: number;
};

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rowsForMonth<T extends Record<string, unknown>>(rows: readonly T[], reportMonth: string) {
  return rows.filter((row) => String(row.report_month || "").slice(0, 10) === reportMonth);
}

function sumAdTotals(rows: readonly Record<string, unknown>[]): AdTotals {
  return rows.reduce<AdTotals>((sum, row) => ({
    google: sum.google + number(row.google_cost),
    meta: sum.meta + number(row.meta_cost),
    amazon: sum.amazon + number(row.amazon_cost),
    rakuten: sum.rakuten + number(row.rakuten_cost),
    yahoo: sum.yahoo + number(row.yahoo_cost),
    other: sum.other + number(row.other_cost),
  }), { google: 0, meta: 0, amazon: 0, rakuten: 0, yahoo: 0, other: 0 });
}

function summarizeMonth(
  month: string,
  allSales: readonly Record<string, unknown>[],
  products: ReadonlyMap<string, Record<string, unknown>>,
  allSettlements: readonly Record<string, unknown>[],
  allAds: readonly Record<string, unknown>[],
) {
  const reportMonth = `${month}-01`;
  const salesRows = rowsForMonth(allSales, reportMonth);
  const settlements = new Map(rowsForMonth(allSettlements, reportMonth).map((row) => [String(row.channel), row]));
  const adTotals = sumAdTotals(rowsForMonth(allAds, reportMonth));
  const channels = CHANNELS.map((channel): FinancialChannel => {
    const salesAndCost = channelSalesAndCost(channel, salesRows, products);
    const settlement = settlements.get(channel);
    const refunds = number(settlement?.refunds);
    const platformFees = number(settlement?.platform_fees);
    const paymentFees = number(settlement?.payment_fees);
    const sellerDiscounts = number(settlement?.seller_discounts);
    const sellerCoupons = number(settlement?.seller_coupons);
    const sellerPoints = number(settlement?.seller_points);
    const shippingCosts = number(settlement?.shipping_costs);
    const otherCosts = number(settlement?.other_costs);
    const otherCredits = number(settlement?.other_credits);
    const ecDeductions = refunds + platformFees + paymentFees + sellerDiscounts
      + sellerCoupons + sellerPoints + shippingCosts + otherCosts - otherCredits;
    const importedAdCost = directImportedAdCost(channel, adTotals);
    const rawSummary = settlement?.raw_summary && typeof settlement.raw_summary === "object"
      ? settlement.raw_summary as Record<string, unknown>
      : {};
    const marketplaceFundedDiscounts = number(rawSummary.excluded_marketplace_funded_discounts);
    const directAdCost = Math.max(importedAdCost, number(rawSummary.excluded_ad_costs));
    const productProfit = salesAndCost.sales - salesAndCost.productCost;
    return {
      channel,
      label: CHANNEL_LABELS[channel],
      quantity: round(salesAndCost.quantity),
      sales: round(salesAndCost.sales),
      productCost: round(salesAndCost.productCost),
      productProfit: round(productProfit),
      refunds: round(refunds),
      platformFees: round(platformFees),
      paymentFees: round(paymentFees),
      sellerDiscounts: round(sellerDiscounts),
      sellerCoupons: round(sellerCoupons),
      sellerPoints: round(sellerPoints),
      shippingCosts: round(shippingCosts),
      otherCosts: round(otherCosts),
      otherCredits: round(otherCredits),
      marketplaceFundedDiscounts: round(marketplaceFundedDiscounts),
      ecDeductions: round(ecDeductions),
      directAdCost: round(directAdCost),
      finalProfit: round(productProfit - ecDeductions - directAdCost),
    };
  });
  const sharedAdCost = adTotals.google + adTotals.meta + adTotals.other;
  const totals = channels.reduce<Totals>((sum, row) => {
    for (const key of Object.keys(sum) as (keyof Totals)[]) sum[key] += number(row[key]);
    return sum;
  }, emptyTotals());
  totals.finalProfit -= sharedAdCost;
  return {
    month,
    channels,
    totals: {
      ...mapRounded(totals),
      adCost: round(totals.directAdCost + sharedAdCost),
      sharedAdCost: round(sharedAdCost),
      profitRate: totals.sales > 0 ? round(totals.finalProfit / totals.sales * 100, 1) : 0,
    },
    adCosts: mapRounded(adTotals),
  };
}

function emptyTotals(): Totals {
  return {
    quantity: 0,
    sales: 0,
    productCost: 0,
    productProfit: 0,
    refunds: 0,
    platformFees: 0,
    paymentFees: 0,
    sellerDiscounts: 0,
    sellerCoupons: 0,
    sellerPoints: 0,
    shippingCosts: 0,
    otherCosts: 0,
    otherCredits: 0,
    marketplaceFundedDiscounts: 0,
    ecDeductions: 0,
    directAdCost: 0,
    finalProfit: 0,
  };
}

function channelSalesAndCost(
  channel: Channel,
  rows: readonly Record<string, unknown>[],
  products: ReadonlyMap<string, Record<string, unknown>>,
) {
  let quantity = 0;
  let sales = 0;
  let productCost = 0;
  for (const row of rows) {
    const count = number(row[countColumn[channel]]);
    if (count <= 0) continue;
    const fallback = products.get(String(row.product_id));
    const unitPrice = number(row.unit_price ?? fallback?.price);
    const unitProfitRate = number(row.unit_profit_rate ?? fallback?.profit_rate);
    const frozenCost = row.unit_cost_ex_ec == null
      ? unitPrice * (1 - unitProfitRate / 100)
      : number(row.unit_cost_ex_ec);
    quantity += count;
    sales += channel === "base" && number(row.base_amount) > 0
      ? number(row.base_amount)
      : count * unitPrice;
    productCost += count * frozenCost;
  }
  return { quantity, sales, productCost };
}

function directImportedAdCost(channel: Channel, adTotals: AdTotals) {
  if (channel === "amazon") return adTotals.amazon;
  if (channel === "rakuten") return adTotals.rakuten;
  if (channel === "yahoo") return adTotals.yahoo;
  return 0;
}

type SeriesAccumulator = {
  seriesCode: number | null;
  seriesName: string;
  count: number;
  sales: number;
  productCost: number;
  channelSales: Record<Channel, number>;
  directAds: Record<Channel, number>;
  sharedAdCost: number;
};

function buildSeriesSummary({
  salesRows,
  products,
  adRows,
  adTotals,
  channels,
  sharedAdCost,
}: {
  salesRows: readonly Record<string, unknown>[];
  products: ReadonlyMap<string, Record<string, unknown>>;
  adRows: readonly Record<string, unknown>[];
  adTotals: AdTotals;
  channels: readonly FinancialChannel[];
  sharedAdCost: number;
}) {
  const seriesMaster = new Map<number, string>();
  for (const product of products.values()) {
    const code = nullableSeriesCode(product.series_code);
    if (code != null && !seriesMaster.has(code)) seriesMaster.set(code, String(product.series || `シリーズ ${code}`));
  }
  const grouped = new Map<string, SeriesAccumulator>();
  const ensure = (seriesCode: number | null, seriesName?: string) => {
    const key = seriesCode == null ? "unclassified" : String(seriesCode);
    if (!grouped.has(key)) {
      grouped.set(key, {
        seriesCode,
        seriesName: seriesName || (seriesCode == null ? "未分類" : seriesMaster.get(seriesCode) || `シリーズ ${seriesCode}`),
        count: 0,
        sales: 0,
        productCost: 0,
        channelSales: zeroByChannel(),
        directAds: zeroByChannel(),
        sharedAdCost: 0,
      });
    }
    return grouped.get(key)!;
  };

  for (const row of salesRows) {
    const product = products.get(String(row.product_id));
    const seriesCode = nullableSeriesCode(product?.series_code);
    const item = ensure(seriesCode, product?.series ? String(product.series) : undefined);
    const unitPrice = number(row.unit_price ?? product?.price);
    const unitProfitRate = number(row.unit_profit_rate ?? product?.profit_rate);
    const frozenCost = row.unit_cost_ex_ec == null
      ? unitPrice * (1 - unitProfitRate / 100)
      : number(row.unit_cost_ex_ec);
    for (const channel of CHANNELS) {
      const count = number(row[countColumn[channel]]);
      if (count <= 0) continue;
      const sales = channel === "base" && number(row.base_amount) > 0
        ? number(row.base_amount)
        : count * unitPrice;
      item.count += count;
      item.sales += sales;
      item.productCost += count * frozenCost;
      item.channelSales[channel] += sales;
    }
  }

  for (const row of adRows) {
    const item = ensure(nullableSeriesCode(row.series_code));
    item.sharedAdCost += number(row.google_cost) + number(row.meta_cost) + number(row.other_cost);
    item.directAds.amazon += number(row.amazon_cost);
    item.directAds.rakuten += number(row.rakuten_cost);
    item.directAds.yahoo += number(row.yahoo_cost);
  }

  if (grouped.size === 0 && (sharedAdCost > 0 || channels.some((row) => row.ecDeductions > 0 || row.directAdCost > 0))) {
    ensure(null);
  }

  const channelMap = new Map(channels.map((row) => [row.channel, row]));
  return Array.from(grouped.values()).map((item) => {
    let platformFees = 0;
    let paymentFees = 0;
    let ecDeductions = 0;
    let directAdCost = 0;
    for (const channel of CHANNELS) {
      const channelRow = channelMap.get(channel);
      if (!channelRow) continue;
      const salesShare = channelRow.sales > 0 ? item.channelSales[channel] / channelRow.sales : 0;
      const fallbackShare = channelRow.sales <= 0 && item.seriesCode == null ? 1 : salesShare;
      platformFees += channelRow.platformFees * fallbackShare;
      paymentFees += channelRow.paymentFees * fallbackShare;
      ecDeductions += channelRow.ecDeductions * fallbackShare;

      const importedTotal = directImportedAdCost(channel, adTotals);
      const adShare = importedTotal > 0
        ? item.directAds[channel] / importedTotal
        : fallbackShare;
      directAdCost += channelRow.directAdCost * adShare;
    }
    const adCost = item.sharedAdCost + directAdCost;
    const productProfit = item.sales - item.productCost;
    return {
      seriesCode: item.seriesCode,
      seriesName: item.seriesName,
      count: round(item.count),
      sales: round(item.sales),
      productCost: round(item.productCost),
      productProfit: round(productProfit),
      platformFees: round(platformFees),
      paymentFees: round(paymentFees),
      ecFees: round(platformFees + paymentFees),
      ecDeductions: round(ecDeductions),
      adCost: round(adCost),
      finalProfit: round(productProfit - ecDeductions - adCost),
    };
  }).sort((a, b) => b.sales - a.sales);
}

function nullableSeriesCode(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function zeroByChannel(): Record<Channel, number> {
  return Object.fromEntries(CHANNELS.map((channel) => [channel, 0])) as Record<Channel, number>;
}
