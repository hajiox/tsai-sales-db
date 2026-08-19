import * as XLSX from "xlsx";

export type DeliveryPattern = "冷凍" | "冷蔵" | "通常" | "ネコポス" | "未設定";
export type ShippingSource = "amazon" | "yahoo";

export type RawRow = Record<string, unknown>;

export type ConversionTableRow = {
  id?: string;
  amazonName: string;
  sku: string;
  yahooName: string;
  yahooItemId: string;
  labelName: string;
  amazonPattern: string;
  deliveryPattern: DeliveryPattern;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type SenderSettings = {
  shipDate: string;
  phone: string;
  postalCode: string;
  address: string;
  address1: string;
  address2: string;
  name: string;
  customerCode: string;
  freightManagementNumber: string;
  sagawaPackageType: string;
  sagawaPaymentType: string;
};

export type ConvertedOrder = {
  orderId: string;
  sku: string;
  buyerName: string;
  recipientName: string;
  phone: string;
  postalCode: string;
  address1: string;
  address2: string;
  labelName: string;
  giftNote: string;
  deliveryPattern: DeliveryPattern;
};

type MappedOrderLine = {
  order: ConvertedOrder;
  mapping: ConversionTableRow;
  quantity: number;
};

export type MissingMapping = {
  source: ShippingSource;
  orderId: string;
  sku: string;
  productName: string;
  quantity: string;
  shipServiceLevel: string;
};

export type ConversionResult = {
  yamatoRows: string[][];
  sagawaRows: string[][];
  yamatoOrders: ConvertedOrder[];
  sagawaOrders: ConvertedOrder[];
  missingMappings: MissingMapping[];
  skippedRows: number;
};

export const AMAZON_SENDER_NAME = "会津ブランド館　Amazon店";
export const YAHOO_SENDER_NAME = "会津ブランド館ヤフー店";

export const DEFAULT_SENDER_SETTINGS: SenderSettings = {
  shipDate: formatDateForCarrier(new Date()),
  phone: "0242254141",
  postalCode: "965-0044",
  address: "福島県会津若松市七日町6-15",
  address1: "福島県会津若松市七日町",
  address2: "6-15",
  name: AMAZON_SENDER_NAME,
  customerCode: "0242254141",
  freightManagementNumber: "01",
  sagawaPackageType: "001",
  sagawaPaymentType: "1",
};

export const YAMATO_B2_HEADERS = [
  "お客様管理番号",
  "送り状種類",
  "クール区分",
  "伝票番号",
  "出荷予定日",
  "お届け予定日",
  "配達時間帯",
  "お届け先コード",
  "お届け先電話番号",
  "お届け先電話番号枝番",
  "お届け先郵便番号",
  "お届け先住所",
  "お届け先アパートマンション名",
  "お届け先会社・部門１",
  "お届け先会社・部門２",
  "お届け先名",
  "お届け先名(ｶﾅ)",
  "敬称",
  "ご依頼主コード",
  "ご依頼主電話番号",
  "ご依頼主電話番号枝番",
  "ご依頼主郵便番号",
  "ご依頼主住所",
  "ご依頼主アパートマンション",
  "ご依頼主名",
  "ご依頼主名(ｶﾅ)",
  "品名コード１",
  "品名１",
  "品名コード２",
  "品名２",
  "荷扱い１",
  "荷扱い２",
  "記事",
  "ｺﾚｸﾄ代金引換額（税込)",
  "内消費税額等",
  "止置き",
  "営業所コード",
  "発行枚数",
  "個数口表示フラグ",
  "請求先顧客コード",
  "請求先分類コード",
  "運賃管理番号",
  "クロネコwebコレクトデータ登録",
  "クロネコwebコレクト加盟店番号",
  "クロネコwebコレクト申込受付番号１",
  "クロネコwebコレクト申込受付番号２",
  "クロネコwebコレクト申込受付番号３",
  "お届け予定ｅメール利用区分",
  "お届け予定ｅメールe-mailアドレス",
  "入力機種",
  "お届け予定ｅメールメッセージ",
  "お届け完了ｅメール利用区分",
  "お届け完了ｅメールe-mailアドレス",
  "お届け完了ｅメールメッセージ",
  "クロネコ収納代行利用区分",
  "予備",
  "収納代行請求金額(税込)",
  "収納代行内消費税額等",
  "収納代行請求先郵便番号",
  "収納代行請求先住所",
  "収納代行請求先住所（アパートマンション名）",
  "収納代行請求先会社・部門名１",
  "収納代行請求先会社・部門名２",
  "収納代行請求先名(漢字)",
  "収納代行請求先名(カナ)",
  "収納代行問合せ先名(漢字)",
  "収納代行問合せ先郵便番号",
  "収納代行問合せ先住所",
  "収納代行問合せ先住所（アパートマンション名）",
  "収納代行問合せ先電話番号",
  "収納代行管理番号",
  "収納代行品名",
  "収納代行備考",
  "複数口くくりキー",
  "検索キータイトル1",
  "検索キー1",
  "検索キータイトル2",
  "検索キー2",
  "検索キータイトル3",
  "検索キー3",
  "検索キータイトル4",
  "検索キー4",
  "検索キータイトル5",
  "検索キー5",
  "予備",
  "予備２",
  "投函予定メール利用区分",
  "投函予定メールe-mailアドレス",
  "投函予定メールメッセージ",
  "投函完了メール（お届け先宛）利用区分",
  "投函完了メール（お届け先宛）e-mailアドレス",
  "投函完了メール（お届け先宛）メールメッセージ",
  "投函完了メール（ご依頼主宛）利用区分",
  "投函完了メール（ご依頼主宛）e-mailアドレス",
  "投函完了メール（ご依頼主宛）メールメッセージ",
];

export const SAGAWA_HEADERS = [
  "お届け先コード取得区分",
  "お届け先コード",
  "お届け先電話番号",
  "お届け先郵便番号",
  "お届け先住所１",
  "お届け先住所２",
  "お届け先住所３",
  "お届け先名称１",
  "お届け先名称２",
  "お客様管理番号",
  "お客様コード",
  "部署ご担当者コード取得区分",
  "部署ご担当者コード",
  "部署ご担当者名称",
  "荷送人電話番号",
  "ご依頼主コード取得区分",
  "ご依頼主コード",
  "ご依頼主電話番号",
  "ご依頼主郵便番号",
  "ご依頼主住所１",
  "ご依頼主住所２",
  "ご依頼主名称１",
  "ご依頼主名称２",
  "荷姿",
  "品名１",
  "品名２",
  "品名３",
  "品名４",
  "品名５",
  "荷札荷姿",
  "荷札品名１",
  "荷札品名２",
  "荷札品名３",
  "荷札品名４",
  "荷札品名５",
  "荷札品名６",
  "荷札品名７",
  "荷札品名８",
  "荷札品名９",
  "荷札品名１０",
  "荷札品名１１",
  "出荷個数",
  "スピード指定",
  "クール便指定",
  "配達日",
  "配達指定時間帯",
  "配達指定時間（時分）",
  "代引金額",
  "消費税",
  "決済種別",
  "保険金額",
  "指定シール１",
  "指定シール２",
  "指定シール３",
  "営業所受取",
  "SRC区分",
  "営業所受取営業所コード",
  "元着区分",
  "メールアドレス",
  "ご不在時連絡先",
  "出荷日",
  "お問い合せ送り状No.",
  "出荷場印字区分",
  "集約解除指定",
  "編集０１",
  "編集０２",
  "編集０３",
  "編集０４",
  "編集０５",
  "編集０６",
  "編集０７",
  "編集０８",
  "編集０９",
  "編集１０",
];

export async function readSheetFile(file: File): Promise<RawRow[]> {
  return readSheetBuffer(file.name, await file.arrayBuffer());
}

export function readSheetBuffer(fileName: string, buffer: ArrayBuffer): RawRow[] {
  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(fileName);
  const workbook = isExcel
    ? XLSX.read(buffer, { type: "array", raw: false, cellDates: false, cellNF: true })
    : XLSX.read(decodeTextFile(buffer), { type: "string", raw: true, cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: !isExcel });
  if (isExcel) restoreExcelAddressCells(sheet, rows);
  return rows.filter((row) => Object.values(row).some((value) => text(value)));
}

function restoreExcelAddressCells(sheet: XLSX.WorkSheet, rows: RawRow[]): void {
  const rangeRef = sheet["!ref"];
  if (!rangeRef) return;

  const range = XLSX.utils.decode_range(rangeRef);
  const addressColumns: Array<{ column: number; header: string }> = [];
  for (let column = range.s.c; column <= range.e.c; column++) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
    const header = text(headerCell?.w ?? headerCell?.v);
    if (isAddressHeader(header)) addressColumns.push({ column, header });
  }

  for (const row of rows as Array<RawRow & { __rowNum__?: number }>) {
    if (typeof row.__rowNum__ !== "number") continue;
    for (const { column, header } of addressColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row.__rowNum__, c: column })];
      const restored = restoreAddressDateCell(cell);
      if (restored) row[header] = restored;
    }
  }
}

