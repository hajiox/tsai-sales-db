import { createHash } from "node:crypto";
import { routeOperation, businessFileSchema, decodeBusinessFile, MAX_BUSINESS_FILE_BYTES, type BusinessOperation, type JsonSchema } from "./operation-contracts";

// Every loader and pathname is fixed here. User input never selects code, SQL,
// credentials, a remote URL, an AI model, or a worker prompt.
const object = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const text = (maxLength = 1000): JsonSchema => ({ type: "string", minLength: 1, maxLength });
const number = (minimum = -1e12, maximum = 1e12): JsonSchema => ({ type: "number", minimum, maximum });
const integer = (minimum = 0, maximum = 1000000): JsonSchema => ({ type: "integer", minimum, maximum });
const list = (items: JsonSchema, maxItems = 5000, minItems = 0): JsonSchema => ({ type: "array", items, minItems, maxItems });
const choice = (...values: string[]): JsonSchema => ({ type: "string", enum: values });
const boolean: JsonSchema = { type: "boolean" };
const uuid: JsonSchema = { type: "string", format: "uuid" };
const date: JsonSchema = { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const month: JsonSchema = { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" };
const activeChannel = choice("amazon", "rakuten", "yahoo", "base");
const historicChannel = choice("amazon", "rakuten", "yahoo", "base", "mercari", "qoo10", "tiktok");
const monthQuery = object({ query: object({ month }) });
const monthBody = object({ body: object({ month }) });
const idParams = object({ params: object({ id: uuid }) });
const file = { ...businessFileSchema, properties: { ...businessFileSchema.properties, field: choice("file") }, required: ["field", "filename", "mimeType", "base64"] } as JsonSchema;
const upload = (body?: JsonSchema): JsonSchema => object({ files: list(file, 1, 1), ...(body ? { body } : {}) });
const mapping = object({ key: text(200), name: text(200), access: text(200), conversions: text(200), sales: text(200), profit: text(200), state: text(200) });
const settings = object({
  channel: activeChannel, start: date, end: date,
  metric: choice("orders_sessions", "units_sessions", "orders_visitors", "buyers_visitors", "orders_views", "units_views"),
  source: text(200), scope: text(200), coverage: choice("all", "partial"), minimumAccess: integer(1),
  accessThreshold: { anyOf: [number(0.000001), { type: "null" }] }, cvrThreshold: { anyOf: [number(0.000001, 10000), { type: "null" }] },
}, ["channel", "start", "end", "metric", "source", "scope", "coverage", "accessThreshold", "cvrThreshold"]);
const confirmationRow = (channel: string): JsonSchema => object({
  productId: uuid, [`${channel}Title`]: text(2000), quantity: integer(0, 1e9), amount: number(),
}, ["productId", `${channel}Title`, "quantity", "amount"]);
const conversionMapping = object({
  id: uuid, amazonName: { type: "string", maxLength: 2000 }, sku: { type: "string", maxLength: 300 },
  yahooName: { type: "string", maxLength: 2000 }, yahooItemId: { type: "string", maxLength: 300 },
  labelName: text(500), amazonPattern: { type: "string", maxLength: 500 }, deliveryPattern: choice("冷凍", "冷蔵", "通常", "ネコポス", "未設定"),
  sortOrder: integer(),
}, ["amazonName", "sku", "yahooName", "yahooItemId", "labelName", "amazonPattern", "deliveryPattern"]);
const senderSettings = object({
  shipDate: date, phone: text(50), postalCode: text(20), address: text(500), address1: text(500), address2: { type: "string", maxLength: 500 },
  name: text(200), customerCode: { type: "string", maxLength: 100 }, freightManagementNumber: { type: "string", maxLength: 100 },
  sagawaPackageType: text(50), sagawaPaymentType: text(50),
});
const route = (name: string, description: string, mutation: boolean, method: "GET" | "POST" | "PUT" | "DELETE", pathname: string, schema: JsonSchema, load: () => Promise<unknown>) => routeOperation({ name, description, mutation, method, pathname, schema, load });
const acquisitionSchema = object({ body: { anyOf: [
  object({ taskKey: choice("web_sales_import", "ec_profit_import"), channels: list(activeChannel, 4, 1), startDate: date, endDate: date, incompleteOnly: boolean }, ["taskKey", "channels", "startDate", "endDate"]),
  object({ taskKey: choice("ad_cost_import"), channels: list(choice("google", "meta", "amazon", "rakuten", "yahoo"), 5, 1), startDate: date, endDate: date, incompleteOnly: boolean }, ["taskKey", "channels", "startDate", "endDate"]),
] } });
const analysisResult = object({
  status: choice("completed", "needs_review"), executive_summary: text(8000), sales_analysis: text(20000), expense_analysis: text(20000), floor_staff_summary: text(800),
  actions: list(object({ priority: integer(1, 5), area: choice("sales", "product", "channel", "advertising", "fees", "data"), title: text(160), rationale: text(3000), evidence: list(text(500), 8, 1), expected_impact: text(1000), deadline: text(100), metric: text(500), stop_condition: text(800), confidence: choice("high", "medium", "low") }), 12, 3),
  risks: list(object({ severity: choice("high", "medium", "low"), title: text(160), detail: text(2000), evidence: list(text(500), 6, 1) }), 10),
  data_quality: object({ grade: choice("A", "B", "C", "D"), summary: text(2000), limitations: list(text(500), 12) }),
});
const dealColumn = object({ key: text(200), header: { type: "string", maxLength: 2000 }, field: { type: "string", maxLength: 2000 }, columnLetter: text(5), columnIndex: integer(0, 16383), role: choice("parentAsin", "featuredAsin", "dealAsin", "productName", "dealType", "recommendationId", "sku", "participating", "schedule", "startDate", "endDate", "sellerPrice", "dealPrice", "committedUnits", "sellerQuantity", "imageUrl", "other"), editable: boolean, hidden: boolean, required: boolean });
const dealValues: JsonSchema = { type: "object", additionalProperties: { anyOf: [{ type: "string", maxLength: 10000 }, number(), { type: "null" }] }, maxProperties: 1000 };
const dealWriteTargets: JsonSchema = { type: "object", additionalProperties: { type: "string", pattern: "^[A-Z]{1,3}[1-9][0-9]{0,6}$" }, maxProperties: 1000 };
const dealHistoryRow = object({
  id: text(200), rowNumber: integer(1, 1048576), groupKey: { type: "string", maxLength: 1000 }, values: dealValues,
  displayValues: { type: "object", additionalProperties: { type: "string", maxLength: 10000 }, maxProperties: 1000 },
  options: { type: "object", additionalProperties: list({ type: "string", maxLength: 1000 }, 1000), maxProperties: 1000 },
  writeTargets: dealWriteTargets, validationMessages: list(text(2000), 1000),
});
const nullableDate: JsonSchema = { anyOf: [date, { type: "null" }] };
const dealHistoryParsed = object({
  sheetName: text(200), headerRowNumber: integer(1, 1048576), fieldRowNumber: integer(1, 1048576), dataStartRowNumber: integer(1, 1048576), rowCount: integer(0, 10000),
  columns: list(dealColumn, 1000, 1), editableKeys: list(text(200), 1000),
  summary: object({ participating: integer(), notParticipating: integer(), bestDeal: integer(), lightningDeal: integer(), warnings: integer(), minStartDate: nullableDate, maxEndDate: nullableDate }),
});

export const financeOperations: BusinessOperation[] = [
  route("finance_acquisition_enqueue", "売上・広告費・EC控除を既存の公式API/Bridge取得待機へ登録。稼働中・保存済み結果を保持します。", true, "POST", "/api/web-sales/acquisition/run",
    acquisitionSchema,
    () => import("@/app/api/web-sales/acquisition/run/route")),
  route("web_sales_monthly_report", "保存済みWEB月次実績を通常画面と同じ実売額・原価で集計。", false, "GET", "/api/web-sales-data", monthQuery, () => import("@/app/api/web-sales-data/route")),
  route("web_sales_period_report", "保存済みWEB実績を指定月から指定月数で集計。", false, "POST", "/api/web-sales-period", object({ body: object({ base_month: month, period_months: integer(1, 120) }) }), () => import("@/app/api/web-sales-period/route")),
  route("web_sales_chart_report", "通常画面と同じ6/12か月推移と財務・シリーズ集計。", false, "GET", "/api/web-sales-chart-data", object({ query: object({ month, months: choice("6", "12") }, ["month"]) }), () => import("@/app/api/web-sales-chart-data/route")),
  route("web_sales_display_period", "原本の登録状況から通常画面の集計期間を確認。", false, "GET", "/api/web-sales/display-period", monthQuery, () => import("@/app/api/web-sales/display-period/route")),
  route("web_sales_mapping_finalize", "確認済み未紐付け商品を紐付け、既存月次確定処理を再実行。", true, "POST", "/api/web-sales/automation/mapping", object({ body: object({ unmatchedId: uuid, productId: uuid }) }), () => import("@/app/api/web-sales/automation/mapping/route")),
  route("web_sales_channel_clear", "指定月・指定チャネルの売上数量と実売額を通常画面と同じ処理で消去。allは全EC列、csvは月次行全体を削除。", true, "POST", "/api/web-sales/channel-delete", object({ body: object({ month, channel: choice("csv", "amazon", "rakuten", "yahoo", "base", "mercari", "qoo10", "tiktok", "all") }) }), () => import("@/app/api/web-sales/channel-delete/route")),
  route("ec_profit_report", "月次売上・原価・EC控除・広告費・最終利益と品質を通常画面と同じ計算で取得。退店先の保存履歴も含みます。", false, "GET", "/api/web-sales/ec-profit", monthQuery, () => import("@/app/api/web-sales/ec-profit/route")),
  route("ec_profit_estimate", "楽天の既存推計ルールでEC控除概算を更新。確定原本の保護を維持。", true, "POST", "/api/web-sales/ec-profit/estimate", object({ body: object({ month, channels: list(choice("rakuten"), 1, 1) }) }), () => import("@/app/api/web-sales/ec-profit/estimate/route")),
  route("web_sales_analysis_enqueue", "通常画面の集計期間・固定モデル契約でWEB売上経費分析を開始。", true, "POST", "/api/web-sales/analysis", monthBody, () => import("@/app/api/web-sales/analysis/route")),
  route("web_sales_analysis_packet", "月末WEB分析の根拠packet・hash・保存requestIdを取得。", false, "GET", "/api/web-sales/analysis/direct/packet", monthQuery, () => import("@/app/api/web-sales/analysis/direct/packet/route")),
  route("web_sales_analysis_save", "取得したpacket/hashと構造化分析を検証し不変履歴へ保存。外部投稿なし。", true, "POST", "/api/web-sales/analysis/direct/save", object({ body: object({ month, requestId: uuid, packetHash: { type: "string", pattern: "^[0-9a-f]{64}$" }, packet: { type: "object", additionalProperties: true }, model: text(100), data: analysisResult }) }), () => import("@/app/api/web-sales/analysis/direct/save/route")),
  route("web_sales_abcd_overview", "ABCD最新分析と財務判定を全稼働ECで取得。", false, "GET", "/api/web-sales/abcd", object({ query: object({ view: choice("overview") }) }), () => import("@/app/api/web-sales/abcd/route")),
  route("web_sales_abcd_history", "指定ECの保存済みABCD分析履歴を取得。退店先の履歴閲覧も可。", false, "GET", "/api/web-sales/abcd", object({ query: object({ channel: historicChannel }) }), () => import("@/app/api/web-sales/abcd/route")),
  route("web_sales_abcd_detail", "ABCD保存結果・関連改善履歴・現在の財務判定。", false, "GET", "/api/web-sales/abcd", object({ query: object({ id: uuid }) }), () => import("@/app/api/web-sales/abcd/route")),
  route("web_sales_abcd_inspect", "ABCD帳票のヘッダー・列候補・行数・期間メタデータを解析。", false, "POST", "/api/web-sales/abcd", object({ body: object({ mode: choice("inspect"), csv: text(3000000) }) }), () => import("@/app/api/web-sales/abcd/route")),
  route("web_sales_abcd_preview", "確認した列と分母分子・期間でABCDを計算し保存前に確認。", false, "POST", "/api/web-sales/abcd", object({ body: object({ mode: choice("preview"), csv: text(3000000), mapping, settings }) }), () => import("@/app/api/web-sales/abcd/route")),
  route("web_sales_abcd_save", "確認した稼働EC・期間・分母分子のABCD分析を重複防止付きで保存。", true, "POST", "/api/web-sales/abcd", object({ body: object({ mode: choice("save"), csv: text(3000000), mapping, settings, confirmed: { type: "boolean", enum: [true] } }) }), () => import("@/app/api/web-sales/abcd/route")),
  route("wholesale_delivery_note_options", "納品書用の確認済み顧客・レシピ紐付商品と取引条件を取得。", false, "GET", "/api/wholesale/delivery-notes/options", object({}), () => import("@/app/api/wholesale/delivery-notes/options/route")),
  route("wholesale_delivery_notes", "通常画面の納品書一覧を取得。", false, "GET", "/api/wholesale/delivery-notes", object({ query: object({ limit: integer(1, 100) }, []) }, []), () => import("@/app/api/wholesale/delivery-notes/route")),
  route("wholesale_delivery_note_detail", "納品書の全明細・取引条件・金額を取得。", false, "GET", "/api/wholesale/delivery-notes/[id]", object({ params: object({ id: text(200) }) }), () => import("@/app/api/wholesale/delivery-notes/[id]/route")),
  route("wholesale_delivery_note_create", "確認済み顧客・日付・明細で納品書を発行し通常画面と同じ卸売上を同期。", true, "POST", "/api/wholesale/delivery-notes", object({ body: object({
    deliveryDate: date, customerId: uuid, customerName: text(500), transactionType: choice("purchase", "consignment"), rate: number(0.000001, 1), memo: { type: "string", maxLength: 5000 },
    items: list(object({ productId: uuid, productName: text(500), quantity: integer(1, 1e9), unit: text(100), unitPrice: number(0), remarks: { type: "string", maxLength: 1000 } }, ["productId", "quantity", "unitPrice"]), 1000, 1),
  }, ["deliveryDate", "items"]) }), () => import("@/app/api/wholesale/delivery-notes/route")),
  route("wholesale_delivery_note_delete", "指定納品書を削除し関連卸売上を通常画面と同じ処理で再構築。", true, "DELETE", "/api/wholesale/delivery-notes/[id]", object({ params: object({ id: text(200) }) }), () => import("@/app/api/wholesale/delivery-notes/[id]/route")),
  route("wholesale_sales_import", "確認済み卸CSV行を通常画面の金額計算で登録。未登録名は既存仕様に従い商品登録されます。", true, "POST", "/api/wholesale/sales/import", object({ body: object({ data: list(object({ productName: text(500), price: number(0), saleDate: date, quantity: number() }), 10000, 1) }) }), () => import("@/app/api/wholesale/sales/import/route")),
  route("wholesale_sales_month_delete", "指定した1か月の卸売上を通常画面と同じ一括削除処理で削除。", true, "DELETE", "/api/wholesale/sales/delete-month", monthBody, () => import("@/app/api/wholesale/sales/delete-month/route")),
  route("wholesale_product_statistics", "指定年月の卸/OEM商品別販売統計を通常画面と同じRPCで取得。", false, "GET", "/api/wholesale/products/statistics", object({ query: object({ year: integer(2000, 2200), month: integer(1, 12), type: choice("通常卸", "OEM") }, ["year", "month"]) }), () => import("@/app/api/wholesale/products/statistics/route")),
  route("wholesale_inventory_master_status", "助ネコ商品基本情報マスターの取込状態を確認。", false, "GET", "/api/wholesale/inventory/master", object({}), () => import("@/app/api/wholesale/inventory/master/route")),
  route("wholesale_inventory_master_import", "助ネコ商品基本情報CSVを登録。全件原本の検証を維持。", true, "POST", "/api/wholesale/inventory/master", upload(), () => import("@/app/api/wholesale/inventory/master/route")),
  route("wholesale_inventory_import", "助ネコ在庫CSVをマスター・レシピと照合し棚卸へ登録。確認済み手動単価を保持。", true, "POST", "/api/wholesale/inventory/import", upload(object({ fiscalYear: integer(2000, 2200) })), () => import("@/app/api/wholesale/inventory/import/route")),
  route("google_ads_sync", "指定期間のGoogle広告実績を既存APIで取得。", true, "POST", "/api/google-ads/sync", object({ body: object({ startDate: date, endDate: date }) }), () => import("@/app/api/google-ads/sync/route")),
  route("google_ads_mapping_learn", "確認済みアセットグループをシリーズへ紐付け実績へ同期。", true, "POST", "/api/google-ads/learn-mapping", object({ body: object({ asset_group_name: text(500), series_code: integer(1) }) }), () => import("@/app/api/google-ads/learn-mapping/route")),
  route("google_ads_import_costs", "確認済みGoogle広告シリーズ配賦を月次広告費へ反映。", true, "POST", "/api/google-ads/import-costs", object({ body: object({ month, mappings: list(object({ series_code: integer(1), cost: number(0) }), 5000, 1) }) }), () => import("@/app/api/google-ads/import-costs/route")),
  route("rakuten_ads_product_names", "楽天商品コード・商品名を一括登録し既存実績表示へ同期。", true, "POST", "/api/rakuten-ads/product-names", object({ body: object({ items: list(object({ product_code: text(300), product_name: text(2000) }), 5000, 1) }) }), () => import("@/app/api/rakuten-ads/product-names/route")),
  route("amazon_deals_parse", "Amazon推奨セールExcelを通常画面と同じ列・編集可能セルで解析。", false, "POST", "/api/amazon-deals/parse", upload(), () => import("@/app/api/amazon-deals/parse/route")),
  routeOperation({ name: "amazon_deals_export", description: "解析したセールExcelの編集可能セルだけを書き戻しExcel成果物を生成。ECへ公開しません。", mutation: false, method: "POST", pathname: "/api/amazon-deals/export", schema: object({ files: list(file, 1, 1), body: object({
    sheetName: text(200), fileName: text(200),
    columns: list(dealColumn, 1000, 1),
    rows: list(object({ rowNumber: integer(1, 1048576), values: dealValues, writeTargets: dealWriteTargets }, ["rowNumber", "values"]), 10000, 1),
  }, ["sheetName", "columns", "rows"]) }), load: () => import("@/app/api/amazon-deals/export/route"),
    buildRequest: (input, origin) => {
      const original = decodeBusinessFile((input.files as unknown[])[0]);
      return new Request(new URL("/api/amazon-deals/export", origin), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(input.body as Record<string, unknown>), workbookBase64: original.bytes.toString("base64"), fileName: (input.body as Record<string, unknown>).fileName || original.filename }) });
    },
  }),
  route("amazon_deals_histories", "Amazonセール表の仮保存・出力保存履歴と集計を取得。", false, "GET", "/api/amazon-deals/histories", object({}), () => import("@/app/api/amazon-deals/histories/route")),
  route("amazon_deals_history_detail", "保存済みAmazonセール原本・編集値・検証結果を取得。", false, "GET", "/api/amazon-deals/histories/[id]", idParams, () => import("@/app/api/amazon-deals/histories/[id]/route")),
  routeOperation({ name: "amazon_deals_history_save", description: "確認済みセール表と原本を仮保存/出力保存し通常画面と同じ件数集計を保存。EC公開なし。", mutation: true, method: "POST", pathname: "/api/amazon-deals/histories", schema: upload(object({ title: text(200), status: choice("draft", "exported"), parsed: dealHistoryParsed, rows: list(dealHistoryRow, 10000) }, ["status", "parsed", "rows"])), load: () => import("@/app/api/amazon-deals/histories/route"),
    buildRequest: (input, origin) => {
      const original = decodeBusinessFile((input.files as unknown[])[0]);
      const body = input.body as Record<string, unknown>;
      return new Request(new URL("/api/amazon-deals/histories", origin), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: body.title, status: body.status, payload: { parsed: { ...(body.parsed as Record<string, unknown>), fileName: original.filename, workbookBase64: original.bytes.toString("base64") }, rows: body.rows } }) });
    },
  }),
  route("annual_plan_csv_export", "当会計年度の前年度実績・目標・実績を既存CSV形式で出力。", false, "GET", "/api/annual-plan/export.csv", object({}), () => import("@/app/api/annual-plan/export.csv/route")),
  route("kpi_monthly_csv_export", "当月・前月・年度累計のKPIを既存CSV形式で出力。", false, "GET", "/api/kpi-monthly/summary.csv", object({}), () => import("@/app/api/kpi-monthly/summary.csv/route")),
  route("daily_sales_report_text", "最新の日次売上報告と月内累計の報告文を生成。外部投稿なし。", false, "POST", "/api/report", object({}), () => import("@/app/api/report/route")),
];

