import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { assertAnalysisPeriod } from "@/lib/web-sales-analysis/period";

const CHANNELS = ["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABELS: Record<Channel, string> = {
  amazon: "Amazon",
  rakuten: "楽天市場",
  yahoo: "Yahoo!",
  mercari: "メルカリShops",
  base: "BASE",
  qoo10: "Qoo10",
  tiktok: "TikTok Shop",
};

const COUNT_COLUMNS: Record<Channel, string> = {
  amazon: "amazon_count",
  rakuten: "rakuten_count",
  yahoo: "yahoo_count",
  mercari: "mercari_count",
  base: "base_count",
  qoo10: "qoo10_count",
  tiktok: "tiktok_count",
};

type Row = Record<string, unknown>;

type ProductMetric = {
  product_id: string;
  name: string;
  series: string;
  series_code: number | null;
  quantity: number;
  sales: number;
  product_cost: number;
  product_profit_before_ec: number;
  margin_rate_before_ec: number;
  previous_month_quantity: number | null;
  previous_year_quantity: number | null;
  month_over_month_quantity_change: number | null;
  year_over_year_quantity_change: number | null;
  channel_quantities: Record<string, number>;
};

export async function buildWebSalesAnalysisPacket(input: {
  month: string;
  startDate: string;
  endDate: string;
}) {
  const { month, startDate, endDate } = input;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("対象月が正しくありません");
  const analysisPeriod = assertAnalysisPeriod(month, startDate, endDate);
  const isInterim = analysisPeriod.type === "half_month";

  const supabase = getWebSalesAutomationServiceClient();
  const months = Array.from({ length: 13 }, (_, index) => shiftMonth(month, index - 12));
  const reportMonths = months.map((value) => `${value}-01`);

  const [salesResult, productsResult, settlementResult, adsResult, jobsResult] = await Promise.all([
    supabase
      .from("web_sales_summary")
      .select("report_month,product_id,amazon_count,rakuten_count,yahoo_count,mercari_count,base_count,qoo10_count,tiktok_count,base_amount,unit_price,unit_profit_rate,unit_cost_ex_ec")
      .in("report_month", reportMonths),
    supabase
      .from("products")
      .select("id,name,series,series_code,price,profit_rate,is_hidden"),
    supabase
      .from("ec_profit_monthly")
      .select("channel,report_month,coverage_level,gross_sales,refunds,platform_fees,payment_fees,seller_discounts,seller_coupons,seller_points,shipping_costs,other_costs,other_credits,net_payout,raw_summary,notes,imported_at")
      .in("report_month", reportMonths),
    supabase
      .from("advertising_costs")
      .select("report_month,series_code,google_cost,meta_cost,amazon_cost,rakuten_cost,yahoo_cost,other_cost")
      .in("report_month", reportMonths),
    supabase
      .from("web_sales_codex_jobs")
      .select("task_key,channel,status,current_step,error_message,period_start,period_end,created_at,completed_at")
      .in("task_key", ["web_sales_import", "ad_cost_import", "ec_profit_import"])
      .eq("report_month", `${month}-01`)
      .order("created_at", { ascending: false }),
  ]);

  for (const result of [salesResult, productsResult, settlementResult, adsResult, jobsResult]) {
    if (result.error) throw result.error;
  }

  const salesRows = (salesResult.data || []) as Row[];
  const products = new Map<string, Row>(
    ((productsResult.data || []) as Row[]).map((product) => [String(product.id), product]),
  );
  const settlements = (settlementResult.data || []) as Row[];
  const adRows = (adsResult.data || []) as Row[];
  const latestJobs = latestJobMap((jobsResult.data || []) as Row[]);

  const trend = months.map((trendMonth) => summarizeMonth({
    month: trendMonth,
    salesRows: rowsForMonth(salesRows, trendMonth),
    products,
    settlements: isInterim && trendMonth === month ? [] : rowsForMonth(settlements, trendMonth),
    adRows: isInterim && trendMonth === month ? [] : rowsForMonth(adRows, trendMonth),
  }));
  const targetSummary = trend[trend.length - 1];
  const previousSummary = trend[trend.length - 2];
  const previousYearSummary = trend[0];
  const targetRows = rowsForMonth(salesRows, month);
  const previousRows = rowsForMonth(salesRows, shiftMonth(month, -1));
  const previousYearRows = rowsForMonth(salesRows, shiftMonth(month, -12));
  const productMetrics = buildProductMetrics(
    targetRows,
    previousRows,
    previousYearRows,
    products,
    !isInterim,
  );
  const selectedProducts = selectImportantProducts(productMetrics);
  const series = buildSeriesMetrics(productMetrics, !isInterim);
  const targetSettlements = isInterim ? [] : rowsForMonth(settlements, month);
  const dataQuality = buildDataQuality({
    month,
    salesRows: targetRows,
    settlements: targetSettlements,
    latestJobs,
    selectedProducts,
    isInterim,
  });

  const advertisingPerformance = isInterim
    ? null
    : await loadAdvertisingPerformance(supabase, month, startDate, endDate);

  return {
    packet_version: 2,
    generated_at: new Date().toISOString(),
    report_month: month,
    period: {
      start_date: startDate,
      end_date: endDate,
      type: analysisPeriod.type,
      label: isInterim ? "1日〜15日の途中集計" : "月次確定",
    },
    analysis_scope: {
      period_type: analysisPeriod.type,
      is_interim: isInterim,
      include_expenses: !isInterim,
      comparison_enabled: !isInterim,
      floor_summary_rules: {
        audience: "NEWブランド館（フロア）の現場スタッフ",
        concise: true,
        exclude_topics: ["広告費", "EC手数料", "EC控除", "精算", "利益率"],
        required_topics: ["対象期間", "売れた商品・動き", "現場で意識すること"],
      },
      history_months: months.length,
      product_rows_in_target_month: targetRows.length,
      selected_product_rows: selectedProducts.length,
      principles: [
        "過去実績の商品原価は月次保存単価を使用する",
        "EC控除は販売手数料・決済手数料・店舗負担値引き等を含む",
        "モール原資のクーポン・値引きはTSA負担として二重控除しない",
        "Google・Meta・その他の共通広告費は全社最終利益から控除する",
        "データがない項目は推測値で埋めず、制約として明記する",
      ],
    },
    metric_definitions: {
      product_profit_before_ec: "売上 - 月次保存商品原価",
      ec_deductions: "返金 + 販売手数料 + 決済手数料 + 店舗負担値引き・クーポン・ポイント + 送料・その他費用 - その他入金",
      final_profit: "売上 - 月次保存商品原価 - EC控除 - 広告費",
      marketplace_funded_discount: "モール負担分。照合には表示するがTSA費用へは加算しない",
      comparison_basis: isInterim
        ? "1〜15日の途中集計であり、前月・前年の月次確定値とは比較しない"
        : "当月は前月・前年同月と比較し、13か月推移で単月の偶然を区別する",
    },
    headline: {
      target: isInterim ? compactInterimTotals(targetSummary.totals) : targetSummary.totals,
      previous_month: isInterim ? null : previousSummary.totals,
      previous_year: isInterim ? null : previousYearSummary.totals,
      comparison: {
        sales_mom_rate: isInterim ? null : rateChange(targetSummary.totals.sales, previousSummary.totals.sales),
        sales_yoy_rate: isInterim ? null : rateChange(targetSummary.totals.sales, previousYearSummary.totals.sales),
        final_profit_mom_rate: isInterim ? null : rateChange(targetSummary.totals.final_profit, previousSummary.totals.final_profit),
        final_profit_yoy_rate: isInterim ? null : rateChange(targetSummary.totals.final_profit, previousYearSummary.totals.final_profit),
        product_cost_rate_change_mom: isInterim ? null : round(targetSummary.totals.product_cost_rate - previousSummary.totals.product_cost_rate, 1),
        ec_deduction_rate_change_mom: isInterim ? null : round(targetSummary.totals.ec_deduction_rate - previousSummary.totals.ec_deduction_rate, 1),
        advertising_rate_change_mom: isInterim ? null : round(targetSummary.totals.advertising_rate - previousSummary.totals.advertising_rate, 1),
      },
    },
    monthly_trend: isInterim ? [] : trend.map(compactTrendMonth),
    channel_details: targetSummary.channels.map((channel) => {
      const previous = previousSummary.channels.find((row) => row.channel === channel.channel);
      const previousYear = previousYearSummary.channels.find((row) => row.channel === channel.channel);
      return {
        ...(isInterim ? compactInterimChannel(channel) : channel),
        previous_month: !isInterim && previous ? compactChannelComparison(previous) : null,
        previous_year: !isInterim && previousYear ? compactChannelComparison(previousYear) : null,
        sales_mom_rate: isInterim ? null : rateChange(channel.sales, previous?.sales || 0),
        sales_yoy_rate: isInterim ? null : rateChange(channel.sales, previousYear?.sales || 0),
        final_profit_mom_rate: isInterim ? null : rateChange(channel.final_profit, previous?.final_profit || 0),
        final_profit_yoy_rate: isInterim ? null : rateChange(channel.final_profit, previousYear?.final_profit || 0),
      };
    }),
    series_details: series.slice(0, 20),
    important_products: selectedProducts,
    advertising_performance: advertisingPerformance,
    data_quality: dataQuality,
  };
}

