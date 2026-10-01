import { parse } from "csv-parse/sync";
import type {
  NormalizedSalesItem,
  SyncPeriod,
  WebSalesChannel,
} from "./types";

type CsvRow = Record<string, string>;

type ChannelFields = {
  productKey: string;
  name: string;
  quantity: string;
  amount: string;
  orderId?: string;
  lineId?: string;
  occurredAt?: string;
  status?: string;
};

const HEADER_ROWS: Record<WebSalesChannel, number> = {
  amazon: 0,
  rakuten: 6,
  yahoo: 0,
  mercari: 0,
  base: 0,
  qoo10: 0,
  tiktok: 0,
};

export type ParsedWebSalesCsv = {
  items: NormalizedSalesItem[];
  rowCount: number;
  quantityTotal: number;
};

export type ReportedSalesRow = {
  name: string;
  quantity: number;
  amount: number;
  occurredAt: string | null;
};

// Shared by the screen's manual import and the authenticated automation route.
// Header names, not fixed column positions, determine the official amounts.
export function parseReportedWebSalesCsv(channel: WebSalesChannel, csvText: string): ReportedSalesRow[] {
  return readRows(channel, csvText).flatMap((row, index) => {
    const fields = channelFields(channel, row);
    const name = clean(fields.name);
    if (channel === "base" && (name.includes("クーポン") || name.startsWith("割引"))) return [];
    const quantity = salesQuantity(fields.quantity, index + HEADER_ROWS[channel] + 2);
    if (quantity === 0) {
      rejectZeroQuantityAmount(fields, index + HEADER_ROWS[channel] + 2);
      return [];
    }
    if (!name) throw new Error(`CSV ${index + HEADER_ROWS[channel] + 2}行目の商品名がありません`);
    return [{ name, quantity, amount: actualSalesAmount(fields.amount, index + HEADER_ROWS[channel] + 2), occurredAt: normalizeDate(fields.occurredAt) }];
  });
}

function readRows(channel: WebSalesChannel, csvText: string): CsvRow[] {
  const matrix = parse(csvText.replace(/^\uFEFF/, ""), {
    columns: false, skip_empty_lines: true, relax_column_count: true,
    relax_quotes: true, trim: true,
  }) as string[][];
  const headerRow = HEADER_ROWS[channel];
  const header = (matrix[headerRow] || []).map(clean);
  if (header.length === 0) throw new Error("CSVヘッダーが見つかりません");
  const nameColumn = channel === "amazon" ? "タイトル" : "商品名";
  const quantityColumn = channel === "amazon" ? "注文された商品点数" : channel === "rakuten" ? "売上個数" : channel === "yahoo" ? "注文点数合計" : "数量";
  if (!header.includes(nameColumn) || !header.includes(quantityColumn)) {
    throw new Error("公式の商品名・販売個数の列がありません。対象ECの売上帳票を確認してください");
  }
  return matrix.slice(headerRow + 1)
    .filter((values) => values.some((value) => clean(value)))
    .map((values) => Object.fromEntries(header.map((name, index) => [name, clean(values[index])])));
}

export function parsePreparedWebSalesCsv(
  channel: WebSalesChannel,
  csvText: string,
  period: SyncPeriod,
): ParsedWebSalesCsv {
  const rows = readRows(channel, csvText);
  const snapshotId = `${channel}:${period.startDate}:${period.endDate}`;
  const items = rows
    .map((row, index) => normalizeRow(channel, row, index, snapshotId, period))
    .filter((item): item is NormalizedSalesItem => Boolean(item));

  return {
    items,
    rowCount: rows.length,
    quantityTotal: roundQuantity(items.reduce((sum, item) => sum + item.quantity, 0)),
  };
}

function normalizeRow(
  channel: WebSalesChannel,
  row: CsvRow,
  index: number,
  snapshotId: string,
  period: SyncPeriod,
): NormalizedSalesItem | null {
  const fields = channelFields(channel, row);
  const name = clean(fields.name);
  if (channel === "base" && (name.includes("クーポン") || name.startsWith("割引"))) return null;
  const quantity = salesQuantity(fields.quantity, index + HEADER_ROWS[channel] + 2);
  if (quantity === 0) {
    rejectZeroQuantityAmount(fields, index + HEADER_ROWS[channel] + 2);
    return null;
  }
  if (!name) throw new Error(`CSV ${index + HEADER_ROWS[channel] + 2}行目の商品名がありません`);
  const externalProductKey = clean(fields.productKey) || `name:${normalizeLookup(name)}`;
  const externalOrderId = clean(fields.orderId) || snapshotId;
  const externalLineId = clean(fields.lineId) || `${externalProductKey}:${index + 1}`;

  return {
    externalOrderId,
    externalLineId,
    externalProductKey,
    externalProductName: name,
    occurredAt: normalizeDate(fields.occurredAt) || `${period.reportMonth}T00:00:00+09:00`,
    quantity,
    amount: actualSalesAmount(fields.amount, index + HEADER_ROWS[channel] + 2),
    sourceStatus: clean(fields.status) || "reported",
    rawData: {
      source_row: index + HEADER_ROWS[channel] + 2,
      external_product_key: externalProductKey,
      external_product_name: name,
    },
  };
}