function isAddressHeader(header: string): boolean {
  return /^(?:ship-address-[123]|shipaddress(?:1|2|3|full))$/i.test(header);
}

function restoreAddressDateCell(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t !== "n" || typeof cell.v !== "number") return "";

  const format = text(cell.z);
  const formatted = text(cell.w);
  const looksLikeDate = (format && XLSX.SSF.is_date(format)) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(formatted);
  if (!looksLikeDate) return "";

  const parsed = XLSX.SSF.parse_date_code(cell.v);
  if (!parsed) return "";

  if (/m{3,4}.*y|y.*m{3,4}/i.test(format) || parsed.y >= 2100) {
    return `${parsed.y}-${parsed.m}`;
  }
  if (parsed.y === 2001) {
    return `${parsed.m}-${parsed.d}`;
  }
  return `${parsed.m}-${parsed.d}-${parsed.y % 100}`;
}

function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.slice(2));
  }

  const nulBytes = bytes.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
  const candidates = nulBytes > bytes.length * 0.1
    ? ["utf-16le", "utf-16be", "utf-8", "shift-jis"]
    : ["utf-8", "shift-jis", "euc-jp"];
  return candidates
    .map((encoding) => {
      try {
        const value = new TextDecoder(encoding).decode(bytes);
        return { value, score: scoreDecodedText(value) + (encoding === "utf-8" ? 0 : 1) };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { value: string; score: number } => Boolean(candidate))
    .sort((a, b) => a.score - b.score)[0]?.value ?? new TextDecoder("utf-8").decode(bytes);
}

function scoreDecodedText(value: string): number {
  const replacementChars = (value.match(/\uFFFD/g) || []).length;
  const controlChars = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const mojibakeHints = (value.match(/[縺繧荳譁蜿逕隕豁]/g) || []).length;
  const japaneseChars = (value.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  const delimiterCount = (value.match(/[,\t]/g) || []).length;
  const newlineCount = (value.match(/\r?\n/g) || []).length;
  const yahooHeaderSignals = ["OrderId", "ItemId", "ShipName"].filter((header) => value.includes(header)).length;
  return (
    replacementChars * 1000 +
    controlChars * 100 +
    mojibakeHints * 20 -
    japaneseChars * 0.1 -
    Math.min(delimiterCount, 500) * 0.2 -
    Math.min(newlineCount, 200) * 2 -
    yahooHeaderSignals * 500
  );
}

export function normalizeConversionTable(rows: RawRow[]): ConversionTableRow[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const nameKey = findHeader(headers, ["Amazon", "登録"]) ?? headers[0];
  const skuKey = findHeader(headers, ["SKU"]) ?? headers[1];
  const labelKey = findHeader(headers, ["伝票", "記載"]) ?? headers[2];
  const amazonPatternKey = findHeader(headers, ["Amazon", "配送"]) ?? headers[3];
  const deliveryPatternKey = findHeader(headers, ["ヤマト", "配送"]) ?? headers[4];

  return rows
    .map((row) => ({
      amazonName: text(row[nameKey]),
      sku: text(row[skuKey]),
      yahooName: "",
      yahooItemId: "",
      labelName: text(row[labelKey]),
      amazonPattern: text(row[amazonPatternKey]),
      deliveryPattern: normalizeDeliveryPattern(row[deliveryPatternKey]),
    }))
    .filter((row) => row.sku || row.amazonName || row.labelName);
}

export function convertAmazonOrders(
  amazonRows: RawRow[],
  conversionRows: ConversionTableRow[],
  settings: SenderSettings,
): ConversionResult {
  return convertOrderRows(amazonRows, conversionRows, settings, "amazon");
}

export function convertYahooOrders(
  yahooRows: RawRow[],
  conversionRows: ConversionTableRow[],
  settings: SenderSettings,
): ConversionResult {
  return convertOrderRows(expandYahooOrders(yahooRows), conversionRows, settings, "yahoo");
}

export function expandYahooOrders(yahooRows: RawRow[]): RawRow[] {
  const expanded: RawRow[] = [];

  for (const raw of yahooRows) {
    const itemIds = parseYahooLineField(raw["ItemId"]);
    const titles = parseYahooLineField(raw["Title"]);
    const quantities = parseYahooLineField(raw["QuantityDetail"]);
    const keys = itemIds.size ? Array.from(itemIds.keys()) : ["L1"];

    for (const key of keys) {
      const sku = itemIds.get(key) || (keys.length === 1 ? text(raw["ItemId"]) : "");
      expanded.push({
        "order-id": text(raw["OrderId"]),
        sku,
        "product-name": titles.get(key) || text(raw["Title"]),
        "quantity-to-ship": quantities.get(key) || "1",
        "recipient-name": firstText(raw, ["ShipName"]) || joinName(raw["ShipLastName"], raw["ShipFirstName"]),
        "buyer-name": firstText(raw, ["BillName"]) || joinName(raw["BillLastName"], raw["BillFirstName"]),
        "ship-phone-number": text(raw["ShipPhoneNumber"]),
        "ship-postal-code": text(raw["ShipZipCode"]),
        "ship-state": text(raw["ShipPrefecture"]),
        "ship-city": text(raw["ShipCity"]),
        "ship-address-1": text(raw["ShipAddress1"]),
        "ship-address-2": text(raw["ShipAddress2"]),
        "ship-service-level": text(raw["ShipMethodName"]) || text(raw["ShipMethod"]),
      });
    }
  }

  return expanded;
}

function convertOrderRows(
  orderRows: RawRow[],
  conversionRows: ConversionTableRow[],
  settings: SenderSettings,
  source: ShippingSource,
): ConversionResult {
  const sourceSettings = {
    ...settings,
    name: source === "yahoo" ? YAHOO_SENDER_NAME : settings.name,
  };
  const map = new Map(
    conversionRows
      .map((row) => [source === "amazon" ? row.sku : row.yahooItemId, row] as const)
      .filter(([code]) => code),
  );
  const yamatoRows: string[][] = [];
  const sagawaRows: string[][] = [];
  const yamatoOrders: ConvertedOrder[] = [];
  const sagawaOrders: ConvertedOrder[] = [];
  const missingMappings: MissingMapping[] = [];
  const groupedOrders = new Map<string, MappedOrderLine[]>();
  let skippedRows = 0;

  for (const [index, raw] of orderRows.entries()) {
    const orderId = text(raw["order-id"]);
    const sku = text(raw["sku"]);
    if (!orderId && !sku) {
      skippedRows++;
      continue;
    }

    const mapping = map.get(sku);
    if (!mapping || mapping.deliveryPattern === "未設定") {
      missingMappings.push({
        source,
        orderId,
        sku,
        productName: text(raw["product-name"]),
        quantity: text(raw["quantity-to-ship"]) || text(raw["quantity-purchased"]),
        shipServiceLevel: text(raw["ship-service-level"]),
      });
      continue;
    }

    const order = normalizeOrder(raw, mapping);
    const groupKey = orderId || `__row_${index}_${sku}`;
    const lines = groupedOrders.get(groupKey) || [];
    lines.push({
      order,
      mapping,
      quantity: parseQuantity(raw),
    });
    groupedOrders.set(groupKey, lines);
  }

  for (const lines of groupedOrders.values()) {
    const patterns = lines.map((line) => line.mapping.deliveryPattern);
    const allNekopos = patterns.every((pattern) => pattern === "ネコポス");
    const totalNekoposQuantity = lines
      .filter((line) => line.mapping.deliveryPattern === "ネコポス")
      .reduce((sum, line) => sum + line.quantity, 0);
    const hasNormal = patterns.includes("通常");
    const hasFrozen = patterns.includes("冷凍");
    const hasChilled = patterns.includes("冷蔵");

    if (allNekopos && totalNekoposQuantity >= 3) {
      const mergedOrder = mergeOrderLines(lines, "通常");
      yamatoRows.push(buildYamatoRow(mergedOrder, sourceSettings));
      yamatoOrders.push(mergedOrder);
      continue;
    }

    if (hasNormal && (hasFrozen || hasChilled)) {
      const normalLines = lines.filter((line) => line.mapping.deliveryPattern === "通常");
      const frozenLines = lines.filter((line) => line.mapping.deliveryPattern === "冷凍");
      const chilledLines = lines.filter((line) => line.mapping.deliveryPattern === "冷蔵");
      const otherLines = lines.filter(
        (line) => !["通常", "冷凍", "冷蔵"].includes(line.mapping.deliveryPattern),
      );

      for (const order of [
        normalLines.length ? mergeOrderLines(normalLines, "通常") : null,
        frozenLines.length ? mergeOrderLines(frozenLines, "冷凍") : null,
        chilledLines.length ? mergeOrderLines(chilledLines, "冷蔵") : null,
      ]) {
        if (!order) continue;
        yamatoRows.push(buildYamatoRow(order, sourceSettings));
        yamatoOrders.push(order);
      }

      for (const otherGroup of groupLinesByPattern(otherLines).values()) {
        const order = mergeOrderLines(otherGroup, otherGroup[0].mapping.deliveryPattern);
        yamatoRows.push(buildYamatoRow(order, sourceSettings));
        yamatoOrders.push(order);
      }
      continue;
    }

    for (const patternLines of groupLinesByPattern(lines).values()) {
      const order = mergeOrderLines(patternLines, patternLines[0].mapping.deliveryPattern);
      if (order.deliveryPattern === "通常") {
        sagawaRows.push(buildSagawaRow(order, sourceSettings));
        sagawaOrders.push(order);
      } else {
        yamatoRows.push(buildYamatoRow(order, sourceSettings));
        yamatoOrders.push(order);
      }
    }
  }

  return { yamatoRows, sagawaRows, yamatoOrders, sagawaOrders, missingMappings, skippedRows };
}

export function buildYamatoCsv(rows: string[][]): string {
  return toCsv([YAMATO_B2_HEADERS, ...rows]);
}

export function buildSagawaCsv(rows: string[][]): string {
  return toCsv([SAGAWA_HEADERS, ...rows]);
}

export function buildMissingMappingCsv(rows: MissingMapping[]): string {
  return toCsv([
    ["source", "order-id", "item-code", "product-name", "quantity", "ship-service-level"],
    ...rows.map((row) => [row.source, row.orderId, row.sku, row.productName, row.quantity, row.shipServiceLevel]),
  ]);
}

export function buildConversionTableCsv(rows: ConversionTableRow[]): string {
  return toCsv([
    ["Amazon登録名", "Amazon SKU", "Yahoo登録名", "Yahoo商品コード", "伝票記載名", "Amazon配送パターン", "配送区分"],
    ...rows.map((row) => [
      row.amazonName,
      row.sku,
      row.yahooName,
      row.yahooItemId,
      row.labelName,
      row.amazonPattern,
      row.deliveryPattern,
    ]),
  ]);
}

export function createConversionRowsFromMissing(rows: MissingMapping[]): ConversionTableRow[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = `${row.source}:${row.sku}`;
      if (!row.sku || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      amazonName: row.source === "amazon" ? row.productName : "",
      sku: row.source === "amazon" ? row.sku : "",
      yahooName: row.source === "yahoo" ? row.productName : "",
      yahooItemId: row.source === "yahoo" ? row.sku : "",
      labelName: row.productName,
      amazonPattern: row.source === "amazon" ? row.shipServiceLevel : "",
      deliveryPattern: "未設定" as DeliveryPattern,
    }));
}

