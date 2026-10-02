import { gunzipSync } from "node:zlib";
import { apiJson, downloadReport } from "./http";
import { requireApiCredential, saveRotatedApiCredentials } from "./credential-store";
import { normalizeAmazonAds, normalizeMetaInsights } from "./advertising-policy";
import { record } from "./policy";
import type { AdvertisingFetchResult, SyncPeriod } from "./types";

export async function fetchMetaAdvertising(period: SyncPeriod): Promise<AdvertisingFetchResult> {
  const token = await requireApiCredential("META_ACCESS_TOKEN");
  const account = (await requireApiCredential("META_AD_ACCOUNT_ID")).replace(/^act_/, "");
  if (!/^\d+$/.test(account)) throw new Error("Meta広告アカウントIDの形式が正しくありません。");
  // v26.0 is verified against Meta's maintained Business SDK apiconfig.py.
  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";
  if (!/^v\d+\.0$/.test(version)) throw new Error("Meta Graph APIバージョンの形式が正しくありません。");
  const headers = { Authorization: `Bearer ${token}` };
  const accountUrl = new URL(`https://graph.facebook.com/${version}/act_${account}`);
  accountUrl.searchParams.set("fields", "id,currency,timezone_name");
  const details = await apiJson<Record<string, unknown>>("Meta広告アカウントAPI", accountUrl, { headers });
  if (details.id !== `act_${account}` || details.currency !== "JPY") throw new Error("指定されたMeta広告アカウントまたはJPY通貨を確認できません。");
  const values: unknown[] = [];
  const cursors = new Set<string>();
  let cursor = "";
  do {
    const url = new URL(`https://graph.facebook.com/${version}/act_${account}/insights`);
    url.searchParams.set("level", "adset");
    url.searchParams.set("fields", "account_currency,campaign_id,campaign_name,adset_id,adset_name,date_start,date_stop,spend,impressions,reach,frequency,cpm,clicks,inline_link_clicks,ctr,cpc");
    url.searchParams.set("time_range", JSON.stringify({ since: period.startDate, until: period.endDate }));
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("after", cursor);
    const page = await apiJson<Record<string, unknown>>("Meta Insights API", url, { headers });
    if (!Array.isArray(page.data)) throw new Error("Meta Insightsの実績一覧が欠落しています。");
    values.push(...page.data);
    const paging = record(page.paging);
    cursor = paging.next ? String(record(paging.cursors).after || "") : "";
    if (paging.next && !cursor) throw new Error("Meta Insightsの次ページ識別子が欠落しています。");
    if (cursor && cursors.has(cursor)) throw new Error("Meta Insightsのページが繰り返されています。");
    cursors.add(cursor);
    if (cursors.size > 100) throw new Error("Meta Insightsの取得ページ上限を超えました。");
  } while (cursor);
  return { rows: normalizeMetaInsights(values, period), source: "Meta Marketing API Insights (adset)", warnings: [] };
}