function summarizeMonth(input: {
  month: string;
  salesRows: Row[];
  products: ReadonlyMap<string, Row>;
  settlements: Row[];
  adRows: Row[];
}) {
  const settlementMap = new Map(input.settlements.map((row) => [String(row.channel), row]));
  const adTotals = sumAdvertising(input.adRows);
  const channels = CHANNELS.map((channel) => {
    let quantity = 0;
    let sales = 0;
    let productCost = 0;
    for (const row of input.salesRows) {
      const count = number(row[COUNT_COLUMNS[channel]]);
      if (count <= 0) continue;
      const product = input.products.get(String(row.product_id));
      const unitPrice = number(row.unit_price ?? product?.price);
      const cost = row.unit_cost_ex_ec == null
        ? unitPrice * (1 - number(row.unit_profit_rate ?? product?.profit_rate) / 100)
        : number(row.unit_cost_ex_ec);
      quantity += count;
      sales += channel === "base" && number(row.base_amount) > 0 ? number(row.base_amount) : count * unitPrice;
      productCost += count * cost;
    }
    const settlement = settlementMap.get(channel);
    const rawSummary = asRecord(settlement?.raw_summary);
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
    const importedAd = channel === "amazon" ? adTotals.amazon
      : channel === "rakuten" ? adTotals.rakuten
        : channel === "yahoo" ? adTotals.yahoo : 0;
    const directAdCost = Math.max(importedAd, number(rawSummary.excluded_ad_costs));
    const finalProfit = sales - productCost - ecDeductions - directAdCost;
    return {
      channel,
      label: CHANNEL_LABELS[channel],
      quantity: round(quantity),
      sales: round(sales),
      product_cost: round(productCost),
      product_cost_rate: ratio(productCost, sales),
      ec_deductions: round(ecDeductions),
      ec_deduction_rate: ratio(ecDeductions, sales),
      direct_ad_cost: round(directAdCost),
      advertising_rate: ratio(directAdCost, sales),
      final_profit: round(finalProfit),
      final_profit_rate: ratio(finalProfit, sales),
      marketplace_funded_discounts: round(number(rawSummary.excluded_marketplace_funded_discounts)),
      settlement_coverage: settlement?.coverage_level || "missing",
      settlement_is_estimate: rawSummary.estimated === true,
      settlement_imported_at: settlement?.imported_at || null,
      expense_breakdown: {
        refunds: round(refunds),
        platform_fees: round(platformFees),
        payment_fees: round(paymentFees),
        seller_discounts: round(sellerDiscounts),
        seller_coupons: round(sellerCoupons),
        seller_points: round(sellerPoints),
        shipping_costs: round(shippingCosts),
        other_costs: round(otherCosts),
        other_credits: round(otherCredits),
      },
    };
  });
  const sharedAdCost = adTotals.google + adTotals.meta + adTotals.other;
  const totals = channels.reduce((sum, row) => ({
    quantity: sum.quantity + row.quantity,
    sales: sum.sales + row.sales,
    product_cost: sum.product_cost + row.product_cost,
    ec_deductions: sum.ec_deductions + row.ec_deductions,
    direct_ad_cost: sum.direct_ad_cost + row.direct_ad_cost,
    final_profit: sum.final_profit + row.final_profit,
  }), { quantity: 0, sales: 0, product_cost: 0, ec_deductions: 0, direct_ad_cost: 0, final_profit: 0 });
  totals.final_profit -= sharedAdCost;
  const advertisingCost = totals.direct_ad_cost + sharedAdCost;
  return {
    month: input.month,
    totals: {
      quantity: round(totals.quantity),
      sales: round(totals.sales),
      product_cost: round(totals.product_cost),
      product_cost_rate: ratio(totals.product_cost, totals.sales),
      ec_deductions: round(totals.ec_deductions),
      ec_deduction_rate: ratio(totals.ec_deductions, totals.sales),
      advertising_cost: round(advertisingCost),
      advertising_rate: ratio(advertisingCost, totals.sales),
      final_profit: round(totals.final_profit),
      final_profit_rate: ratio(totals.final_profit, totals.sales),
      shared_ad_cost: round(sharedAdCost),
    },
    advertising_by_source: adTotals,
    channels,
  };
}

