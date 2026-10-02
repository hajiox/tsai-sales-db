import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveWebSalesAmount } from "../web-sales-amounts";
import { classifyGoogleAdsCostRows } from "../google-ads-import-policy";
import { apiJson } from "./http";
import { assertFullMonth } from "./policy";
import { normalizeGooglePerformance, prepareGoogleCostAllocation } from "./google-policy";
import type { AcquisitionOptions, AcquisitionResult, SyncPeriod } from "./types";

const SOURCE = "official-api-google-ads-v23";
type ApiRow = Parameters<typeof normalizeGooglePerformance>[0][number];

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Google広告の接続設定が不足しています（${name}）。`);
  return value;
}

async function fetchGoogleRows(token: string, query: string): Promise<ApiRow[]> {
  const customer = env("GOOGLE_ADS_CUSTOMER_ID").replaceAll("-", "");
  if (!/^\d+$/.test(customer)) throw new Error("Google広告のアカウント設定が正しくありません。");
  let pageToken = "";
  const seen = new Set<string>(), rows: ApiRow[] = [];
  for (let page = 0; page < 100; page++) {
    const response = await apiJson<{ results?: ApiRow[]; nextPageToken?: string }>("Google広告API", `https://googleads.googleapis.com/v23/customers/${customer}/googleAds:search`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "developer-token": env("GOOGLE_ADS_DEVELOPER_TOKEN"),
        "login-customer-id": env("GOOGLE_ADS_LOGIN_CUSTOMER_ID").replaceAll("-", ""), "content-type": "application/json" },
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    });
    if (response.results != null && !Array.isArray(response.results)) throw new Error("Google広告APIの一覧形式を確認できません。");
    rows.push(...response.results || []);
    const next = response.nextPageToken || "";
    if (!next) return rows;
    if (seen.has(next)) throw new Error("Google広告APIのページが反復しています。");
    seen.add(next); pageToken = next;
  }
  throw new Error("Google広告APIの取得件数が上限を超えています。");
}

async function accessToken(): Promise<string> {
  const response = await apiJson<{ access_token?: string; error?: string }>("Google広告認可", "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_ADS_REFRESH_TOKEN"), grant_type: "refresh_token" }),
  });
  if (response.error || !response.access_token) throw new Error("Google広告の再認可が必要です。");
  return response.access_token;
}