export async function fetchAmazonAdvertising(period: SyncPeriod, resumeReportId?: string): Promise<AdvertisingFetchResult> {
  const clientId = await requireApiCredential("AMAZON_ADS_CLIENT_ID");
  const clientSecret = await requireApiCredential("AMAZON_ADS_CLIENT_SECRET");
  const refreshToken = await requireApiCredential("AMAZON_ADS_REFRESH_TOKEN");
  const profileId = await requireApiCredential("AMAZON_ADS_PROFILE_ID");
  if (!/^\d+$/.test(profileId)) throw new Error("Amazon AdsプロフィールIDの形式が正しくありません。");
  const endpoint = process.env.AMAZON_ADS_ENDPOINT?.trim() || "https://advertising-api-fe.amazon.com";
  if (endpoint !== "https://advertising-api-fe.amazon.com") throw new Error("Amazon広告は日本のAds APIエンドポイントだけを使用します。");
  const authorized = await apiJson<Record<string, unknown>>("Amazon Ads OAuth", "https://api.amazon.com/auth/o2/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  });
  if (!authorized.access_token) throw new Error("Amazon Adsアクセストークンを取得できません。");
  if (authorized.refresh_token && authorized.refresh_token !== refreshToken) await saveRotatedApiCredentials({ AMAZON_ADS_REFRESH_TOKEN: String(authorized.refresh_token) });
  const headers = { Authorization: `Bearer ${String(authorized.access_token)}`, "Amazon-Advertising-API-ClientId": clientId,
    "Amazon-Advertising-API-Scope": profileId, "content-type": "application/vnd.createasyncreportrequest.v3+json" };
  const profiles = await apiJson<Record<string, unknown>[]>("Amazon AdsプロフィールAPI", `${endpoint}/v2/profiles`, { headers });
  const profile = Array.isArray(profiles) ? profiles.find((row) => String(row.profileId) === profileId) : undefined;
  if (!profile || profile.countryCode !== "JP" || profile.currencyCode !== "JPY") throw new Error("指定された日本のAmazon Adsプロフィールを確認できません。");
  if (Date.now() - new Date(`${period.startDate}T00:00:00+09:00`).getTime() > 95 * 86_400_000) throw new Error("Amazon Adsの商品別レポート取得可能期間を超えています。保存済み原本を使用してください。");
  if (resumeReportId && !/^[a-zA-Z0-9-]{8,100}$/.test(resumeReportId)) throw new Error("Amazon AdsレポートIDの形式が正しくありません。");
  let reportId = resumeReportId;
  if (!reportId) {
    const response = await apiJson<Record<string, unknown>>("Amazon Adsレポート要求", `${endpoint}/reporting/reports`, {
      method: "POST", headers, body: JSON.stringify({ name: `TSA ${period.reportMonth} Sponsored Products`, startDate: period.startDate, endDate: period.endDate,
        configuration: { adProduct: "SPONSORED_PRODUCTS", groupBy: ["advertiser"], columns: ["startDate", "endDate", "campaignName", "campaignId", "adGroupName", "adGroupId", "adId", "advertisedAsin", "advertisedSku", "campaignBudgetCurrencyCode", "impressions", "clicks", "cost", "sales7d", "purchases7d", "unitsSoldClicks7d"],
          reportTypeId: "spAdvertisedProduct", timeUnit: "SUMMARY", format: "GZIP_JSON" } }),
    });
    reportId = String(response.reportId || "");
    if (!reportId) throw new Error("Amazon AdsレポートIDが欠落しています。");
  }
  const report = await apiJson<Record<string, unknown>>("Amazon Adsレポート状態", `${endpoint}/reporting/reports/${encodeURIComponent(reportId)}`, { headers });
  const configuration = record(report.configuration);
  if (report.startDate !== period.startDate || report.endDate !== period.endDate || configuration.reportTypeId !== "spAdvertisedProduct") throw new Error("Amazon Adsレポートの種類または対象期間が一致しません。");
  if (["PENDING", "PROCESSING"].includes(String(report.status))) return { rows: [], source: "Amazon Ads API spAdvertisedProduct", warnings: ["レポート生成中です。最大3時間かかるため、保存されたreportIdで後続実行してください。"], reportId, pending: true };
  if (report.status !== "COMPLETED" || !report.url) throw new Error("Amazon Adsレポート生成が失敗または未完了です。");
  const bytes = await downloadReport(report.url, "Amazon Adsレポート");
  const decoded = gunzipSync(bytes, { maxOutputLength: 100_000_000 });
  let values: unknown;
  try { values = JSON.parse(decoded.toString("utf8")); } catch { throw new Error("Amazon AdsレポートJSONが不正です。"); }
  if (!Array.isArray(values)) throw new Error("Amazon Adsレポートの実績一覧が欠落しています。");
  return { rows: normalizeAmazonAds(values, period), source: "Amazon Ads API spAdvertisedProduct", warnings: [], reportId };
}
