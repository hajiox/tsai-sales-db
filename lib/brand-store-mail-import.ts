import { createHash, timingSafeEqual } from "node:crypto";
import Papa from "papaparse";
import { read as readWorkbook, utils as workbookUtils } from "xlsx";

export const BRAND_STORE_MAIL_ACCOUNT = "ts@ai.aizu-tv.com";
export const BRAND_STORE_MAIL_SENDER = "keiri@michinoeki-aizu.com";
export const MAX_BRAND_STORE_ATTACHMENT_BYTES = 2_000_000;

export class BrandStoreMailReviewError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BrandStoreMailReviewError";
    this.code = code;
  }
}

type SourceRow = {
  productName: string;
  category: string | null;
  taxType: string | null;
  productId: number | null;
  productCode: string | null;
  barcode: string | null;
  departmentCode: string | null;
  supplierCode: string | null;
  storeCode: string | null;
  storeName: string | null;
  totalSales: number;
  grossProfit: number;
  costAmount: number | null;
  discountAmount: number | null;
  quantitySold: number;
  returnedQuantity: number;
};
export type BrandStoreSalesRow = {
  product_name: string;
  category: string | null;
  tax_type: string | null;
  total_sales: number;
  sales_ratio: number;
  gross_profit: number;
  gross_profit_ratio: number;
  quantity_sold: number;
  quantity_ratio: number;
  returned_quantity: number;
  return_ratio: number;
  product_id: number | null;
  product_code: string | null;
  barcode: string | null;
};
export type BrandStoreProduct = { product_id: number | null; product_name: string; barcode?: string | null };
export type BrandStoreAlias = { product_id: number; alias_name: string };
export type BrandStoreMailInput = {
  sourceMessageId: string;
  attachmentName: string;
  attachmentSha256: string;
  receivedAt: string;
  sender: string;
  account: string;
  subject: string;
  reportMonth: string;
  contentBase64: string;
};

function review(code: string, message: string): never { throw new BrandStoreMailReviewError(code, message); }
function text(value: unknown) { return String(value ?? "").trim(); }
function nullableText(value: unknown) { return text(value) || null; }
function integer(value: unknown, label: string, optional = false) {
  const str = text(value).replace(/[,円¥￥]/g, "");
  if (!str && optional) return 0;
  if (!/^-?\d+$/.test(str)) review("invalid_number", `${label}に空欄または不正な数字があります`);
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < -2147483648 || num > 2147483647) review("invalid_number", `${label}の数字が保存できる範囲を超えています`);
  return num;
}
function sum(rows: SourceRow[], key: "totalSales" | "quantitySold" | "grossProfit" | "returnedQuantity" | "costAmount") {
  return rows.reduce((total, row) => total + (row[key] ?? 0), 0);
}
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function ratio(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded) || Math.abs(rounded) > 999.99) review("invalid_number", "比率が保存できる範囲を超えています");
  return rounded;
}