async function baseSalesWeights(supabase: SupabaseClient, month: string): Promise<Map<number, number>> {
  const { data: sales, error } = await supabase.from("web_sales_summary").select("product_id,base_count,base_amount").eq("report_month", `${month}-01`).gt("base_count", 0);
  if (error) throw new Error("Google広告配賦用のBASE売上を読み出せません。");
  const ids = [...new Set((sales || []).map(row => String(row.product_id || "")).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data: products, error: productError } = await supabase.from("products").select("id,series_code").in("id", ids).not("series_code", "is", null);
  if (productError) throw new Error("Google広告配賦用の商品シリーズを読み出せません。");
  const series = new Map((products || []).map(row => [String(row.id), Number(row.series_code)]));
  const weights = new Map<number, number>();
  for (const row of sales || []) {
    const code = series.get(String(row.product_id)) || 0;
    const revenue = resolveWebSalesAmount(row, "base");
    if (revenue === null) throw new Error("BASE実売額が未取得のためGoogle広告費を配賦できません。");
    if (code > 0 && revenue > 0) weights.set(code, (weights.get(code) || 0) + revenue);
  }
  return weights;
}

export async function runGoogleAdvertisingAcquisition(period: SyncPeriod, options: AcquisitionOptions = {}): Promise<AcquisitionResult> {
  assertFullMonth(period);
  const supabase = options.supabase || createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existing, error: existingError } = await supabase.from("advertising_costs").select("series_code,google_cost").eq("report_month", `${period.reportMonth}-01`);
  if (existingError) throw new Error("保存済みGoogle広告費を確認できません。");
  const token = await accessToken();
  const customer = env("GOOGLE_ADS_CUSTOMER_ID").replaceAll("-", "");
  const account = await apiJson<{ results?: Array<{ customer?: { currencyCode?: string; timeZone?: string } }> }>("Google広告アカウントAPI", `https://googleads.googleapis.com/v23/customers/${customer}/googleAds:search`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "developer-token": env("GOOGLE_ADS_DEVELOPER_TOKEN"),
      "login-customer-id": env("GOOGLE_ADS_LOGIN_CUSTOMER_ID").replaceAll("-", ""), "content-type": "application/json" },
    body: JSON.stringify({ query: "SELECT customer.currency_code, customer.time_zone FROM customer" }),
  });
  if (account.results?.[0]?.customer?.currencyCode !== "JPY") throw new Error("Google広告アカウントの通貨が日本円と確認できません。");
  const queryRange = `WHERE segments.date BETWEEN '${period.startDate}' AND '${period.endDate}' ORDER BY segments.date DESC, metrics.cost_micros DESC`;
  const fields = "campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";
  const campaignRows = await fetchGoogleRows(token, `SELECT ${fields}, campaign.status, campaign.advertising_channel_type FROM campaign ${queryRange}`);
  const assetRows = await fetchGoogleRows(token, `SELECT ${fields}, asset_group.name, asset_group.status FROM asset_group ${queryRange}`);
  const { data: mapping, error: mappingError } = await supabase.from("google_ads_series_mapping").select("asset_group_name,series_code");
  if (mappingError) throw new Error("Google広告のシリーズ紐付けを確認できません。");
  const seriesMapping = new Map((mapping || []).map(row => [String(row.asset_group_name), Number(row.series_code)]));
  const rows = normalizeGooglePerformance(campaignRows, assetRows, seriesMapping, period.startDate, period.endDate);
  const allocation = prepareGoogleCostAllocation(rows, classifyGoogleAdsCostRows(rows).sharedShoppingMicros > 0
    ? await baseSalesWeights(supabase, period.reportMonth) : new Map());
  const totalCost = [...allocation.costs.values()].reduce((sum, value) => sum + value, 0);
  const oldTotal = (existing || []).reduce((sum, row) => sum + Number(row.google_cost || 0), 0);
  const metadata = { apiVersion: "v23", accountTimeZone: account.results?.[0]?.customer?.timeZone || "", campaignRows: campaignRows.length,
    assetGroupRows: assetRows.length, previousTotalCost: oldTotal, allocationBasis: allocation.allocationBasis };
  if (allocation.needsReview) return { status: "needs_review", coverageLevel: "needs_review", importedCount: 0, source: SOURCE,
    details: allocation.classified.unknownGroupNames.length ? "Google広告に未紐付けの広告グループがあります。商品マッチングを確認してください。" : "Google共通ショッピング広告費の配賦基準がありません。",
    unmatchedCount: Math.max(1, allocation.classified.unknownGroupNames.length), warnings: allocation.warnings, preservedExisting: oldTotal > 0,
    metadata: { ...metadata, unknownGroupNames: allocation.classified.unknownGroupNames } };
  if (oldTotal > 0 && Math.abs(oldTotal - totalCost) > 1) return { status: "needs_review", coverageLevel: "needs_review", importedCount: 0,
    source: SOURCE, totalCost, preservedExisting: true, warnings: allocation.warnings, metadata,
    details: "Google広告APIと保存済み月次広告費に差額があります。保存済み金額を保護し、原本照合が必要です。" };
  if (options.dryRun) return { status: "success", coverageLevel: "complete", importedCount: 0, source: SOURCE, totalCost, warnings: allocation.warnings,
    details: "Google広告APIの取得と金額照合を確認しました（保存なし）。", metadata: { ...metadata, dryRun: true, persisted: false } };
  const costRows = [...allocation.costs].map(([series_code, google_cost]) => ({ series_code, google_cost }));
  const { error: importError } = await supabase.rpc("apply_google_ads_api_acquisition", { p_report_month: `${period.reportMonth}-01`,
    p_performance_rows: rows, p_cost_rows: costRows, p_expected_existing_total: oldTotal });
  if (importError) throw new Error("Google広告費の保存に失敗しました。保存済みデータは更新していません。");
  const { data: saved, error: savedError } = await supabase.from("advertising_costs").select("google_cost").eq("report_month", `${period.reportMonth}-01`);
  const savedTotal = (saved || []).reduce((sum, row) => sum + Number(row.google_cost || 0), 0);
  if (savedError || savedTotal !== totalCost) throw new Error("Google広告費の保存結果がAPI金額と一致しません。結果を確認してください。");
  return { status: "success", coverageLevel: "complete", importedCount: rows.length, source: SOURCE, totalCost, unmatchedCount: 0,
    warnings: allocation.warnings, details: `Google広告 ${period.reportMonth} ¥${totalCost.toLocaleString("ja-JP")}を反映しました。`,
    metadata: { ...metadata, persisted: true, zeroResultVerified: rows.length === 0 && totalCost === 0 } };
}