function channelFields(channel: WebSalesChannel, row: CsvRow): ChannelFields {
  switch (channel) {
    case "amazon":
      return {
        productKey: first(row, "（子）ASIN", "(子)ASIN", "（親）ASIN"),
        name: first(row, "タイトル"),
        quantity: first(row, "注文された商品点数"),
        amount: first(row, "注文商品の売上額"),
      };
    case "rakuten":
      return {
        productKey: first(row, "商品管理番号", "商品番号"),
        name: first(row, "商品名"),
        quantity: first(row, "売上個数"),
        amount: first(row, "売上"),
      };
    case "yahoo":
      return {
        productKey: first(row, "商品コード", "サブコード"),
        name: first(row, "商品名"),
        quantity: first(row, "注文点数合計"),
        amount: first(row, "売上合計値（税込）"),
      };
    case "mercari":
      return {
        productKey: first(row, "商品ID", "SKU") || `name:${normalizeLookup(first(row, "商品名"))}`,
        name: first(row, "商品名"),
        quantity: first(row, "数量"),
        amount: first(row, "売上（税込）"),
        orderId: first(row, "注文番号"),
        lineId: first(row, "明細番号"),
        occurredAt: first(row, "売上移転日"),
        status: first(row, "明細種別"),
      };
    case "base":
      return {
        productKey: first(row, "種類コード", "商品コード", "種類ID", "商品ID"),
        name: first(row, "商品名"),
        quantity: first(row, "数量"),
        amount: first(row, "合計金額"),
        orderId: first(row, "注文ID"),
        lineId: `${first(row, "注文ID")}:${first(row, "種類ID", "商品ID")}`,
        occurredAt: first(row, "注文日時"),
        status: first(row, "発送状況"),
      };
    case "qoo10":
      return {
        productKey: first(row, "販売者商品コード", "商品番号"),
        name: first(row, "商品名"),
        quantity: first(row, "数量"),
        // The prepared official-API CSV puts merchandise line_amount in this
        // column. A catalog/unit price is not an actual merchandise total.
        amount: first(row, "商品売上金額", "購入者決済金額"),
        orderId: first(row, "注文番号"),
        lineId: first(row, "カート番号", "配送番号") || `${first(row, "注文番号")}:${first(row, "商品番号")}`,
        occurredAt: first(row, "注文日"),
        status: first(row, "配送状態"),
      };
    case "tiktok":
      return {
        productKey: first(row, "SKU ID", "出品者SKU"),
        name: first(row, "商品名"),
        quantity: first(row, "数量"),
        // Order payment can repeat across SKUs and includes shipping/platform
        // discounts. Use the merchandise subtotal less seller-funded discounts.
        amount: first(row, "商品売上金額") || tiktokMerchandiseAmount(row),
        orderId: first(row, "注文ID"),
        lineId: `${first(row, "注文ID")}:${first(row, "SKU ID", "出品者SKU")}`,
        occurredAt: first(row, "注文の支払い日時"),
        status: first(row, "注文状況"),
      };
  }
}

function first(row: CsvRow, ...names: string[]) {
  for (const name of names) {
    const value = clean(row[name]);
    if (value) return value;
  }
  return "";
}

function clean(value: unknown) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function salesQuantity(value: unknown, sourceRow: number) {
  const input = clean(value).replace(/,/g, "");
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input))) {
    throw new Error(`CSV ${sourceRow}行目の販売個数が不正です`);
  }
  return Number(input);
}

function rejectZeroQuantityAmount(fields: ChannelFields, sourceRow: number) {
  if (clean(fields.amount) && actualSalesAmount(fields.amount, sourceRow) !== 0) {
    throw new Error(`CSV ${sourceRow}行目は販売個数0の非0金額です。売上補正として確認してください`);
  }
}

export function actualSalesAmount(value: unknown, sourceRow = 0) {
  const input = clean(value).replace(/^[¥￥]\s*/, "").replace(/\s*(円|JPY)$/i, "").replace(/,/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(input) || !Number.isFinite(Number(input))) {
    throw new Error(`CSV ${sourceRow}行目の商品売上金額が未取得または不正です。通常単価からの推計は行いません`);
  }
  return Number(input);
}

function tiktokMerchandiseAmount(row: CsvRow) {
  const subtotal = first(row, "SKU小計（割引前）");
  const sellerDiscount = first(row, "セラーSKU割引");
  if (!subtotal || !sellerDiscount) return "";
  return String(actualSalesAmount(subtotal) - actualSalesAmount(sellerDiscount));
}

function normalizeLookup(value: unknown) {
  return clean(value).normalize("NFKC").toLowerCase();
}

function normalizeDate(value: unknown) {
  const input = clean(value).replace(/^'/, "");
  if (!input) return null;
  let match = input.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(.*)$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}${match[4] || ""}`;
  }
  match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}${match[4] || ""}`;
  }
  return null;
}

function roundQuantity(value: number) {
  return Math.round(value * 100) / 100;
}
