import { parse } from "csv-parse/sync";

export const FIELDS = { key: "商品ID・商品コード", name: "商品名", access: "アクセス（分母）", conversions: "購入実績（分子）", sales: "売上金額（任意）", profit: "利益金額（任意）", state: "状態（任意）" } as const;
export type Mapping = Record<keyof typeof FIELDS, string>;
export function readCsv(text: string) {
  const matrix = parse(text.replace(/^\uFEFF/, ""), { skip_empty_lines: true, relax_column_count: true, bom: true }) as string[][];
  if (!matrix.length || matrix.length > 5020) throw new Error("CSVは1〜5,000商品にしてください");
  // Official Rakuten reports can have metadata before the actual header.
  const headerIndex = matrix.findIndex((r, index) => index < 20 && r.some(c => /^(商品名|タイトル|商品ID|商品コード|Product name|Product Name|Title|name)$/i.test(c.trim())));
  if (headerIndex < 0) throw new Error("商品名・タイトルを含むヘッダーが見つかりません");
  const headers = matrix[headerIndex].map(c => c.trim());
  if (new Set(headers).size !== headers.length) throw new Error("CSVの列名が重複しています");
  const rows = matrix.slice(headerIndex + 1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  if (!rows.length || rows.length > 5000) throw new Error("CSVは1〜5,000商品にしてください");
  return { headers, rows, metadata: matrix.slice(0, headerIndex).map(r => r.join(" ")).join("\n").slice(0, 1500) };
}
export function guessMapping(headers: string[]): Mapping {
  const aliases = {
    key: ["商品ID", "商品管理番号", "商品コード", "（子）ASIN", "(子)ASIN", "(Child) ASIN", "Product ID", "key"],
    name: ["商品名", "タイトル", "Title", "Product name", "Product Name", "name"],
    access: ["セッション数 - 合計", "セッション - 合計", "Sessions - Total", "アクセス人数", "訪問者数", "訪問者数合計", "商品別閲覧数", "アクセス数", "PV", "access"],
    conversions: ["売上件数", "注文数合計", "注文された商品点数", "Units Ordered", "購入者数", "注文件数", "注文点数", "conversions"],
    sales: ["注文商品の売上額", "Ordered Product Sales", "売上合計値（税込）", "売上", "売上金額", "sales"],
    profit: ["利益", "利益金額", "profit"], state: ["状態", "state"],
  };
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, names.find(n => headers.includes(n)) || ""])) as Mapping;
}
function numeric(value: string | undefined, label: string) {
  if (value == null || value.trim() === "" || ["-", "—", "N/A"].includes(value.trim())) return null;
  const clean = value.replace(/[,￥¥円\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) throw new Error(`${label}: 数値ではありません（率の列ではなく件数を指定してください）`);
  const number = Number(clean);
  if (!Number.isFinite(number)) throw new Error(`${label}: 数値が範囲外です`);
  return number;
}
export function mapRows(rows: Record<string, string>[], mapping: Mapping) {
  for (const field of ["key", "name", "access", "conversions"] as const) if (!mapping[field]) throw new Error(`${FIELDS[field]}の列を選んでください`);
  const selected = Object.values(mapping).filter(Boolean);
  if (new Set(selected).size !== selected.length) throw new Error("同じ列を複数の項目に指定できません");
  return rows.map((row, n) => {
    for (const column of selected) if (!(column in row)) throw new Error(`列がありません: ${column}`);
    const rawState = mapping.state ? row[mapping.state] : "normal";
    const state = ({ "": "normal", normal: "normal", "通常": "normal", new: "new", "新商品": "new", out_of_stock: "out_of_stock", "欠品": "out_of_stock" } as Record<string, string>)[rawState];
    if (!state) throw new Error(`${n + 1}件目: 状態は通常・新商品・欠品のいずれかにしてください`);
    return { key: row[mapping.key], name: row[mapping.name], access: numeric(row[mapping.access], `${n + 1}件目アクセス`), conversions: numeric(row[mapping.conversions], `${n + 1}件目購入実績`), sales: numeric(row[mapping.sales], `${n + 1}件目売上`), profit: numeric(row[mapping.profit], `${n + 1}件目利益`), state };
  });
}