function buildProductMetrics(
  targetRows: Row[],
  previousRows: Row[],
  previousYearRows: Row[],
  products: ReadonlyMap<string, Row>,
  comparisonsEnabled: boolean,
) {
  const previous = productQuantityMap(previousRows);
  const previousYear = productQuantityMap(previousYearRows);
  return targetRows.map((row): ProductMetric => {
    const productId = String(row.product_id);
    const product = products.get(productId) || {};
    const channelQuantities: Record<string, number> = Object.fromEntries(
      CHANNELS.map((channel) => [channel, round(number(row[COUNT_COLUMNS[channel]]))]),
    );
    const quantity = Object.values(channelQuantities).reduce((sum, value) => sum + value, 0);
    const unitPrice = number(row.unit_price ?? product.price);
    const unitCost = row.unit_cost_ex_ec == null
      ? unitPrice * (1 - number(row.unit_profit_rate ?? product.profit_rate) / 100)
      : number(row.unit_cost_ex_ec);
    const baseSales = number(row.base_amount);
    const sales = CHANNELS.reduce((sum, channel) => {
      const count = channelQuantities[channel];
      return sum + (channel === "base" && baseSales > 0 ? baseSales : count * unitPrice);
    }, 0);
    const productCost = quantity * unitCost;
    const previousQuantity = comparisonsEnabled ? previous.get(productId) || 0 : null;
    const previousYearQuantity = comparisonsEnabled ? previousYear.get(productId) || 0 : null;
    return {
      product_id: productId,
      name: String(product.name || `商品ID ${productId}`),
      series: String(product.series || "未分類"),
      series_code: product.series_code == null ? null : number(product.series_code),
      quantity: round(quantity),
      sales: round(sales),
      product_cost: round(productCost),
      product_profit_before_ec: round(sales - productCost),
      margin_rate_before_ec: ratio(sales - productCost, sales),
      previous_month_quantity: previousQuantity == null ? null : round(previousQuantity),
      previous_year_quantity: previousYearQuantity == null ? null : round(previousYearQuantity),
      month_over_month_quantity_change: comparisonsEnabled ? rateChange(quantity, previousQuantity || 0) : null,
      year_over_year_quantity_change: comparisonsEnabled ? rateChange(quantity, previousYearQuantity || 0) : null,
      channel_quantities: channelQuantities,
    };
  });
}

