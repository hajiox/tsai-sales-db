import { createHash } from "node:crypto";
import {
  BrandStoreMailReviewError,
  validateBrandStoreMailEnvelope,
  readMatrix,
  sourceDate,
} from "./brand-store-mail-import";

export const FOOD_STORE_MAIL_DESTINATION = "food-store-analysis";
export const FOOD_STORE_MAIL_TABLE = "food_store_sales";

export type FoodStoreSalesRow = {
  jan_code: string;
  product_name: string;
  supplier_code: number | null;
  supplier_name: string | null;
  department_code: number | null;
  department_name: string | null;
  rank: number | null;
  unit_price: number | null;
  quantity_sold: number;
  total_sales: number;
  discount_amount: number;
  cost_amount: number;
  gross_profit: number;
  gross_profit_rate: number | null;
  composition_ratio: number | null;
  cumulative_ratio: number | null;
  rank_category: string | null;
  category_id: string | null;
};

function review(code: string, message: string): never { throw new BrandStoreMailReviewError(code, message); }
function text(value: unknown) { return String(value ?? "").trim(); }
function nullableText(value: unknown) { return text(value) || null; }
function integer(value: unknown, label: string, optional = false) {
  const str = text(value).replace(/[,円¥￥]/g, "");
  if (!str && optional) return null;
  if (!/^-?\d+$/.test(str)) review("invalid_number", `${label}に不正な数字があります`);
  const number = Number(str);
  if (!Number.isSafeInteger(number) || number < -2147483648 || number > 2147483647) review("invalid_number", `${label}が保存できる範囲を超えています`);
  return number;
}
function decimal(value: unknown, label: string) {
  const str = text(value).replace(/[,％%]/g, "");
  if (!str) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(str)) review("invalid_number", `${label}に不正な数字があります`);
  const number = Number(str);
  if (!Number.isFinite(number) || Math.abs(number) > 99999999) review("invalid_number", `${label}が保存できる範囲を超えています`);
  return Math.round(number * 100) / 100;
}
function sum(rows: FoodStoreSalesRow[], key: "total_sales" | "quantity_sold" | "gross_profit" | "cost_amount") {
  const total = rows.reduce((value, row) => value + row[key], 0);
  if (!Number.isSafeInteger(total)) review("invalid_number", "合計値が保存できる範囲を超えています");
  return total;
}