export function isBrandStoreMailAuthorized(request: Request, expected = process.env.TSA_BRAND_STORE_MAIL_TOKEN) {
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!expected?.trim() || !supplied) return false;
  const a = Buffer.from(expected.trim()); const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateBrandStoreMailEnvelope(value: unknown): { input: BrandStoreMailInput; bytes: Buffer; start: string; end: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) review("invalid_request", "取り込み内容が不正です");
  const body = value as Record<string, unknown>;
  for (const field of ["sourceMessageId", "attachmentName", "attachmentSha256", "receivedAt", "sender", "account", "subject", "reportMonth", "contentBase64"]) {
    if (typeof body[field] !== "string" || !body[field]) review("invalid_request", "取り込みに必要な情報が不足しています");
  }
  const input = body as BrandStoreMailInput;
  if (input.account !== BRAND_STORE_MAIL_ACCOUNT || input.sender.toLowerCase() !== BRAND_STORE_MAIL_SENDER) review("wrong_sender", "対象の経理メールではありません");
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(input.sourceMessageId) || input.subject.length > 500 || input.attachmentName.length > 200 || /[\/\\\x00-\x1f]/.test(input.attachmentName)) review("invalid_request", "メールまたは添付の識別情報が不正です");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.reportMonth)) review("invalid_period", "対象月を確認できません");
  const year = Number(input.reportMonth.slice(0, 4)); const month = Number(input.reportMonth.slice(5));
  const received = new Date(input.receivedAt);
  if (!Number.isFinite(received.getTime()) || year < 2020 || year > 2100) review("invalid_period", "受信日または対象月が不正です");
  const jst = new Date(received.getTime() + 9 * 60 * 60 * 1000);
  const monthsAgo = jst.getUTCFullYear() * 12 + jst.getUTCMonth() - (year * 12 + month - 1);
  if (monthsAgo < 1 || monthsAgo > 12) review("invalid_period", "受信日と対象月を確認してください");
  const subjectMonths = input.subject.normalize("NFKC").match(/ABC\s*分析表\s*((?:\d{1,2}\s*[・、,/]\s*)*\d{1,2})月分/i)?.[1].split(/[・、,/]/).map(value => Number(value.trim()));
  if (!subjectMonths || subjectMonths.some(value => value < 1 || value > 12) || !subjectMonths.includes(month)) review("invalid_subject", "ABC分析表の対象月を確認できません");
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const filename = input.attachmentName.match(/^(\d{1,2})\.(\d{1,2})\s*[-－〜～]\s*(\d{1,2})\.(\d{1,2})\.(csv|xlsx)$/i);
  if (!filename || Number(filename[1]) !== month || Number(filename[2]) !== 1 || Number(filename[3]) !== month || Number(filename[4]) !== days) review("invalid_period", "添付ファイルが対象月の全期間と一致しません");
  if (!/^[a-f0-9]{64}$/.test(input.attachmentSha256) || input.contentBase64.length > Math.ceil(MAX_BRAND_STORE_ATTACHMENT_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) review("invalid_attachment", "添付データが不正、または大きすぎます");
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (!bytes.length || bytes.length > MAX_BRAND_STORE_ATTACHMENT_BYTES || sha256(bytes) !== input.attachmentSha256) review("hash_mismatch", "添付データの一致を確認できません");
  return { input, bytes, start: `${input.reportMonth}-01`, end: `${input.reportMonth}-${days}` };
}

export function sourceDate(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 100000) review("invalid_period", "帳票の対象日が不正です");
    // Current POS Excel serials use the 1900 calendar. A date-only UTC
    // conversion avoids timezone changes and the CJS-only SSF export.
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  const match = text(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) review("invalid_period", "帳票の対象日が不正です");
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function readMatrix(bytes: Buffer, filename: string): unknown[][] {
  if (/\.xlsx$/i.test(filename)) {
    try {
      const workbook = readWorkbook(bytes, { type: "buffer", cellFormula: true, sheetRows: 10002 });
      if (workbook.SheetNames.length !== 1) review("multiple_sheets", "Excelに複数のシートがあるため確認が必要です");
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (sheet["!fullref"] && sheet["!fullref"] !== sheet["!ref"]) review("invalid_rows", "Excelの行数が上限を超えているため全行を読み取れません");
      if (sheet["!ref"] && workbookUtils.decode_range(sheet["!ref"]).e.r >= 10001) review("invalid_rows", "Excelの行数が上限を超えています");
      if (Object.values(sheet).some(cell => cell && typeof cell === "object" && "f" in cell)) review("formula_cell", "数式を含むExcelは確認が必要です");
      return workbookUtils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) as unknown[][];
    } catch (error) {
      if (error instanceof BrandStoreMailReviewError) throw error;
      review("invalid_attachment", "Excelを読み取れません");
    }
  }
  let decoded: string;
  try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { try { decoded = new TextDecoder("shift_jis", { fatal: true }).decode(bytes); } catch { review("invalid_encoding", "CSVの文字コードを読み取れません"); } }
  const result = Papa.parse<string[]>(decoded.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  if (result.errors.length) review("invalid_csv", "CSVの区切りや行数が不正です");
  return result.data;
}

