import { money, record } from "./policy";
import type { AdRow, SyncPeriod } from "./types";

function count(value: unknown): number {
  const result = money(value ?? 0, "広告実績");
  if (result < 0) throw new Error("広告実績に負値があります。");
  return result;
}
function reportedCost(value: unknown): number {
  const amount = money(value, "広告費実金額");
  if (amount < 0) throw new Error("広告費に負値があります。");
  return amount;
}

export function normalizeMetaInsights(values: unknown[], period: SyncPeriod): AdRow[] {
  const names = new Map<string, string>();
  return values.map((value) => {
    const row = record(value);
    if (row.account_currency !== "JPY") throw new Error("Meta広告はJPYアカウントだけを取り込めます。");
    if (row.date_start !== period.startDate || row.date_stop !== period.endDate) throw new Error("Meta広告の集計期間が対象月と一致しません。");
    const campaign = String(row.campaign_name || "").trim(), adset = String(row.adset_name || "").trim();
    if (!campaign || !adset || !row.adset_id) throw new Error("Meta広告の広告セット識別子が欠落しています。");
    const key = JSON.stringify([campaign, adset]);
    const id = String(row.adset_id);
    if (names.has(key)) throw new Error("同名のMeta広告セットが重複しています。既存マッピングを区別できる名称にしてください。");
    names.set(key, id);
    const spend = reportedCost(row.spend);
    return { report_month: period.reportMonth, campaign_name: campaign, ad_set_name: adset,
      amount_spent: spend, impressions: count(row.impressions), reach: count(row.reach),
      frequency: count(row.frequency), cpm: count(row.cpm), clicks: count(row.clicks),
      link_clicks: count(row.inline_link_clicks), ctr: count(row.ctr), cpc: count(row.cpc), series_code: null };
  });
}

export function normalizeAmazonAds(values: unknown[], period: SyncPeriod): AdRow[] {
  const aggregated = new Map<string, AdRow>();
  for (const value of values) {
    const row = record(value);
    if (row.campaignBudgetCurrencyCode !== "JPY") throw new Error("Amazon広告はJPYの日本アカウントだけを取り込めます。");
    if (row.startDate !== period.startDate || row.endDate !== period.endDate) throw new Error("Amazon広告の期間が対象月と一致しません。");
    const asin = String(row.advertisedAsin || "").trim(), sku = String(row.advertisedSku || "").trim();
    const campaign = String(row.campaignName || "").trim(), group = String(row.adGroupName || "").trim();
    if (!asin || !campaign || !group) throw new Error("Amazon広告の商品・広告識別子が欠落しています。");
    const key = JSON.stringify([campaign, group, asin, sku]);
    const existing = aggregated.get(key);
    if (existing) {
      for (const [dbKey, apiKey] of [["cost", "cost"], ["impressions", "impressions"], ["clicks", "clicks"], ["sales", "sales7d"], ["orders", "purchases7d"], ["units_sold", "unitsSoldClicks7d"]]) existing[dbKey] = Number(existing[dbKey] || 0) + (dbKey === "cost" ? reportedCost(row[apiKey]) : count(row[apiKey]));
    } else aggregated.set(key, { report_month: period.reportMonth, start_date: period.startDate, end_date: period.endDate,
      campaign_name: campaign, ad_group_name: group, asin, sku, cost: reportedCost(row.cost),
      impressions: count(row.impressions), clicks: count(row.clicks), sales: count(row.sales7d),
      orders: count(row.purchases7d), units_sold: count(row.unitsSoldClicks7d), series_code: null });
  }
  for (const row of aggregated.values()) {
    const cost = Number(row.cost), clicks = Number(row.clicks), impressions = Number(row.impressions), sales = Number(row.sales), orders = Number(row.orders);
    Object.assign(row, { cpc: clicks ? cost / clicks : 0, ctr: impressions ? 100 * clicks / impressions : 0,
      acos: sales ? 100 * cost / sales : 0, roas: cost ? sales / cost : 0, conversion_rate: clicks ? 100 * orders / clicks : 0 });
  }
  return [...aggregated.values()];
}