export function toCsv(rows: unknown[][]): string {
  const body = rows
    .map((row) =>
      row
        .map((value) => {
          const cell = text(value).replace(/\r?\n/g, "\n");
          return `"${cell.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  return `\uFEFF${body}\r\n`;
}

function normalizeOrder(raw: RawRow, mapping: ConversionTableRow): ConvertedOrder {
  const address = buildAddress(raw);
  const buyerName = text(raw["buyer-name"]);
  const recipientName = text(raw["recipient-name"]);
  return {
    orderId: text(raw["order-id"]),
    sku: text(raw["sku"]),
    buyerName,
    recipientName,
    phone: normalizePhone(firstText(raw, ["ship-phone-number", "recipient-phone-number", "buyer-phone-number", "phone-number"])),
    postalCode: text(raw["ship-postal-code"]),
    address1: address.address1,
    address2: address.address2,
    labelName: mapping.labelName || text(raw["product-name"]),
    giftNote: buildGiftNote(buyerName, recipientName),
    deliveryPattern: mapping.deliveryPattern,
  };
}

function parseYahooLineField(value: unknown): Map<string, string> {
  const source = text(value);
  const result = new Map<string, string>();
  const matches = Array.from(source.matchAll(/(?:^|&)L(\d+)=/g));

  if (!matches.length) {
    if (source) result.set("L1", source);
    return result;
  }

  for (const [index, match] of matches.entries()) {
    const key = `L${match[1]}`;
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    result.set(key, source.slice(start, end));
  }

  return result;
}

function joinName(lastName: unknown, firstName: unknown): string {
  return [text(lastName), text(firstName)].filter(Boolean).join(" ");
}

function groupLinesByPattern(lines: MappedOrderLine[]): Map<DeliveryPattern, MappedOrderLine[]> {
  const groups = new Map<DeliveryPattern, MappedOrderLine[]>();
  for (const line of lines) {
    const pattern = line.mapping.deliveryPattern;
    groups.set(pattern, [...(groups.get(pattern) || []), line]);
  }
  return groups;
}

function mergeOrderLines(lines: MappedOrderLine[], deliveryPattern: DeliveryPattern): ConvertedOrder {
  const base = lines[0].order;
  return {
    ...base,
    sku: uniqueJoined(lines.map((line) => line.order.sku)),
    labelName: mergeLabelNames(lines),
    deliveryPattern,
  };
}

function mergeLabelNames(lines: MappedOrderLine[]): string {
  const labelQuantity = new Map<string, number>();
  for (const line of lines) {
    const label = line.order.labelName;
    if (!label) continue;
    labelQuantity.set(label, (labelQuantity.get(label) || 0) + line.quantity);
  }

  return Array.from(labelQuantity.entries())
    .map(([label, quantity]) => (quantity > 1 ? `${label}×${quantity}` : label))
    .join(" / ");
}

function uniqueJoined(values: string[]): string {
  return Array.from(new Set(values.filter(Boolean))).join(" / ");
}

function parseQuantity(raw: RawRow): number {
  const value = Number(text(raw["quantity-to-ship"]) || text(raw["quantity-purchased"]) || "1");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function buildYamatoRow(order: ConvertedOrder, settings: SenderSettings): string[] {
  const row = blankRow(YAMATO_B2_HEADERS.length);
  row[0] = order.orderId;
  row[1] = order.deliveryPattern === "ネコポス" ? "7" : "0";
  row[2] = order.deliveryPattern === "冷凍" ? "1" : order.deliveryPattern === "冷蔵" ? "2" : "0";
  row[4] = settings.shipDate;
  row[8] = order.phone;
  row[10] = order.postalCode;
  row[11] = order.address1;
  row[12] = order.address2;
  row[15] = order.recipientName;
  row[19] = settings.phone;
  row[21] = settings.postalCode;
  row[22] = settings.address;
  row[24] = settings.name;
  row[27] = order.labelName;
  row[32] = order.giftNote;
  row[39] = settings.customerCode;
  row[41] = settings.freightManagementNumber;
  return row;
}

function buildSagawaRow(order: ConvertedOrder, settings: SenderSettings): string[] {
  const row = blankRow(SAGAWA_HEADERS.length);
  row[2] = order.phone;
  row[3] = order.postalCode;
  row[4] = order.address1;
  row[5] = order.address2;
  row[7] = order.recipientName;
  row[9] = normalizeSagawaCustomerReference(order.orderId);
  row[14] = settings.phone;
  row[17] = settings.phone;
  row[18] = settings.postalCode;
  row[19] = settings.address1;
  row[20] = settings.address2;
  row[21] = settings.name;
  row[23] = normalizeSagawaPackageType(settings.sagawaPackageType);
  row[24] = order.labelName;
  row[28] = order.giftNote;
  row[41] = "1";
  row[57] = normalizeSagawaPaymentType(settings.sagawaPaymentType);
  row[60] = settings.shipDate;
  return row;
}

function normalizeSagawaCustomerReference(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
}

function normalizeSagawaPackageType(value: string): string {
  const normalized = value.trim();
  const map: Record<string, string> = {
    "001": "001",
    箱: "001",
    箱類: "001",
    "002": "002",
    バッグ: "002",
    バッグ類: "002",
    "003": "003",
    スーツケース: "003",
    "004": "004",
    封筒: "004",
    封筒類: "004",
    "008": "008",
    その他: "008",
  };
  return map[normalized] || normalized;
}

function normalizeSagawaPaymentType(value: string): string {
  const normalized = value.trim();
  const map: Record<string, string> = {
    "1": "1",
    元払: "1",
    元払い: "1",
    "2": "2",
    着払: "2",
    着払い: "2",
  };
  return map[normalized] || normalized;
}

function buildAddress(raw: RawRow): { address1: string; address2: string } {
  const state = text(raw["ship-state"]);
  const city = text(raw["ship-city"]);
  const address1 = normalizeAddressFragment(text(raw["ship-address-1"]));
  const address2 = normalizeAddressFragment(text(raw["ship-address-2"]));
  const address3 = normalizeAddressFragment(text(raw["ship-address-3"]));
  return {
    address1: [state, city, address1].filter(Boolean).join(""),
    address2: [address2, address3].filter(Boolean).join(" "),
  };
}

function normalizeAddressFragment(value: string): string {
  const months: Record<string, string> = {
    Jan: "1",
    Feb: "2",
    Mar: "3",
    Apr: "4",
    May: "5",
    Jun: "6",
    Jul: "7",
    Aug: "8",
    Sep: "9",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  return value.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{1,2})\b/g, (_, month, day) => {
    return `${months[month]}-${day}`;
  });
}

function normalizePhone(value: string): string {
  let digits = value.replace(/[^\d]/g, "");
  if (digits.startsWith("0081")) digits = digits.slice(2);
  if (digits.startsWith("81") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits && !digits.startsWith("0") && (digits.length === 9 || digits.length === 10)) {
    digits = `0${digits}`;
  }
  return digits;
}

function buildGiftNote(buyerName: string, recipientName: string): string {
  const normalizedBuyer = normalizePersonName(buyerName);
  const normalizedRecipient = normalizePersonName(recipientName);
  if (!normalizedBuyer || !normalizedRecipient || normalizedBuyer === normalizedRecipient) return "";
  return `${buyerName.replace(/[\s\u3000]+/g, " ").trim()}ご依頼分`;
}

function normalizePersonName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .replace(/(?:様|さま)$/u, "")
    .toLocaleLowerCase("ja-JP");
}

function normalizeDeliveryPattern(value: unknown): DeliveryPattern {
  const v = text(value);
  if (v.includes("冷凍")) return "冷凍";
  if (v.includes("冷蔵")) return "冷蔵";
  if (v.includes("ネコポス") || v.includes("猫ポス")) return "ネコポス";
  if (v.includes("通常")) return "通常";
  return "未設定";
}

function findHeader(headers: string[], includes: string[]) {
  return headers.find((header) => includes.every((needle) => header.toLowerCase().includes(needle.toLowerCase())));
}

function blankRow(length: number): string[] {
  return Array.from({ length }, () => "");
}

function firstText(row: RawRow, keys: string[]): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDateForCarrier(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