export function parseBrandStoreMail(value: unknown) {
  const envelope = validateBrandStoreMailEnvelope(value);
  const matrix = readMatrix(envelope.bytes, envelope.input.attachmentName).filter(row => row.some(cell => text(cell)));
  if (matrix.length < 2 || matrix.length > 10001) review("invalid_rows", "商品データがない、または多すぎます");
  const headers = matrix[0].map(text);
  // The observed CSV and XLSX use the same POS columns. The unrelated manual
  // upload format is intentionally not accepted by this unattended endpoint.
  const required = ["日付FROM", "日付TO", "分析内容", "店舗ＧＰコード", "店舗ＧＰ名", "部門コード", "部門名", "仕入先コード", "ＪＡＮ", "商品名", "点数", "金額", "値引金額", "原価金額", "粗利"];
  for (const header of required) if (headers.filter(column => column === header).length !== 1) review("invalid_headers", "ABC分析表の必要な列を確認できません");
  const sourceRows: SourceRow[] = [];
  const identities = new Map<string, string>();
  for (const values of matrix.slice(1)) {
    if (values.length > headers.length || required.some(header => headers.indexOf(header) >= values.length)) review("invalid_rows", "CSVまたはExcelの列数が一致しません");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const productName = text(row["商品名"]);
    if (!productName || productName.length > 300 || /^(合計|総計|総合計|小計)$/.test(productName)) review("invalid_rows", "空欄または合計行を含むため確認が必要です");
    if (sourceDate(row["日付FROM"]) !== envelope.start || sourceDate(row["日付TO"]) !== envelope.end) review("invalid_period", "帳票内の対象期間が一致しません");
    if (text(row["店舗ＧＰコード"]) !== "1" || text(row["仕入先コード"]) !== "995") review("wrong_store", "対象の店舗または仕入先の帳票ではありません");
    const productId = null;
    const barcode = nullableText(row["ＪＡＮ"]);
    if (barcode && !/^\d{8,14}$/.test(barcode)) review("invalid_identity", "商品バーコードが不正です");
    const category = nullableText(row["部門名"]);
    const identity = JSON.stringify([productId, barcode, category, nullableText(row["部門コード"]), nullableText(row["仕入先コード"])]);
    if (identities.has(productName) && identities.get(productName) !== identity) review("ambiguous_product", "同じ商品名に異なる商品や部門が含まれています");
    identities.set(productName, identity);
    const totalSales = integer(row["金額"], "売上金額");
    const grossProfit = integer(row["粗利"], "粗利");
    const quantitySold = integer(row["点数"], "販売数");
    const returnedQuantity = 0;
    const costAmount = integer(row["原価金額"], "原価金額");
    const discountAmount = integer(row["値引金額"], "値引金額");
    if (quantitySold < 0 || returnedQuantity < 0 || totalSales < 0 || (quantitySold === 0 && totalSales !== 0)) review("invalid_number", "販売数と売上金額が不正です");
    if (costAmount !== null && totalSales - costAmount !== grossProfit) review("amount_mismatch", "売上・原価・粗利の合計が一致しません");
    sourceRows.push({ productName, category, taxType: null, productId, productCode: barcode, barcode, departmentCode: nullableText(row["部門コード"]), supplierCode: nullableText(row["仕入先コード"]), storeCode: nullableText(row["店舗ＧＰコード"]), storeName: nullableText(row["店舗ＧＰ名"]), totalSales, grossProfit, costAmount, discountAmount, quantitySold, returnedQuantity });
  }
  if (!sourceRows.length) review("invalid_rows", "商品データがありません");
  const totalSales = sum(sourceRows, "totalSales"); const totalQuantity = sum(sourceRows, "quantitySold"); const totalGrossProfit = sum(sourceRows, "grossProfit");
  if (totalSales <= 0 || totalQuantity <= 0) review("invalid_number", "月次売上と販売数を確認してください");
  const contentSha256 = sha256(JSON.stringify({ period: envelope.input.reportMonth, rows: sourceRows.map(row => JSON.stringify(row)).sort() }));
  return { ...envelope, sourceRows, contentSha256, sourceRowCount: sourceRows.length, totalSales, totalQuantity, totalGrossProfit, totalCostAmount: sum(sourceRows, "costAmount") };
}