const salesCsvLoaders = {
  amazon: { parse: () => import("@/app/api/import/amazon-parse/route"), confirm: () => import("@/app/api/import/amazon-confirm/route") },
  rakuten: { parse: () => import("@/app/api/import/rakuten-parse/route"), confirm: () => import("@/app/api/import/rakuten-confirm/route") },
  yahoo: { parse: () => import("@/app/api/import/yahoo-parse/route"), confirm: () => import("@/app/api/import/yahoo-confirm/route") },
  base: { parse: () => import("@/app/api/import/base-parse/route"), confirm: () => import("@/app/api/import/base-confirm/route") },
} as const;
for (const channel of Object.keys(salesCsvLoaders) as Array<keyof typeof salesCsvLoaders>) {
  financeOperations.push(
    route(`web_sales_${channel}_csv_parse`, `${channel}公式売上CSVの原本金額・数量を解析し既存紐付け候補を返します。候補は保存されません。`, false, "POST", `/api/import/${channel}-parse`, upload(), salesCsvLoaders[channel].parse),
    route(`web_sales_${channel}_csv_confirm`, `${channel}公式売上CSVの確認済み紐付けを原本合計と照合し月次置換。`, true, "POST", `/api/import/${channel}-confirm`, object({ body: object({ targetMonth: month, matchedProducts: list(confirmationRow(channel)), newMappings: list(confirmationRow(channel)), expectedQuantity: integer(0, 1e12), expectedAmount: number() }) }), salesCsvLoaders[channel].confirm),
  );
}

