import { salesApiAccessToken, verifyBaseApiShop } from "../web-sales-automation/official-sales-api";
import { apiJson } from "./http";
import { normalizeBaseFinance, record, records } from "./policy";
import type { FinanceFetchResult, SyncPeriod } from "./types";

export async function fetchBaseFinance(period: SyncPeriod): Promise<FinanceFetchResult> {
  const token = await salesApiAccessToken("base");
  await verifyBaseApiShop(token);
  const headers = { Authorization: `Bearer ${token}` };
  async function list(path: "orders" | "savings", parameters: Record<string, string>) {
    const rows: Record<string, unknown>[] = [];
    const ids = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const url = new URL(`https://api.thebase.in/1/${path}`);
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      url.searchParams.set("limit", "100"); url.searchParams.set("offset", String(page * 100));
      const response = await apiJson<Record<string, unknown>>(`BASE ${path} API`, url, { headers });
      if (response.error) throw new Error(`BASE ${path} APIの権限または応答を確認してください。`);
      if (!Array.isArray(response[path])) throw new Error(`BASE ${path} APIの一覧が欠落しています。`);
      const batch = records(response[path]);
      for (const row of batch) {
        const key = String(row.unique_key || row.saving_id || "");
        if (!key || ids.has(key)) throw new Error(`BASE ${path} APIの識別子が欠落・重複しています。`);
        ids.add(key); rows.push(row);
      }
      if (batch.length < 100) return rows;
    }
    throw new Error(`BASE ${path} APIが取得上限を超えています。`);
  }
  const headersList = await list("orders", { start_ordered: `${period.startDate} 00:00:00`, end_ordered: `${period.endDate} 23:59:59` });
  const orders: Record<string, unknown>[] = [];
  for (const header of headersList) {
    if (header.cancelled || ["cancelled", "unpaid", "unshippable"].includes(String(header.dispatch_status))) continue;
    const response = await apiJson<Record<string, unknown>>("BASE注文詳細API", `https://api.thebase.in/1/orders/detail/${encodeURIComponent(String(header.unique_key))}`, { headers });
    if (response.error || !response.order) throw new Error("BASE注文詳細の取得が完了していません。");
    // Customer addresses and bank account fields are only held in memory and
    // never included in normalized storage or run metadata.
    const order = record(response.order);
    const ordered = Number(order.ordered);
    if (!Number.isFinite(ordered) || ordered <= 0) throw new Error("BASE注文日時が欠落しています。");
    const date = new Date(ordered * 1000 + 9 * 3_600_000).toISOString().slice(0, 10);
    if (date < period.startDate || date > period.endDate) throw new Error("BASE注文APIに対象月以外の注文が混在しています。");
    orders.push(order);
  }
  const warnings: string[] = [];
  let savings: Record<string, unknown>[] = [];
  try { savings = await list("savings", { start_created: period.startDate, end_created: period.endDate }); }
  catch { warnings.push("BASE振込申請の取得が未完了です。read_savings権限が必要です。入金・振込手数料は未計上です。"); }
  const result = normalizeBaseFinance(orders, savings, period);
  result.warnings.push(...warnings);
  result.data.notes = result.warnings.join(" ");
  if (warnings.length) result.data.source_files = ["official-api-base-orders"];
  return result;
}