function selectImportantProducts(products: ProductMetric[]) {
  const selected = new Map<string, ProductMetric>();
  const add = (rows: ProductMetric[]) => rows.forEach((row) => selected.set(row.product_id, row));
  const active = products.filter((row) => row.quantity > 0);
  add([...active].sort((a, b) => b.sales - a.sales).slice(0, 18));
  add([...active].sort((a, b) => (b.month_over_month_quantity_change ?? -Infinity) - (a.month_over_month_quantity_change ?? -Infinity)).slice(0, 10));
  add([...active].sort((a, b) => (a.month_over_month_quantity_change ?? Infinity) - (b.month_over_month_quantity_change ?? Infinity)).slice(0, 10));
  add([...active].sort((a, b) => a.margin_rate_before_ec - b.margin_rate_before_ec).slice(0, 10));
  add(products
    .filter((row) => row.quantity === 0 && (row.previous_month_quantity || 0) > 0)
    .sort((a, b) => (b.previous_month_quantity || 0) - (a.previous_month_quantity || 0))
    .slice(0, 8));
  return [...selected.values()].sort((a, b) => b.sales - a.sales).slice(0, 40);
}

function buildSeriesMetrics(products: ProductMetric[], comparisonsEnabled: boolean) {
  const map = new Map<string, Omit<ProductMetric, "product_id" | "name" | "channel_quantities"> & { product_count: number }>();
  for (const product of products) {
    const current = map.get(product.series) || {
      series: product.series,
      series_code: product.series_code,
      quantity: 0,
      sales: 0,
      product_cost: 0,
      product_profit_before_ec: 0,
      margin_rate_before_ec: 0,
      previous_month_quantity: 0,
      previous_year_quantity: 0,
      month_over_month_quantity_change: null,
      year_over_year_quantity_change: null,
      product_count: 0,
    };
    current.quantity += product.quantity;
    current.sales += product.sales;
    current.product_cost += product.product_cost;
    current.product_profit_before_ec += product.product_profit_before_ec;
    current.previous_month_quantity = (current.previous_month_quantity || 0) + (product.previous_month_quantity || 0);
    current.previous_year_quantity = (current.previous_year_quantity || 0) + (product.previous_year_quantity || 0);
    current.product_count += 1;
    map.set(product.series, current);
  }
  return [...map.values()].map((row) => ({
    ...row,
    quantity: round(row.quantity),
    sales: round(row.sales),
    product_cost: round(row.product_cost),
    product_profit_before_ec: round(row.product_profit_before_ec),
    margin_rate_before_ec: ratio(row.product_profit_before_ec, row.sales),
    previous_month_quantity: comparisonsEnabled ? round(row.previous_month_quantity || 0) : null,
    previous_year_quantity: comparisonsEnabled ? round(row.previous_year_quantity || 0) : null,
    month_over_month_quantity_change: comparisonsEnabled ? rateChange(row.quantity, row.previous_month_quantity || 0) : null,
    year_over_year_quantity_change: comparisonsEnabled ? rateChange(row.quantity, row.previous_year_quantity || 0) : null,
  })).sort((a, b) => b.sales - a.sales);
}