const adsLoaders = {
  amazon: { upload: () => import("@/app/api/amazon-ads/upload-csv/route"), costs: () => import("@/app/api/amazon-ads/import-costs/route"), match: () => import("@/app/api/amazon-ads/auto-match/route"), clear: () => import("@/app/api/amazon-ads/clear-mappings/route"), delete: () => import("@/app/api/amazon-ads/delete-data/route"), analysis: () => import("@/app/api/amazon-ads/ai-analysis/route") },
  meta: { upload: () => import("@/app/api/meta-ads/upload-csv/route"), costs: () => import("@/app/api/meta-ads/import-costs/route"), match: () => import("@/app/api/meta-ads/auto-match/route"), clear: () => import("@/app/api/meta-ads/clear-mappings/route"), delete: () => import("@/app/api/meta-ads/delete-data/route"), analysis: () => import("@/app/api/meta-ads/ai-analysis/route") },
  rakuten: { upload: () => import("@/app/api/rakuten-ads/upload-csv/route"), costs: () => import("@/app/api/rakuten-ads/import-costs/route"), match: () => import("@/app/api/rakuten-ads/auto-match/route"), clear: () => import("@/app/api/rakuten-ads/clear-mappings/route"), delete: () => import("@/app/api/rakuten-ads/delete-data/route"), analysis: () => import("@/app/api/rakuten-ads/ai-analysis/route") },
  yahoo: { upload: () => import("@/app/api/yahoo-ads/upload-csv/route"), costs: () => import("@/app/api/yahoo-ads/import-costs/route"), match: () => import("@/app/api/yahoo-ads/auto-match/route"), clear: () => import("@/app/api/yahoo-ads/clear-mappings/route"), delete: () => import("@/app/api/yahoo-ads/delete-data/route"), analysis: () => import("@/app/api/yahoo-ads/ai-analysis/route") },
} as const;
for (const channel of Object.keys(adsLoaders) as Array<keyof typeof adsLoaders>) {
  const loaders = adsLoaders[channel];
  financeOperations.push(route(`${channel}_ads_csv_upload`, `${channel}公式広告CSV/XLSXを既存の列検証・取込処理で登録。`, true, "POST", `/api/${channel}-ads/upload-csv`, upload(object({ month })), loaders.upload));
  for (const [action, suffix, description] of [
    ["costs", "import-costs", "紐付け済み広告実績のシリーズ別費用を月次広告費に反映"],
    ["match", "auto-match", "保存済み広告実績へ通常画面のシリーズ自動紐付けを適用"],
    ["clear", "clear-mappings", "指定月の広告実績のシリーズ紐付けを解除"],
    ["delete", "delete-data", "指定月の広告実績を通常画面の削除処理で削除"],
    ["analysis", "ai-analysis", "指定月の広告実績を通常画面の既存AI分析で評価（既存API利用）"],
  ] as const) financeOperations.push(route(`${channel}_ads_${action}`, `${channel}: ${description}。`, true, "POST", `/api/${channel}-ads/${suffix}`,
    channel === "meta" && action === "analysis" ? object({ body: object({ month, adSetName: text(500) }, ["month"]) }) : monthBody, loaders[action]));
}

