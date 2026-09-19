import { z } from "zod";
import { importSchema } from "./model";

const reportSchema = z.object({
  schemaVersion: z.literal(1), channel: z.literal("base"),
  shop: z.literal("会津ブランド館"),
  source: z.literal("https://admin.thebase.com/shop_admin/data/items"),
  start: z.string(), end: z.string(),
  lastPageVerified: z.literal(true),
  pages: z.array(z.number().int().min(1).max(50)).min(1).max(100),
  rows: z.array(z.object({
    key: z.string().min(1), name: z.string().min(1),
    values: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  })).min(1).max(5000),
});

export function baseMonthlyAbcdInput(text: string, start: string, end: string, source: string) {
  const report = reportSchema.parse(JSON.parse(text));
  if (report.start !== start || report.end !== end) throw new Error("BASE帳票の期間が一致しません");
  if (report.pages.reduce((s, n) => s + n, 0) !== report.rows.length
    || report.pages.slice(0, -1).some(n => n !== 50)) throw new Error("BASEの商品ページが欠落しています");
  const number = (value: string) => {
    if (!/^\d+(?:,\d{3})*$/.test(value)) throw new Error("BASEの閲覧数・注文点数が数値ではありません");
    return Number(value.replace(/,/g, ""));
  };
  const items = report.rows.map(row => {
    if (!/^\d+$/.test(row.key) && row.key !== `unlinked:${row.name}`) throw new Error("BASEの商品識別子を確認できません");
    return { key: row.key, name: row.name, access: number(row.values[0]), conversions: number(row.values[2]), sales: null, profit: null, state: "normal" };
  });
  const unlinked = items.filter(i => i.key.startsWith("unlinked:")).length;
  return importSchema.parse({ channel: "base", start, end, source, metric: "units_views",
    scope: `商品別・Web/Pay ID合算・画面掲載商品（リンクなし${unlinked}件を含む）`,
    coverage: "partial", minimumAccess: 100, accessThreshold: null, cvrThreshold: null, items });
}
