import { gunzipSync } from "node:zlib";
import { salesApiAccessToken, verifyAmazonApiShop } from "../web-sales-automation/official-sales-api";
import { apiJson, downloadReport } from "./http";
import { normalizeAmazonSettlements } from "./amazon-policy";
import { record, records } from "./policy";
import type { FinanceFetchResult, SyncPeriod } from "./types";

const REPORT_TYPE = "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2";

export async function fetchAmazonFinance(period: SyncPeriod): Promise<FinanceFetchResult> {
  const token = await salesApiAccessToken("amazon");
  await verifyAmazonApiShop(token);
  const endpoint = process.env.AMAZON_SP_API_ENDPOINT?.trim() || "https://sellingpartnerapi-fe.amazon.com";
  if (endpoint !== "https://sellingpartnerapi-fe.amazon.com") throw new Error("Amazon精算は日本のSP-APIエンドポイントだけを使用します。");
  const headers = { "x-amz-access-token": token, "content-type": "application/json" };
  const reports: Record<string, unknown>[] = [];
  const tokens = new Set<string>();
  let nextToken = "";
  do {
    const url = new URL(`${endpoint}/reports/2021-06-30/reports`);
    if (nextToken) url.searchParams.set("nextToken", nextToken);
    else {
      url.searchParams.set("reportTypes", REPORT_TYPE);
      url.searchParams.set("marketplaceIds", "A1VC38T7YXB528");
      url.searchParams.set("processingStatuses", "DONE");
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("createdSince", new Date(new Date(`${period.startDate}T00:00:00+09:00`).getTime() - 35 * 86_400_000).toISOString());
      url.searchParams.set("createdUntil", new Date(Math.min(Date.now(), new Date(`${period.endDate}T23:59:59+09:00`).getTime() + 35 * 86_400_000)).toISOString());
    }
    const result = await apiJson<Record<string, unknown>>("Amazon精算Reports API", url, { headers });
    reports.push(...records(result.reports));
    nextToken = String(result.nextToken || "");
    if (nextToken && tokens.has(nextToken)) throw new Error("Amazon精算のページトークンが繰り返されています。");
    tokens.add(nextToken);
    if (tokens.size > 100) throw new Error("Amazon精算のページ数が取得上限を超えています。");
  } while (nextToken);
  const documents: { id: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    const start = String(report.dataStartTime || "").slice(0, 10), end = String(report.dataEndTime || "").slice(0, 10);
    if (start && end && (end < period.startDate || start > period.endDate)) continue;
    const id = String(report.reportDocumentId || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const document = await apiJson<Record<string, unknown>>("Amazon精算レポート情報", `${endpoint}/reports/2021-06-30/documents/${encodeURIComponent(id)}`, { headers });
    const bytes = await downloadReport(document.url, "Amazon精算レポート");
    if (document.compressionAlgorithm && document.compressionAlgorithm !== "GZIP") throw new Error("Amazon精算の圧縮形式が未対応です。");
    const decoded = document.compressionAlgorithm === "GZIP" ? gunzipSync(bytes, { maxOutputLength: 100_000_000 }) : bytes;
    documents.push({ id: String(report.reportId || id), text: decoded.toString("utf8") });
  }
  const normalized: FinanceFetchResult = normalizeAmazonSettlements(documents, period);
  // Current Finances is a coverage cross-check. Never add its amounts to the
  // same settlement rows, which would double-charge the seller.
  if (Date.now() - new Date(`${period.startDate}T00:00:00+09:00`).getTime() <= 179 * 86_400_000
      && new Date(`${period.endDate}T23:59:59+09:00`).getTime() < Date.now() - 120_000) {
    try {
      const statuses: Record<string, number> = {};
      const ids = new Set<string>();
      const pageTokens = new Set<string>();
      let pageToken = "";
      do {
        const url = new URL(`${endpoint}/finances/2024-06-19/transactions`);
        if (pageToken) url.searchParams.set("nextToken", pageToken);
        else {
          url.searchParams.set("postedAfter", `${period.startDate}T00:00:00+09:00`);
          const exclusiveEnd = new Date(new Date(`${period.endDate}T00:00:00+09:00`).getTime() + 86_400_000).toISOString();
          url.searchParams.set("postedBefore", exclusiveEnd);
        }
        const result = await apiJson<Record<string, unknown>>("Amazon Finances API", url, { headers });
        const payload = record(result.payload);
        if (!Array.isArray(payload.transactions)) throw new Error("Amazon Financesの取引一覧が欠落しています。");
        for (const transaction of records(payload.transactions)) {
          const id = String(transaction.transactionId || "");
          if (!id) throw new Error("Amazon取引IDが欠落しています。");
          if (ids.has(id)) continue;
          ids.add(id);
          const status = String(transaction.transactionStatus || "UNKNOWN");
          statuses[status] = (statuses[status] || 0) + 1;
        }
        pageToken = String(payload.nextToken || "");
        if (pageToken && pageTokens.has(pageToken)) throw new Error("Amazon Financesのページトークンが繰り返されています。");
        pageTokens.add(pageToken);
        if (pageTokens.size > 100) throw new Error("Amazon Financesの取得上限を超えました。");
        if (pageToken) await new Promise((resolve) => setTimeout(resolve, 2100));
      } while (pageToken);
      normalized.metadata.financesTransactionCount = ids.size;
      normalized.metadata.financesStatuses = statuses;
      if (statuses.DEFERRED) normalized.warnings.push("Amazon Financesに保留取引があります。精算額の確定には後続精算の確認が必要です。");
    } catch {
      normalized.warnings.push("Amazon Financesの照合が未完了です。Finance and Accounting権限・180日制限を確認してください。");
    }
  } else normalized.warnings.push("Amazon Financesは180日制限または対象月未終了のため照合対象外です。");
  normalized.data.notes = normalized.warnings.join(" ");
  return normalized;
}