export function prepareBrandStoreSales(parsed: ReturnType<typeof parseBrandStoreMail>, products: BrandStoreProduct[], aliases: BrandStoreAlias[]) {
  const grouped = new Map<string, SourceRow>();
  let unmatchedProductCount = 0;
  for (const row of parsed.sourceRows) {
    const byId = row.productId === null ? [] : products.filter(product => product.product_id === row.productId);
    const byName = products.filter(product => text(product.product_name) === row.productName);
    const byBarcode = row.barcode ? products.filter(product => text(product.barcode) === row.barcode) : [];
    const byAlias = aliases.filter(alias => text(alias.alias_name) === row.productName).flatMap(alias => products.filter(product => product.product_id === alias.product_id));
    const candidates = [byId, byName, byAlias, byBarcode];
    if (candidates.some(candidate => candidate.length > 1)) review("ambiguous_product", "商品マスターの照合が一意に決まりません");
    const candidateIds = new Set(candidates.flat().map(product => product.product_id).filter(id => id !== null));
    if (candidateIds.size > 1) review("ambiguous_product", "商品名・商品ID・バーコードの照合結果が異なります");
    const matchedId = [...candidateIds][0] ?? null;
    const matched = candidates.flat().find(product => product.product_id === matchedId);
    if (matchedId !== null && row.productId !== null && matchedId !== row.productId) review("ambiguous_product", "元帳票の商品IDと商品マスターが異なります");
    if (matched && row.barcode && text(matched.barcode) && row.barcode !== text(matched.barcode)) review("ambiguous_product", "元帳票のバーコードと商品マスターが異なります");
    if (matchedId === null && !grouped.has(row.productName)) unmatchedProductCount += 1;
    const existing = grouped.get(row.productName);
    if (existing) {
      existing.totalSales += row.totalSales; existing.quantitySold += row.quantitySold; existing.grossProfit += row.grossProfit; existing.returnedQuantity += row.returnedQuantity;
    } else grouped.set(row.productName, { ...row, productId: matchedId });
  }
  const salesRows: BrandStoreSalesRow[] = [...grouped.values()].sort((a, b) => a.productName.localeCompare(b.productName, "ja")).map(row => ({ product_name: row.productName, category: row.category, tax_type: row.taxType, total_sales: row.totalSales, sales_ratio: ratio(row.totalSales / parsed.totalSales * 100), gross_profit: row.grossProfit, gross_profit_ratio: ratio(row.totalSales ? row.grossProfit / row.totalSales * 100 : 0), quantity_sold: row.quantitySold, quantity_ratio: ratio(row.quantitySold / parsed.totalQuantity * 100), returned_quantity: row.returnedQuantity, return_ratio: ratio(row.quantitySold ? row.returnedQuantity / row.quantitySold * 100 : 0), product_id: row.productId, product_code: row.productCode, barcode: row.barcode }));
  if (salesRows.some(row => !Number.isInteger(row.total_sales) || row.total_sales > 2147483647 || !Number.isInteger(row.quantity_sold) || row.quantity_sold > 2147483647 || row.gross_profit < -2147483648 || row.gross_profit > 2147483647)) review("invalid_number", "商品別合算が保存できる範囲を超えています");
  if (salesRows.reduce((n, row) => n + row.total_sales, 0) !== parsed.totalSales || salesRows.reduce((n, row) => n + row.quantity_sold, 0) !== parsed.totalQuantity || salesRows.reduce((n, row) => n + row.gross_profit, 0) !== parsed.totalGrossProfit) review("amount_mismatch", "商品別合算後の金額・数量が一致しません");
  return { salesRows, unmatchedProductCount };
}
