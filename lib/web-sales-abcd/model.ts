import { z } from "zod";

export const CHANNELS = { amazon: "Amazon", rakuten: "楽天", yahoo: "Yahoo", qoo10: "Qoo10", tiktok: "TikTok Shop", base: "BASE", mercari: "メルカリShops" } as const;
export const METRICS = {
  orders_sessions: "注文件数 ÷ セッション数",
  units_sessions: "注文点数 ÷ セッション数（数量率）",
  orders_visitors: "注文件数 ÷ 訪問者数",
  buyers_visitors: "購入者数 ÷ 訪問者数",
  orders_views: "注文件数 ÷ ページ閲覧数（参考率）",
  units_views: "注文点数 ÷ ページ閲覧数（参考数量率）",
} as const;
export const RULE_VERSION = "abcd-1";
export const channelSchema = z.enum(["amazon", "rakuten", "yahoo", "qoo10", "tiktok", "base", "mercari"]);
const numberOrNull = z.number().finite().min(0).max(1e12).nullable();
export const itemSchema = z.object({
  key: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(500),
  access: numberOrNull, conversions: numberOrNull,
  accessNote: z.string().max(100).optional(),
  sales: numberOrNull, profit: z.number().finite().min(-1e12).max(1e12).nullable(),
  state: z.enum(["normal", "new", "out_of_stock"]).default("normal"),
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "日付が正しくありません");
export const importSchema = z.object({
  channel: channelSchema, start: date, end: date,
  metric: z.enum(["orders_sessions", "units_sessions", "orders_visitors", "buyers_visitors", "orders_views", "units_views"]),
  source: z.string().trim().min(1).max(200),
  scope: z.string().trim().min(1).max(200),
  coverage: z.enum(["all", "partial"]),
  minimumAccess: z.number().int().min(1).max(1000000).default(100),
  accessThreshold: z.number().finite().positive().max(1e12).nullable(),
  cvrThreshold: z.number().finite().positive().max(10000).nullable(),
  items: z.array(itemSchema).min(1).max(5000),
}).superRefine((v, ctx) => {
  if (v.start > v.end || (Date.parse(v.end) - Date.parse(v.start)) / 86400000 > 366)
    ctx.addIssue({ code: "custom", message: "対象期間は開始日から最大367日以内にしてください" });
  const keys = new Set<string>();
  for (const item of v.items) {
    if (keys.has(item.key)) ctx.addIssue({ code: "custom", message: `商品IDが重複しています: ${item.key}` });
    keys.add(item.key);
    if (item.access === 0 && (item.conversions ?? 0) > 0)
      ctx.addIssue({ code: "custom", message: `${item.key}: アクセス0に購入実績があります。期間・定義を確認してください` });
    if (v.metric === "buyers_visitors" && item.access != null && item.conversions != null && item.conversions > item.access)
      ctx.addIssue({ code: "custom", message: `${item.key}: 購入者数が訪問者数を超えています` });
  }
});
export type ImportInput = z.infer<typeof importSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Rank = "A" | "B" | "C" | "D" | "保留";
export const ACTIONS: Record<Rank, string> = {
  A: "集客拡大候補。利益・在庫を確認して広告や検索対策を検討",
  B: "ページ改善を優先。画像・説明・価格・送料と流入の質を確認",
  C: "露出不足の原因を確認し、少額の集客テストを検討",
  D: "過去の露出・改善履歴を確認。新たな検証の優先度を判断",
  保留: "データ・販売状態を確認してから判断",
};
export type ResultItem = Item & { cvr: number | null; rank: Rank; reason: string; action: string };
export function analyze(input: ImportInput) {
  const eligible = input.items.filter(i => i.state === "normal" && i.access != null && i.access >= input.minimumAccess && i.conversions != null);
  const accesses = eligible.map(i => i.access!).sort((a, b) => a - b);
  const middle = Math.floor(accesses.length / 2);
  const median = accesses.length ? (accesses.length % 2 ? accesses[middle] : (accesses[middle - 1] + accesses[middle]) / 2) : null;
  const totalAccess = eligible.reduce((s, i) => s + i.access!, 0);
  const rate = totalAccess ? eligible.reduce((s, i) => s + i.conversions!, 0) / totalAccess * 100 : null;
  // No positive benchmark means all-zero conversions must not become A/C.
  const accessThreshold = input.accessThreshold ?? (eligible.length >= 2 ? median : null);
  const cvrThreshold = input.cvrThreshold ?? (eligible.length >= 2 && rate && rate > 0 ? rate : null);
  const items: ResultItem[] = input.items.map(i => {
    const cvr = i.access && i.conversions != null ? i.conversions / i.access * 100 : null;
    let reason = "";
    if (i.state === "new") reason = "新商品・検証中";
    else if (i.state === "out_of_stock") reason = "欠品の影響あり";
    else if (i.access == null || i.conversions == null) reason = i.accessNote || "アクセスまたは購入データ未取得";
    else if (i.access < input.minimumAccess) reason = `アクセス不足（最低${input.minimumAccess}）`;
    else if (accessThreshold == null || cvrThreshold == null) reason = "比較基準不足。基準値を指定するか実績を蓄積してください";
    const rank: Rank = reason ? "保留" : i.access! >= accessThreshold! ? (cvr! >= cvrThreshold! ? "A" : "B") : (cvr! >= cvrThreshold! ? "C" : "D");
    return { ...i, cvr, rank, reason, action: ACTIONS[rank] + (i.profit == null ? "（利益未取得）" : i.profit <= 0 ? "（利益が0以下。収益改善を先に確認）" : "") };
  });
  return { ruleVersion: RULE_VERSION, accessThreshold, cvrThreshold, eligibleCount: eligible.length, items };
}
export type Analysis = ReturnType<typeof analyze>;
export type Snapshot = { id: string; channel: ImportInput["channel"]; period_start: string; period_end: string; created_at: string; source: string; metric: ImportInput["metric"]; scope: string; item_count: number; payload: { input: ImportInput; analysis: Analysis }; finance?: import("./finance").FinanceAnalysis; financeError?: string };
export type SnapshotSummary = Omit<Snapshot, "payload">;
function fullMonth(start: string, end: string) {
  const last = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return start.endsWith("-01") && end === last;
}
export function comparable(a: Snapshot, b: Snapshot) {
  return a.channel === b.channel && a.metric === b.metric && a.scope === b.scope
    && a.payload.input.coverage === b.payload.input.coverage
    && ((fullMonth(a.period_start, a.period_end) && fullMonth(b.period_start, b.period_end)) || Date.parse(a.period_end) - Date.parse(a.period_start) === Date.parse(b.period_end) - Date.parse(b.period_start))
    && a.payload.analysis.ruleVersion === b.payload.analysis.ruleVersion
    && a.payload.input.minimumAccess === b.payload.input.minimumAccess;
}