async function loadAdvertisingPerformance(
  supabase: ReturnType<typeof getWebSalesAutomationServiceClient>,
  month: string,
  startDate: string,
  endDate: string,
) {
  const results = await Promise.all([
    supabase.from("google_ads_performance").select("campaign_name,asset_group_name,cost,impressions,clicks,conversions,conversions_value,series_code").gte("report_date", startDate).lte("report_date", endDate),
    supabase.from("meta_ads_performance").select("campaign_name,ad_set_name,amount_spent,impressions,clicks,link_clicks,results,series_code").eq("report_month", month),
    supabase.from("amazon_ads_performance").select("campaign_name,ad_group_name,sku,cost,impressions,clicks,sales,orders,units_sold,series_code").eq("report_month", month),
    supabase.from("rakuten_ads_performance").select("product_code,amount_spent,clicks,sales_amount,sales_count,series_code").eq("report_month", month),
    supabase.from("yahoo_ads_performance").select("product_code,product_name,amount_spent,impressions,clicks,orders,sales_amount,series_code").eq("report_month", month),
  ]);
  const [google, meta, amazon, rakuten, yahoo] = results;
  return {
    google: summarizeAdRows((google.data || []) as Row[], "cost", "conversions_value", ["campaign_name", "asset_group_name"]),
    meta: summarizeAdRows((meta.data || []) as Row[], "amount_spent", "results", ["campaign_name", "ad_set_name"]),
    amazon: summarizeAdRows((amazon.data || []) as Row[], "cost", "sales", ["campaign_name", "ad_group_name", "sku"]),
    rakuten: summarizeAdRows((rakuten.data || []) as Row[], "amount_spent", "sales_amount", ["product_code"]),
    yahoo: summarizeAdRows((yahoo.data || []) as Row[], "amount_spent", "sales_amount", ["product_code", "product_name"]),
    unavailable_sources: [google, meta, amazon, rakuten, yahoo]
      .map((result, index) => result.error ? ["google", "meta", "amazon", "rakuten", "yahoo"][index] : null)
      .filter(Boolean),
  };
}