// ABC files are POS food-store records. A JAN is the identity: equal names
// may represent different eat-in/takeaway products and must remain separate.
export function parseFoodStoreMail(value: unknown) {
  const envelope = validateBrandStoreMailEnvelope(value);
  const matrix = readMatrix(envelope.bytes, envelope.input.attachmentName).filter(row => row.some(cell => text(cell)));
  if (matrix.length < 2 || matrix.length > 10001) review("invalid_rows", "商品データがない、または多すぎます");
  const headers = matrix[0].map(text);
  const required = ["日付FROM", "日付TO", "分析内容", "店舗ＧＰコード", "店舗ＧＰ名", "部門コード", "部門名", "仕入先コード", "ＪＡＮ", "商品名", "点数", "金額", "値引金額", "原価金額", "粗利"];
  if (headers.filter(Boolean).length !== new Set(headers.filter(Boolean)).size) review("invalid_headers", "帳票の列名が重複しています");
  for (const header of required) if (headers.filter(column => column === header).length !== 1) review("invalid_headers", "ABC分析表の必要な列を確認できません");
  const sourceRows: FoodStoreSalesRow[] = [];
  const storedJanIdentities = new Map<string, string>();
  for (const values of matrix.slice(1)) {
    if (values.length > headers.length || required.some(header => headers.indexOf(header) >= values.length)) review("invalid_rows", "帳票の列数が一致しません");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    if (text(row["分析内容"]) !== "点数") review("invalid_analysis", "対象のABC分析表ではありません");
    if (sourceDate(row["日付FROM"]) !== envelope.start || sourceDate(row["日付TO"]) !== envelope.end) review("invalid_period", "帳票内の対象期間が一致しません");
    if (text(row["店舗ＧＰコード"]) !== "1" || text(row["仕入先コード"]) !== "995") review("wrong_store", "対象の店舗または仕入先の帳票ではありません");
    const productName = text(row["商品名"]);
    if (!productName || productName.length > 300 || /^(合計|総計|総合計|小計)$/.test(productName)) review("invalid_rows", "空欄または合計行を含むため確認が必要です");
    const jan = text(row["ＪＡＮ"]);
    if (!/^\d{8,14}$/.test(jan)) review("invalid_identity", "JANコードに空欄・指数表記・桁落ちがあります");
    // The existing food schema uses bigint. Two differently padded identifiers
    // must not silently become one database product after that conversion.
    const storedJan = BigInt(jan).toString();
    if (storedJanIdentities.has(storedJan) && storedJanIdentities.get(storedJan) !== jan) review("ambiguous_product", "異なるJAN表記が保存時に同じ商品になります");
    storedJanIdentities.set(storedJan, jan);
    const sales = integer(row["金額"], "売上金額")!;
    const quantity = integer(row["点数"], "販売数")!;
    const cost = integer(row["原価金額"], "原価金額")!;
    const profit = integer(row["粗利"], "粗利")!;
    if (sales < 0 || quantity < 0 || (quantity === 0 && sales !== 0)) review("invalid_number", "販売数と売上金額が不正です");
    if (sales - cost !== profit) review("amount_mismatch", "売上・原価・粗利が一致しません");
    sourceRows.push({
      jan_code: jan, product_name: productName,
      supplier_code: integer(row["仕入先コード"], "仕入先コード", true), supplier_name: nullableText(row["仕入先名"]),
      department_code: integer(row["部門コード"], "部門コード", true), department_name: nullableText(row["部門名"]),
      rank: integer(row["順位"], "順位", true), unit_price: integer(row["単価"], "単価", true),
      quantity_sold: quantity, total_sales: sales,
      discount_amount: integer(row["値引金額"], "値引金額")!, cost_amount: cost, gross_profit: profit,
      gross_profit_rate: decimal(row["粗利率"], "粗利率"), composition_ratio: decimal(row["構成比"], "構成比"),
      cumulative_ratio: decimal(row["累計比"], "累計比"), rank_category: nullableText(row["ランク"]), category_id: null,
    });
  }
  const grouped = new Map<string, FoodStoreSalesRow>();
  for (const row of sourceRows) {
    const saved = grouped.get(row.jan_code);
    if (!saved) { grouped.set(row.jan_code, { ...row }); continue; }
    for (const key of ["product_name", "supplier_code", "supplier_name", "department_code", "department_name"] as const) {
      if (saved[key] !== row[key]) review("ambiguous_product", "同じJANコードに異なる商品や部門があります");
    }
    for (const key of ["quantity_sold", "total_sales", "discount_amount", "cost_amount", "gross_profit"] as const) {
      saved[key] = integer(saved[key] + row[key], "商品別合計")!;
    }
    if (row.unit_price !== null && (saved.unit_price === null || row.unit_price > saved.unit_price)) saved.unit_price = row.unit_price;
    // These ratios describe a source line, not an additive total. If duplicate
    // JAN lines disagree, omit the source ratio rather than inventing a rank.
    for (const key of ["rank", "composition_ratio", "cumulative_ratio", "rank_category"] as const) {
      if (saved[key] !== row[key]) saved[key] = null;
    }
  }
  const salesRows = [...grouped.values()].sort((a, b) => a.jan_code.localeCompare(b.jan_code));
  salesRows.forEach(row => { row.gross_profit_rate = row.total_sales > 0 ? Math.round(row.gross_profit / row.total_sales * 10000) / 100 : null; });
  const totalSales = sum(sourceRows, "total_sales"), totalQuantity = sum(sourceRows, "quantity_sold"), totalGrossProfit = sum(sourceRows, "gross_profit"), totalCostAmount = sum(sourceRows, "cost_amount");
  if (totalSales <= 0 || totalQuantity <= 0 || totalSales - totalCostAmount !== totalGrossProfit) review("amount_mismatch", "月次の売上・数量・原価・粗利を確認してください");
  for (const [key, expected] of [["total_sales", totalSales], ["quantity_sold", totalQuantity], ["gross_profit", totalGrossProfit], ["cost_amount", totalCostAmount]] as const) {
    if (sum(salesRows, key) !== expected) review("amount_mismatch", "JAN別合算後の金額・数量が一致しません");
  }
  const contentSha256 = createHash("sha256").update(JSON.stringify({ destination: FOOD_STORE_MAIL_DESTINATION, period: envelope.input.reportMonth, rows: sourceRows.map(row => JSON.stringify(row)).sort() })).digest("hex");
  return { ...envelope, sourceRows, salesRows, contentSha256, sourceRowCount: sourceRows.length, totalSales, totalQuantity, totalGrossProfit, totalCostAmount };
}

export function isFoodStoreMailReceipt(value: unknown, parsed: ReturnType<typeof parseFoodStoreMail>) {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return receipt.success === true && ["imported", "already_imported"].includes(String(receipt.status)) &&
    receipt.destination === FOOD_STORE_MAIL_DESTINATION && receipt.destinationTable === FOOD_STORE_MAIL_TABLE &&
    typeof receipt.importId === "string" && !!receipt.importId && receipt.sourceMessageId === parsed.input.sourceMessageId &&
    receipt.attachmentSha256 === parsed.input.attachmentSha256 && receipt.contentSha256 === parsed.contentSha256 &&
    receipt.reportMonth === parsed.input.reportMonth && receipt.sourceRowCount === parsed.sourceRowCount &&
    receipt.rowCount === parsed.salesRows.length && receipt.totalSales === parsed.totalSales && receipt.totalQuantity === parsed.totalQuantity &&
    receipt.totalGrossProfit === parsed.totalGrossProfit && receipt.totalCostAmount === parsed.totalCostAmount;
}
