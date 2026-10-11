import { businessFileSchema, decodeBusinessFile, routeOperation, type BusinessOperation, type JsonSchema } from "./operation-contracts";

// Only existing business handlers are reachable. There is no user-selected URL,
// module, SQL, credential, model, or execution prompt in this registry.
const obj = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const str = (maxLength = 1000): JsonSchema => ({ type: "string", minLength: 1, maxLength });
const optionalText = (maxLength = 1000): JsonSchema => ({ type: "string", maxLength });
const num = (minimum = -1e12, maximum = 1e12): JsonSchema => ({ type: "number", minimum, maximum });
const int = (minimum = 0, maximum = 1000000): JsonSchema => ({ type: "integer", minimum, maximum });
const arr = (items: JsonSchema, maxItems = 1000, minItems = 0): JsonSchema => ({ type: "array", items, minItems, maxItems });
const en = (...values: string[]): JsonSchema => ({ type: "string", enum: values });
const nullable = (value: JsonSchema): JsonSchema => ({ anyOf: [value, { type: "null" }] });
const uuid: JsonSchema = { type: "string", format: "uuid" };
const date: JsonSchema = { type: "string", format: "date" };
const month: JsonSchema = { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" };
const monthStart: JsonSchema = { type: "string", format: "date", pattern: "^\\d{4}-(0[1-9]|1[0-2])-01$" };
const bool: JsonSchema = { type: "boolean" };
const fileFor = (field: string, images = false): JsonSchema => ({ ...businessFileSchema, properties: { ...businessFileSchema.properties, field: en(field), ...(images ? { mimeType: en("image/jpeg", "image/png", "image/webp") } : {}) } });
const upload = (body?: JsonSchema, field = "file", count = 1, images = false): JsonSchema => obj({ files: arr(fileFor(field, images), count, 1), ...(body ? { body } : {}) });
const query = (properties: Record<string, JsonSchema>, required = Object.keys(properties)) => obj({ query: obj(properties, required) });
const body = (properties: Record<string, JsonSchema>, required = Object.keys(properties)) => obj({ body: obj(properties, required) });
const route = (name: string, description: string, mutation: boolean, method: "GET" | "POST" | "PATCH" | "DELETE", pathname: string, schema: JsonSchema, load: () => Promise<unknown>) => routeOperation({ name, description, mutation, method, pathname, schema, load });
const dateQuery = obj({ query: obj({ date }, []) }, []);
const empty = obj({});
const labelPayload = obj({
  request_id: uuid, mode: en("simple", "normal"), worker_name: str(50), file_name: nullable(optionalText(500)),
  product_name: nullable(optionalText(500)), raw_materials: nullable(optionalText(12000)), expiry_date_printed: nullable(optionalText(200)),
  expiry_date_normalized: nullable(date), manufacturing_date: nullable(date), shelf_life: str(200),
  matched_recipe: nullable(obj({ id: uuid, name: str(500), shelf_life: nullable(optionalText(200)) }, ["id", "name"])),
  confidence: nullable(num(0, 1)), label_data: { type: "object", maxProperties: 100, additionalProperties: true },
  save_recipe_shelf_life: bool, save_recipe_raw_materials: bool,
}, ["request_id", "mode", "worker_name", "expiry_date_normalized", "shelf_life"]);
const labelUpdates = obj({
  name: str(500), unit_quantity: num(0.000001), calories: num(0), protein: num(0), fat: num(0), carbohydrate: num(0), sodium: num(0),
  raw_materials: { type: "string", maxLength: 12000 }, allergens: { type: "string", maxLength: 2000 }, origin: { type: "string", maxLength: 1000 },
  manufacturer: { type: "string", maxLength: 1000 }, product_description: { type: "string", maxLength: 12000 }, nutrition_per: str(200),
}, []);

function labelledImages(name: string, description: string, pathname: string, save: boolean, load: () => Promise<unknown>): BusinessOperation {
  return routeOperation({ name, description, mutation: true, method: "POST", pathname, load,
    schema: upload(obj({ types: arr(en("front_label", "ingredients_label", "nutrition_label"), 4, 1), ...(save ? { ingredient_id: uuid } : {}) }), "files", 4, true),
    buildRequest: (input, origin) => {
      const data = input.body as { types: string[]; ingredient_id?: string };
      if (data.types.length !== (input.files as unknown[]).length) throw new Error("画像と種別の数が一致しません");
      const form = new FormData();
      for (const [index, value] of (input.files as unknown[]).entries()) {
        const file = decodeBusinessFile(value);
        form.append("files", new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.filename);
        form.append("types", data.types[index]);
      }
      if (save) form.append("ingredient_id", data.ingredient_id!);
      return new Request(new URL(pathname, origin), { method: "POST", body: form });
    },
  });
}

export const otherOperations: BusinessOperation[] = [
  route("finance_overview", "通常画面と同じ財務概況を保存済み月から集計。", false, "GET", "/api/finance/overview", dateQuery, () => import("@/app/api/finance/overview/route")),
  route("finance_trial_latest", "最終版試算表の最新状態を取得。", false, "GET", "/api/finance/trial", obj({ query: obj({ scope: en("latest", "all") }, []) }, []), () => import("@/app/api/finance/trial/route")),
  route("finance_trial_balance", "指定月の保存済み試算表を取得。", false, "GET", "/api/finance/trial-balance", query({ month }), () => import("@/app/api/finance/trial-balance/route")),
  route("finance_trial_balance_delete", "指定月の試算表を既存削除処理で削除。", true, "DELETE", "/api/finance/trial-balance/delete", body({ month }), () => import("@/app/api/finance/trial-balance/delete/route")),
  route("finance_trial_statement", "会計事務所の試算表と元帳差異・分析を通常画面の計算で取得。", false, "GET", "/api/finance/trial-balance-statement", obj({ query: obj({ month, months: en("1") }, []) }, []), () => import("@/app/api/finance/trial-balance-statement/route")),
  route("finance_trial_statement_import", "確認済み試算表CSVを原本の科目・対象月・文字コードで取り込む。", true, "POST", "/api/finance/trial-balance-statement/import", upload(obj({ reportMonth: month, encoding: en("auto", "utf-8", "shift_jis") }, ["reportMonth"])), () => import("@/app/api/finance/trial-balance-statement/import/route")),
  route("finance_series", "保存済み財務数値の期間推移。", false, "GET", "/api/finance/series", obj({ query: obj({ from: date, to: date }, []) }, []), () => import("@/app/api/finance/series/route")),
  route("finance_transactions", "指定月・科目の元帳明細。", false, "GET", "/api/finance/transactions", query({ month, accountCode: str(50) }), () => import("@/app/api/finance/transactions/route")),
  route("finance_search", "保存済み元帳を検索語・月・ページで検索。", false, "GET", "/api/finance/search", query({ q: str(500), month, limit: int(1, 500), offset: int(0, 10000000) }, ["q"]), () => import("@/app/api/finance/search/route")),
  route("finance_pl_totals", "通常画面と同じ損益合計。", false, "GET", "/api/finance/pl/totals", dateQuery, () => import("@/app/api/finance/pl/totals/route")),
  route("finance_pl_snapshot", "指定月または年度累計の損益計算書。", false, "GET", "/api/finance/pl/snapshot", obj({ query: obj({ date, scope: en("month", "ytd") }, []) }, []), () => import("@/app/api/finance/pl/snapshot/route")),
  route("finance_pl_month_totals", "保存済み月次損益推移。", false, "GET", "/api/finance/pl/month-totals", obj({ query: obj({ latest: en("1") }, []) }, []), () => import("@/app/api/finance/pl/month-totals/route")),
  route("finance_bs_totals", "通常画面と同じ貸借合計。", false, "GET", "/api/finance/bs/totals", dateQuery, () => import("@/app/api/finance/bs/totals/route")),
  route("finance_bs_snapshot", "通常画面と同じ貸借対照表。", false, "GET", "/api/finance/bs/snapshot", dateQuery, () => import("@/app/api/finance/bs/snapshot/route")),
  route("finance_import_status", "財務CSV・元帳の保存済み対象月と取込状態。", false, "GET", "/api/finance/import-status", empty, () => import("@/app/api/finance/import-status/route")),
  route("finance_equity_flags", "財務純資産の補完フラグを確認。", false, "GET", "/api/finance/equity-fallback-flags", empty, () => import("@/app/api/finance/equity-fallback-flags/route")),
  route("finance_closing_inventory", "製造・卸・店舗棚卸を年度別に通常画面と同じ方法で集約。", false, "GET", "/api/finance/closing-inventory", obj({ query: obj({ fiscalYear: int(2000, 2200) }, []) }, []), () => import("@/app/api/finance/closing-inventory/route")),
  route("finance_refresh", "固定された既存財務集計ビューを更新し貸借一致を確認。SQLは指定できません。", true, "POST", "/api/finance/refresh", empty, () => import("@/app/api/finance/refresh/route")),
  route("finance_ai_analysis", "保存済み当月と直近3か月の費用から既存AI処理で異常候補を作成。モデル変更不可。", true, "POST", "/api/finance/ai-analysis", body({ month }), () => import("@/app/api/finance/ai-analysis/route")),
  route("general_ledger_months", "保存済み元帳の対象月一覧。", false, "GET", "/api/general-ledger/months", obj({ query: obj({ limit: int(1, 1200) }, []) }, []), () => import("@/app/api/general-ledger/months/route")),
  route("general_ledger_import", "確認済み総勘定元帳CSVを指定年月へ既存手順で取り込み月次残高を同期。", true, "POST", "/api/general-ledger/import", upload(obj({ year: int(2000, 2200), month: int(1, 12) })), () => import("@/app/api/general-ledger/import/route")),
  route("general_ledger_closing_import", "確認済み決算整理CSVを指定年度の既存調整データへ置換取込。", true, "POST", "/api/general-ledger/import-closing", upload(obj({ fiscalYear: int(2000, 2200) })), () => import("@/app/api/general-ledger/import-closing/route")),
  route("general_ledger_raw_import", "確認済み元帳原本CSVを月・文字コード付きで既存原本保存へ取り込む。", true, "POST", "/api/general-ledger/raw-import", upload(obj({ month_start: monthStart, encoding: en("UTF-8") }, ["month_start"])), () => import("@/app/api/general-ledger/raw-import/route")),
  route("annual_statements", "決算資料の年度・ページ・科目・分析結果を取得。documentId指定時は既存ページ本文も取得。", false, "GET", "/api/finance/annual-statements", obj({ query: obj({ id: uuid, documentId: uuid }, []) }, []), () => import("@/app/api/finance/annual-statements/route")),
  route("annual_statement_pdf", "保存済み決算資料PDFをIDで取得。大きい原本は既存の分割番号で取得。", false, "GET", "/api/finance/annual-statements", query({ documentId: uuid, download: en("1"), chunk: int(0, 100) }, ["documentId", "download"]), () => import("@/app/api/finance/annual-statements/route")),
  route("annual_statement_import", "確認済みPDFを既存決算資料解析・原本保存へ取り込む。通信上限内のファイルを指定。", true, "POST", "/api/finance/annual-statements", upload(obj({ action: en("import"), periodId: uuid, replacePrimary: bool }, ["action"]), "files", 10), () => import("@/app/api/finance/annual-statements/route")),
  route("finance_char_siu_runs", "製造原価計算・材料・出来高・労務単価を保存実績から取得。", false, "GET", "/api/finance/char-siu-production", obj({ query: obj({ month, id: uuid }, []) }, []), () => import("@/app/api/finance/char-siu-production/route")),
  route("finance_char_siu_update", "確認した製造出来高・原価または既存TSG労務単価を通常画面の計算で反映。", true, "PATCH", "/api/finance/char-siu-production", obj({ body: { anyOf: [
    obj({ action: en("settings"), blockUnitWeightG: num(0.001), lardUnitWeightG: num(0.001), mincedChashuUnitWeightG: num(0.001) }),
    obj({ action: en("sync_labor"), effectiveDate: date }, ["action"]),
    obj({ action: en("sync_run_labor"), id: uuid }),
    obj({ action: en("run"), id: uuid, workerCount: int(1, 10000), workHours: num(0, 10000), productionDate: date, notes: { type: "string", maxLength: 2000 },
      materials: arr(obj({ key: str(100), usageAmount: num(0), purchaseUnitQuantity: num(0.001), purchasePriceTaxIncluded: num(0) }, ["key"]), 30),
      outputs: arr(obj({ key: str(100), quantity: int(0, 100000000), unitWeightG: num(0.001) }, ["key"]), 30),
    }, ["action", "id"]),
  ] } }), () => import("@/app/api/finance/char-siu-production/route")),
  route("finance_char_siu_delete", "指定した製造原価実績を通常画面の関連明細削除処理で削除。", true, "DELETE", "/api/finance/char-siu-production", query({ id: uuid }), () => import("@/app/api/finance/char-siu-production/route")),
  route("food_store_csv_import", "確認済み店舗POS CSVをJAN・文字コード検証後、指定月へ既存取込。", true, "POST", "/api/food-store/import-sjis", upload(obj({ report_month: monthStart })), () => import("@/app/api/food-store/import-sjis/route")),
  route("food_store_product_category", "店舗商品を確認したJAN・名称・カテゴリへ紐付け。", true, "POST", "/api/food-store/products/category", body({ janCode: str(50), productName: str(500), categoryId: { anyOf: [uuid, int(1), { type: "null" }] } }), () => import("@/app/api/food-store/products/category/route")),
  route("food_store_inventory", "店舗棚卸の年度履歴と再計算済み明細を取得。", false, "GET", "/api/food-store/inventory", obj({ query: obj({ id: uuid }, []) }, []), () => import("@/app/api/food-store/inventory/route")),
  route("food_store_inventory_import", "確認済み棚卸xlsxを年度・棚卸日付きで原本hashと共に登録。", true, "POST", "/api/food-store/inventory", upload(obj({ fiscalYear: int(2000, 2200), inventoryDate: date })), () => import("@/app/api/food-store/inventory/route")),
  route("food_store_inventory_copy", "保存済み棚卸を指定年度へ複製し原本hashを保持。", true, "POST", "/api/food-store/inventory", body({ action: en("copy"), sourceId: uuid, fiscalYear: int(2000, 2200), inventoryDate: date }), () => import("@/app/api/food-store/inventory/route")),
  route("food_store_inventory_update", "revision一致を確認して店舗棚卸のセル変更・確定・再編集を行う。", true, "PATCH", "/api/food-store/inventory", body({ id: uuid, revision: int(), action: en("save", "complete", "reopen"),
    changes: arr(obj({ sheet: str(100), address: { type: "string", pattern: "^[A-Z][1-9]\\d*$" }, value: { anyOf: [{ type: "string", maxLength: 10000 }, num(), bool, { type: "null" }] }, formula: str(10000) }, ["sheet", "address", "value"]), 1000, 1),
  }, ["id", "revision", "action"]), () => import("@/app/api/food-store/inventory/route")),
  route("label_check_history", "保存済みラベル判定をモード・判定・検索語でページ取得。", false, "GET", "/api/label-check", obj({ query: obj({ page: int(1), per_page: int(10, 50), mode: en("simple", "normal"), judgment: en("OK", "NG", "UNKNOWN"), q: str(500) }, []) }, []), () => import("@/app/api/label-check/route")),
  route("label_check_recipes", "ラベル判定用レシピ・原材料・賞味期限をIDまたはカテゴリ検索で取得。", false, "GET", "/api/label-check/recipes", obj({ query: obj({ id: uuid, category: str(100), q: str(100) }, []) }, []), () => import("@/app/api/label-check/recipes/route")),
  route("label_check_match", "固定の名称・原材料・製造者から保存済みレシピ候補を照合。必要時は既存AIで候補を解析。", true, "POST", "/api/label-check/match", body({ product_name: nullable(optionalText(500)), raw_materials: nullable(optionalText(12000)), manufacturer: nullable(optionalText(1000)) }, []), () => import("@/app/api/label-check/match/route")),
  route("label_check_ocr", "確認対象画像を既存ラベルOCRで解析。判定の保存・レシピ変更は行いません。", true, "POST", "/api/label-check/ocr", upload(obj({ mode: en("simple", "normal") }), "files", 4, true), () => import("@/app/api/label-check/ocr/route")),
  routeOperation({ name: "label_check_complete", description: "確認した期限・レシピ・画像を既存判定式で保存。request_id重複を保護。", mutation: true, method: "POST", pathname: "/api/label-check/complete",
    schema: obj({ body: obj({ payload: labelPayload }), files: arr(fileFor("images", true), 4) }, ["body"]), load: () => import("@/app/api/label-check/complete/route"),
    buildRequest: (input, origin) => {
      const form = new FormData(); form.append("payload", JSON.stringify((input.body as Record<string, unknown>).payload));
      for (const entry of (input.files as unknown[] | undefined) || []) {
        const file = decodeBusinessFile(entry); form.append("images", new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.filename);
      }
      return new Request(new URL("/api/label-check/complete", origin), { method: "POST", body: form });
    },
  }),
  route("label_check_image", "保存済みラベル画像をIDで取得。", false, "GET", "/api/label-check/image/[id]", obj({ params: obj({ id: uuid }) }), () => import("@/app/api/label-check/image/[id]/route")),
  labelledImages("ingredient_label_analyze", "確認対象の原材料・栄養成分画像を既存AIで解析し材料DB候補を提示。保存しません。", "/api/label/analyze", false, () => import("@/app/api/label/analyze/route")),
  labelledImages("ingredient_label_images_save", "確認済み食材へ原材料・栄養成分画像を保存・登録。", "/api/label/upload-images", true, () => import("@/app/api/label/upload-images/route")),
  route("ingredient_label_update", "確認済み表示値を既存の許可された食材属性へ反映。", true, "POST", "/api/label/update", body({ target_id: uuid, updates: { ...labelUpdates, minProperties: 1 } }), () => import("@/app/api/label/update/route")),
  route("quote_analyze", "見積画像/PDFを既存AIで解析し材料DBとの照合候補を提示。原価変更は行いません。", true, "POST", "/api/quote/analyze", upload(), () => import("@/app/api/quote/analyze/route")),
  route("quote_master_prices_apply", "確認済み見積価格を食材・資材へ反映し既存処理でレシピ原価を同期。新規名称の重複検査を維持。", true, "POST", "/api/quote/update", body({ updates: arr({ anyOf: [
    obj({ category: en("ingredient", "material"), suggestion_type: en("update"), matched_id: uuid, final_suggestion_price: num(0), original_name: str(500) }),
    obj({ category: en("ingredient", "material"), suggestion_type: en("create"), matched_id: nullable(uuid), final_suggestion_price: num(0), original_name: str(500) }, ["category", "suggestion_type", "final_suggestion_price", "original_name"]),
  ] }, 1000, 1) }), () => import("@/app/api/quote/update/route")),
  route("link_image_upload", "リンク集用の確認済み画像を既存ストレージへ保存。任意URLの代理取得は行いません。", true, "POST", "/api/links/upload-image", upload(undefined, "file", 1, true), () => import("@/app/api/links/upload-image/route")),
];