financeOperations.push(route("google_ads_analysis", "指定月のGoogle広告実績を既存画面のAI分析で評価（既存API利用）。", true, "POST", "/api/google-ads/ai-analysis", object({ body: object({ month, assetGroupName: text(500) }, ["month"]) }), () => import("@/app/api/google-ads/ai-analysis/route")));

// Use dedicated projections rather than exposing worker prompts, parameters,
// credentials, storage paths, or raw acquisition metadata through generic CRUD.
financeOperations.push(routeOperation({
  name: "finance_jobs_status", description: "指定月の取得/分析ジョブ状態・成果物一覧を安全な業務項目だけで確認。", mutation: false, method: "GET", pathname: "/api/data-access/finance-status", schema: monthQuery,
  execute: async input => {
    const { createDataAccessAdminClient } = await import("./server");
    const db = createDataAccessAdminClient();
    const reportMonth = `${(input.query as { month: string }).month}-01`;
    const [jobs, acquisitions, workers] = await Promise.all([
      db.from("web_sales_codex_jobs").select("id,task_key,channel,status,progress,current_step,period_start,period_end,created_at,started_at,completed_at").eq("report_month", reportMonth).in("task_key", ["web_sales_import", "ad_cost_import", "ec_profit_import", "web_sales_analysis"]).order("created_at", { ascending: false }).limit(100),
      db.from("web_sales_acquisition_runs").select("id,kind,channel,route,status,period_start,period_end,started_at,completed_at").eq("report_month", reportMonth).order("started_at", { ascending: false }).limit(100),
      db.from("web_sales_codex_workers").select("name,status,last_seen_at").order("last_seen_at", { ascending: false }).limit(5),
    ]);
    if (jobs.error || acquisitions.error || workers.error) return Response.json({ error: "ジョブ状態を取得できません" }, { status: 503 });
    const ids = (jobs.data || []).map(row => row.id);
    const artifacts = ids.length ? await db.from("web_sales_codex_artifacts").select("id,job_id,file_name,content_type,byte_size,created_at").in("job_id", ids).eq("artifact_type", "source").order("created_at", { ascending: false }).limit(200) : { data: [], error: null };
    if (artifacts.error) return Response.json({ error: "成果物一覧を取得できません" }, { status: 503 });
    return Response.json({ jobs: jobs.data, acquisitions: acquisitions.data, workers: workers.data, artifacts: artifacts.data });
  },
}));
financeOperations.push(routeOperation({
  name: "finance_job_artifact", description: "確認済みジョブと成果物IDに結び付く業務原本（source）を取得。実行ログ・AI出力・画面画像・保存パス・署名URLは返しません。", mutation: false, method: "GET", pathname: "/api/data-access/finance-artifact", schema: object({ query: object({ jobId: uuid, artifactId: uuid }) }),
  execute: async input => {
    const { createDataAccessAdminClient } = await import("./server");
    const db = createDataAccessAdminClient();
    const query = input.query as { jobId: string; artifactId: string };
    const artifact = await db.from("web_sales_codex_artifacts").select("file_name,content_type,byte_size,storage_path").eq("id", query.artifactId).eq("job_id", query.jobId).eq("artifact_type", "source").maybeSingle();
    if (artifact.error || !artifact.data) return Response.json({ error: "成果物が見つかりません" }, { status: 404 });
    if (Number(artifact.data.byte_size) > MAX_BUSINESS_FILE_BYTES) return Response.json({ error: "成果物がMCP出力上限を超えています。TSAの原本取得画面を使用してください" }, { status: 413 });
    const downloaded = await db.storage.from("web-sales-codex").download(artifact.data.storage_path);
    if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_BUSINESS_FILE_BYTES) return Response.json({ error: "成果物を取得できません" }, { status: 503 });
    return new Response(await downloaded.data.arrayBuffer(), { headers: { "Content-Type": artifact.data.content_type || "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.data.file_name)}` } });
  },
}));
for (const action of ["cancel", "retry"] as const) financeOperations.push(routeOperation({
  name: `finance_job_${action}`, description: action === "cancel" ? "指定した取得/分析ジョブを通常画面と同じ状態制約で取消。実行中workerは停止しません。" : "失敗・確認待ちの取得/分析ジョブを通常画面の状態制約で再実行。退店先の新規取得は拒否。",
  mutation: true, method: "POST", pathname: "/api/web-sales/codex-jobs/[id]", schema: idParams,
  execute: async (input, context) => {
    const { createDataAccessAdminClient } = await import("./server");
    const id = (input.params as { id: string }).id;
    const job = await createDataAccessAdminClient().from("web_sales_codex_jobs").select("task_key,channel").eq("id", id).maybeSingle();
    if (job.error || !job.data) return Response.json({ error: "取得/分析ジョブが見つかりません" }, { status: 404 });
    if (!["web_sales_import", "ad_cost_import", "ec_profit_import", "web_sales_analysis"].includes(job.data.task_key)) return Response.json({ error: "この業務操作の対象外です" }, { status: 403 });
    const allowed = job.data.task_key === "ad_cost_import" ? ["google", "meta", "amazon", "rakuten", "yahoo"] : ["amazon", "rakuten", "yahoo", "base"];
    if (action === "retry" && job.data.task_key !== "web_sales_analysis" && !allowed.includes(job.data.channel)) return Response.json({ error: "退店先の新規取得は開始できません" }, { status: 400 });
    const { POST } = await import("@/app/api/web-sales/codex-jobs/[id]/route");
    const request = new Request(context.request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    return POST(request, { params: Promise.resolve({ id }) });
  },
}));
financeOperations.push(routeOperation({
  name: "shipping_labels_convert", description: "Amazon/Yahoo注文原本を登録済み変換表でヤマト/佐川CSVへ変換。未設定商品は一覧で返し出力に含めません。", mutation: false, method: "POST", pathname: "/api/data-access/shipping-convert",
  schema: object({ body: object({ source: choice("amazon", "yahoo"), settings: senderSettings, mappings: list(conversionMapping, 10000) }), files: list(file, 1, 1) }),
  execute: async input => {
    const lib = await import("@/lib/shipping-labels");
    const sourceFile = decodeBusinessFile((input.files as Record<string, unknown>[])[0]);
    const body = input.body as { source: "amazon" | "yahoo"; settings: import("@/lib/shipping-labels").SenderSettings; mappings: import("@/lib/shipping-labels").ConversionTableRow[] };
    const bytes = sourceFile.bytes;
    const rows = lib.readSheetBuffer(sourceFile.filename, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    if (rows.length > 20000) return Response.json({ error: "注文原本は20,000行以下にしてください" }, { status: 413 });
    const settings = { ...body.settings, shipDate: body.settings.shipDate.replaceAll("-", "/") };
    const converted = body.source === "amazon" ? lib.convertAmazonOrders(rows, body.mappings, settings) : lib.convertYahooOrders(rows, body.mappings, settings);
    const files = [
      { filename: `${body.source}_yamato_${body.settings.shipDate}.csv`, mimeType: "text/csv", encoding: "utf-8", content: lib.buildYamatoCsv(converted.yamatoRows), rowCount: converted.yamatoRows.length },
      { filename: `${body.source}_sagawa_${body.settings.shipDate}.csv`, mimeType: "text/csv", encoding: "utf-8", content: lib.buildSagawaCsv(converted.sagawaRows), rowCount: converted.sagawaRows.length },
    ].map(output => ({ ...output, sha256: createHash("sha256").update(output.content).digest("hex") }));
    return Response.json({ source: body.source, sourceRowCount: rows.length, files, missingMappings: converted.missingMappings, skippedRows: converted.skippedRows });
  },
}));
financeOperations.push(routeOperation({
  name: "shipping_labels_import_save", description: "Amazon/Yahoo注文原本と確認済み配送設定・変換表を配送履歴へ保存。", mutation: true, method: "POST", pathname: "/api/shipping-labels/history",
  schema: object({ body: object({ source: choice("amazon", "yahoo"), settings: senderSettings, mappings: list(conversionMapping, 10000) }), files: list(file, 1, 1) }),
  execute: async (input, context) => {
    const { readSheetBuffer } = await import("@/lib/shipping-labels");
    const sourceFile = decodeBusinessFile((input.files as unknown[])[0]);
    const bytes = sourceFile.bytes;
    const sourceRows = readSheetBuffer(sourceFile.filename, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    if (sourceRows.length > 20000) return Response.json({ error: "注文原本は20,000行以下にしてください" }, { status: 413 });
    const body = input.body as Record<string, unknown>;
    const { POST } = await import("@/app/api/shipping-labels/history/route");
    const settings = body.settings as Record<string, unknown>;
    return POST(new Request(context.request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: body.source, sourceFileName: sourceFile.filename, sourceRows, settings: { ...settings, shipDate: String(settings.shipDate).replaceAll("-", "/") }, conversionSnapshot: { mappings: body.mappings, sourceSha256: sourceFile.sha256 } }) }));
  },
}));
financeOperations.push(
  route("shipping_labels_history", "配送CSV変換の保存済み履歴を取得。", false, "GET", "/api/shipping-labels/history", object({}), () => import("@/app/api/shipping-labels/history/route")),
  route("shipping_labels_history_detail", "配送原本・変換設定・保存済み出力CSVを取得。", false, "GET", "/api/shipping-labels/history/[id]", idParams, () => import("@/app/api/shipping-labels/history/[id]/route")),
  route("shipping_labels_export_save", "確認済み変換履歴にヤマト/佐川出力CSVを保存。", true, "POST", "/api/shipping-labels/history/[id]/exports", object({ params: object({ id: uuid }), body: object({ carrier: choice("yamato", "sagawa"), fileName: text(200), csvContent: text(3000000), rowCount: integer(0, 20000) }) }), () => import("@/app/api/shipping-labels/history/[id]/exports/route")),
);
