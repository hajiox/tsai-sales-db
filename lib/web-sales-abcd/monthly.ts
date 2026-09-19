import { readCsv, mapRows, type Mapping } from "./csv";
import { importSchema } from "./model";

export const ACTIVE_EC_CHANNELS = ["amazon", "rakuten", "yahoo", "base"] as const;
export const ABCD_MONTHLY_CHANNELS = ["amazon", "rakuten", "yahoo"] as const;
export function needsMonthlyAbcd(channel: string, start: string, end: string) {
  return (ABCD_MONTHLY_CHANNELS as readonly string[]).includes(channel)
    && /^\d{4}-\d{2}-01$/.test(start)
    && end === new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

export function monthlyAbcdInput(channel: string, start: string, end: string, csv: string, source: string) {
  if (!needsMonthlyAbcd(channel, start, end)) throw new Error("ABCD月次対象ではありません");
  const parsed = readCsv(csv);
  const dates = parsed.metadata.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g)?.map(v => v.split(/[-/]/).map((p, i) => i ? p.padStart(2, "0") : p).join("-"));
  if (dates?.length === 2 && (dates[0] !== start || dates[1] !== end)) throw new Error("ABCD帳票の期間が一致しません");
  const months = parsed.metadata.match(/\d{4}年\d{2}月/g);
  if (months?.length === 2 && months.some(m => m.replace("年", "-").replace("月", "") !== start.slice(0, 7))) throw new Error("ABCD帳票の期間が一致しません");
  const mapping: Mapping = channel === "amazon"
    ? { key: "（子）ASIN", name: "タイトル", access: "セッション数 - 合計", conversions: "注文された商品点数", sales: "注文商品の売上額", profit: "", state: "" }
    : channel === "yahoo"
      ? { key: "商品コード", name: "商品名", access: "訪問者数", conversions: "注文数合計", sales: "売上合計値（税込）", profit: "", state: "" }
      : { key: "商品管理番号", name: "商品名", access: "アクセス人数", conversions: "売上件数", sales: "売上", profit: "", state: "" };
  // Yahoo masks very small visitor counts. Preserve the uncertainty; never invent 0/1.
  const suppressed = parsed.rows.map(r => channel === "yahoo" && r[mapping.access] === "2未満");
  const rows = parsed.rows.map((r, n) => suppressed[n] ? { ...r, [mapping.access]: "" } : r);
  const items = mapRows(rows, mapping).map((item, n) => suppressed[n]
    ? { ...item, accessNote: "訪問者数2未満（Yahoo非公開値のため判定保留）" } : item);
  if (items.some((i, n) => (i.access == null && !suppressed[n]) || i.conversions == null)) throw new Error("ABCD帳票のアクセス・購入実績に欠落があります");
  return importSchema.parse({ channel, start, end, source, metric: channel === "amazon" ? "units_sessions" : "orders_visitors", scope: channel === "amazon" ? "子ASIN・全流入（帳票掲載商品）" : "商品別・全流入（帳票掲載商品）", coverage: "partial", minimumAccess: 100, accessThreshold: null, cvrThreshold: null, items });
}