function summarizeAdRows(rows: Row[], costKey: string, valueKey: string, nameKeys: string[]) {
  const totals = rows.reduce<{ cost: number; value: number; impressions: number; clicks: number; conversions: number }>((sum, row) => ({
    cost: sum.cost + number(row[costKey]),
    value: sum.value + number(row[valueKey]),
    impressions: sum.impressions + number(row.impressions),
    clicks: sum.clicks + number(row.clicks),
    conversions: sum.conversions + number(row.conversions ?? row.orders ?? row.sales_count ?? row.results),
  }), { cost: 0, value: 0, impressions: 0, clicks: 0, conversions: 0 });
  const topRows = [...rows]
    .sort((a, b) => number(b[costKey]) - number(a[costKey]))
    .slice(0, 10)
    .map((row) => ({
      name: nameKeys.map((key) => String(row[key] || "")).filter(Boolean).join(" / ") || "名称なし",
      cost: round(number(row[costKey])),
      attributed_value: round(number(row[valueKey])),
      roas: ratio(number(row[valueKey]), number(row[costKey])),
      impressions: round(number(row.impressions)),
      clicks: round(number(row.clicks)),
      conversions: round(number(row.conversions ?? row.orders ?? row.sales_count ?? row.results), 1),
      series_code: row.series_code == null ? null : number(row.series_code),
    }));
  return {
    row_count: rows.length,
    totals: {
      cost: round(totals.cost),
      attributed_value: round(totals.value),
      roas: ratio(totals.value, totals.cost),
      impressions: round(totals.impressions),
      clicks: round(totals.clicks),
      conversions: round(totals.conversions, 1),
      ctr: ratio(totals.clicks, totals.impressions),
      cpc: totals.clicks > 0 ? round(totals.cost / totals.clicks, 1) : 0,
    },
    top_by_cost: topRows,
  };
}

function buildDataQuality(input: {
  month: string;
  salesRows: Row[];
  settlements: Row[];
  latestJobs: ReadonlyMap<string, Row>;
  selectedProducts: ProductMetric[];
  isInterim: boolean;
}) {
  const settlementMap = new Map(input.settlements.map((row) => [String(row.channel), row]));
  const channels = CHANNELS.map((channel) => {
    const settlement = settlementMap.get(channel);
    return {
      channel,
      sales_job: input.latestJobs.get(`web_sales_import:${channel}`)?.status || "not_started",
      settlement_job: input.isInterim ? "not_applicable" : input.latestJobs.get(`ec_profit_import:${channel}`)?.status || "not_started",
      settlement_coverage: input.isInterim ? "not_applicable" : settlement?.coverage_level || "missing",
      settlement_estimated: input.isInterim ? false : asRecord(settlement?.raw_summary).estimated === true,
    };
  });
  const missingCosts = input.selectedProducts.filter((row) => row.quantity > 0 && row.product_cost <= 0).map((row) => row.name);
  return {
    report_month: input.month,
    analysis_type: input.isInterim ? "half_month" : "monthly",
    expense_data_included: !input.isInterim,
    sales_row_count: input.salesRows.length,
    channels,
    complete_settlement_count: channels.filter((row) => row.settlement_coverage === "complete").length,
    estimated_settlement_count: channels.filter((row) => row.settlement_estimated).length,
    missing_or_zero_cost_products: missingCosts.slice(0, 20),
  };
}

function latestJobMap(rows: Row[]) {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const key = `${row.task_key}:${row.channel}`;
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

function productQuantityMap(rows: Row[]) {
  return new Map(rows.map((row) => [
    String(row.product_id),
    CHANNELS.reduce((sum, channel) => sum + number(row[COUNT_COLUMNS[channel]]), 0),
  ]));
}

function sumAdvertising(rows: Row[]): { google: number; meta: number; amazon: number; rakuten: number; yahoo: number; other: number } {
  return rows.reduce<{ google: number; meta: number; amazon: number; rakuten: number; yahoo: number; other: number }>((sum, row) => ({
    google: sum.google + number(row.google_cost),
    meta: sum.meta + number(row.meta_cost),
    amazon: sum.amazon + number(row.amazon_cost),
    rakuten: sum.rakuten + number(row.rakuten_cost),
    yahoo: sum.yahoo + number(row.yahoo_cost),
    other: sum.other + number(row.other_cost),
  }), { google: 0, meta: 0, amazon: 0, rakuten: 0, yahoo: 0, other: 0 });
}

function rowsForMonth(rows: Row[], month: string) {
  return rows.filter((row) => String(row.report_month || "").slice(0, 7) === month);
}

function compactTrendMonth(row: ReturnType<typeof summarizeMonth>) {
  return {
    month: row.month,
    totals: row.totals,
    channel_sales: Object.fromEntries(row.channels.map((channel) => [channel.channel, channel.sales])),
    channel_final_profit: Object.fromEntries(row.channels.map((channel) => [channel.channel, channel.final_profit])),
  };
}

function compactChannelComparison(row: ReturnType<typeof summarizeMonth>["channels"][number]) {
  return {
    quantity: row.quantity,
    sales: row.sales,
    product_cost_rate: row.product_cost_rate,
    ec_deduction_rate: row.ec_deduction_rate,
    advertising_rate: row.advertising_rate,
    final_profit: row.final_profit,
    final_profit_rate: row.final_profit_rate,
  };
}

function compactInterimTotals(row: ReturnType<typeof summarizeMonth>["totals"]) {
  return {
    quantity: row.quantity,
    sales: row.sales,
    product_cost: row.product_cost,
    product_cost_rate: row.product_cost_rate,
    product_profit_before_expenses: round(row.sales - row.product_cost),
    product_profit_rate_before_expenses: ratio(row.sales - row.product_cost, row.sales),
  };
}

function compactInterimChannel(row: ReturnType<typeof summarizeMonth>["channels"][number]) {
  return {
    channel: row.channel,
    label: row.label,
    quantity: row.quantity,
    sales: row.sales,
    product_cost: row.product_cost,
    product_cost_rate: row.product_cost_rate,
    product_profit_before_expenses: round(row.sales - row.product_cost),
    product_profit_rate_before_expenses: ratio(row.sales - row.product_cost, row.sales),
  };
}

function asRecord(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : round(numerator / denominator * 100, 1);
}

function rateChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return round((current - previous) / Math.abs(previous) * 100, 1);
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
