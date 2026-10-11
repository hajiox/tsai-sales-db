import { routeOperation, businessFileSchema, type BusinessOperation, type JsonSchema } from "./operation-contracts";

// Only named business workflows are exposed. Paths, methods, form fields and
// execution targets are fixed here; callers cannot supply a route or a prompt.
const text = (maxLength = 2000): JsonSchema => ({ type: "string", maxLength });
const uuid: JsonSchema = { type: "string", format: "uuid" };
const nullableText = (maxLength = 2000): JsonSchema => ({ anyOf: [text(maxLength), { type: "null" }] });
const object = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({
  type: "object", additionalProperties: false, properties, required,
});
const array = (items: JsonSchema, maxItems = 100, minItems = 0): JsonSchema => ({ type: "array", items, maxItems, minItems });
const enumText = (values: string[]): JsonSchema => ({ type: "string", enum: values });
const activeEc = ["amazon", "rakuten", "yahoo", "base"];
const snapshotSites = [...activeEc, "mercari", "qoo10", "tiktok"];
const platform = enumText(["x", "instagram", "instagram_story", "threads"]);
const targets = array(enumText(activeEc), 4, 1);
const params = object({ id: uuid });
const recipeQuery = object({ recipeId: uuid });
const jobQuery = object({ jobId: uuid }, []);
const scoped = (body?: JsonSchema, query?: JsonSchema): JsonSchema => object({
  params, ...(body ? { body } : {}), ...(query ? { query } : {}),
}, ["params", ...(body ? ["body"] : [])]);
const plain = (body?: JsonSchema, query?: JsonSchema): JsonSchema => object({
  ...(body ? { body } : {}), ...(query ? { query } : {}),
}, [...(body ? ["body"] : []), ...(query ? ["query"] : [])]);
const siteMap = (value: JsonSchema, sites = snapshotSites): JsonSchema => object(Object.fromEntries(sites.map(site => [site, value])), []);
const identity = {
  recipeId: uuid, recipeName: text(200), linkedProductId: nullableText(100), janCode: nullableText(32),
  seriesCode: nullableText(100), productCode: nullableText(100), fillingQuantity: nullableText(50),
  fillingQuantityUnit: nullableText(30), storageMethod: nullableText(100),
};
const nameSnapshot = object({ ...identity, ecProductName: text(75), ecProductNamesBySite: siteMap(text(75)) });
const catchcopySnapshot = object({ ...identity, fallbackCatchcopy: text(30), ecCatchcopiesBySite: siteMap(text(30), ["rakuten", "yahoo"]) });
const contentSnapshot = object({ ...identity, ecProductName: nullableText(75), productPoints: text(20000), webDescription: text(30000) });
// The price screen sends the stored snake_case record, unlike the other three
// sync screens. Keep that existing comparison contract without accepting extras.
const priceSnapshot = object({
  id: uuid, name: text(200), ec_product_name: nullableText(200), linked_product_id: nullableText(100),
  jan_code: nullableText(32), series_code: { anyOf: [text(100), { type: "number" }, { type: "null" }] }, product_code: { anyOf: [text(100), { type: "number" }, { type: "null" }] },
  filling_quantity: { anyOf: [text(50), { type: "number" }, { type: "null" }] }, filling_quantity_unit: nullableText(30),
  storage_method: nullableText(100), product_lp_url: nullableText(2000), selling_price: { type: "number", minimum: 0, maximum: 1000000000 },
});
const dispatch = { dispatchMode: enumText(["immediate", "reserved"]), retryUnfinishedFromJobId: uuid };
const contentValue = object({
  fieldLayout: enumText(["separate", "combined"]), markerStyle: enumText(["check", "square"]),
  productPoints: text(20000), webDescription: text(30000), combinedContent: nullableText(50000),
});
const imageRole = enumText(["gallery", "portrait", "non_amazon", "base_only"]);
const fileSchema = (field: string, mimeTypes: string[], maxBytes: number): JsonSchema => ({
  ...businessFileSchema,
  properties: {
    ...businessFileSchema.properties,
    field: enumText([field]), mimeType: enumText(mimeTypes),
    // Whole base64 groups keep the decoded limit at or below the route limit.
    base64: { type: "string", maxLength: Math.floor(maxBytes / 3) * 4 },
  },
});
const imageFile = fileSchema("file", ["image/jpeg", "image/png", "image/webp"], 250 * 1024);
const xlsxFile = fileSchema("files", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"], 2 * 1024 * 1024);
const post = object({ text: text(12000), hashtags: array(text(100), 50), rationale: text(4000), linkUrl: nullableText(2000) });
const posts = object({ x: post, instagram: post, instagram_story: post, threads: post });
const accounts = object({
  x: enumText(["@Aizu_Brand_Kan", "@karasugike1", "@hajiox"]),
  instagram: enumText(["aizubrandhall", "aizubrand_ec"]), instagram_story: enumText(["aizubrandhall", "aizubrand_ec"]),
  threads: enumText(["aizubrandhall", "satou.masahiko"]),
}, []);
const number: JsonSchema = { type: "number", minimum: 0, maximum: 1000000000 };
const nullableNumber: JsonSchema = { anyOf: [number, { type: "null" }] };
const nullablePositiveNumber: JsonSchema = { anyOf: [{ type: "number", minimum: Number.MIN_VALUE, maximum: 1000000000 }, { type: "null" }] };
const date: JsonSchema = { type: "string", format: "date" };
const fiscalYear: JsonSchema = { type: "integer", minimum: 2000, maximum: 2100 };
const link = object({ recipeId: uuid, productId: { anyOf: [uuid, { type: "null" }] } });
const noteMaterial = object({
  key: enumText(["pork_belly", "green_onion", "ginger"]), sourceItemName: text(120),
  purchaseUnitQuantityG: { type: "number", minimum: 0.0001, maximum: 1000000000 }, purchasePriceTaxIncluded: { type: "number", minimum: 0.0001, maximum: 1000000000 },
  taxRate: { type: "number", enum: [0, 0.08, 0.1] }, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence: text(300),
}, ["key", "sourceItemName", "purchaseUnitQuantityG", "purchasePriceTaxIncluded", "taxRate"]);
const productionFile = fileSchema("files", ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"], 875 * 1024);

export const recipeOperations: BusinessOperation[] = [
  routeOperation({ name: "recipe.ec_sync_input", description: "保存済みレシピからEC反映に必要な既存照合snapshot・税込価格・本文配置を取得", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-sync-input", schema: scoped(), load: () => import("@/app/api/recipe/[id]/ec-sync-input/route") }),
  routeOperation({ name: "recipe.ingredient_label.generate", description: "保存済み配合から原材料表示候補の既存Bridge生成を開始", mutation: true, method: "POST", pathname: "/api/recipe/generate-label", schema: plain(object({ recipeId: uuid })), load: () => import("@/app/api/recipe/generate-label/route") }),
  routeOperation({ name: "recipe.ingredient_label.status", description: "対象レシピの原材料表示生成状況", mutation: false, method: "GET", pathname: "/api/recipe/generate-label", schema: plain(undefined, object({ recipeId: uuid, jobId: uuid }, ["recipeId"])), load: () => import("@/app/api/recipe/generate-label/route") }),
  routeOperation({ name: "recipe.ec_name.generate", description: "保存済み情報から共通EC商品名候補を生成", mutation: true, method: "POST", pathname: "/api/recipe/[id]/ec-product-name-ai", schema: scoped(), load: () => import("@/app/api/recipe/[id]/ec-product-name-ai/route") }),
  routeOperation({ name: "recipe.ec_name.generation_status", description: "EC商品名候補生成状況", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-product-name-ai", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/ec-product-name-ai/route") }),
  routeOperation({ name: "recipe.ec_catchcopy.generate", description: "保存済み情報から共通ECキャッチコピー候補を生成", mutation: true, method: "POST", pathname: "/api/recipe/[id]/ec-catchcopy-ai", schema: scoped(), load: () => import("@/app/api/recipe/[id]/ec-catchcopy-ai/route") }),
  routeOperation({ name: "recipe.ec_catchcopy.generation_status", description: "ECキャッチコピー生成状況", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-catchcopy-ai", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/ec-catchcopy-ai/route") }),
  routeOperation({ name: "recipe.ec_content.generate", description: "確認済み商品ポイント・説明を500文字以内へ調整", mutation: true, method: "POST", pathname: "/api/recipe/[id]/ec-product-content-ai", schema: scoped(object({ productPoints: text(20000), webDescription: text(30000) })), load: () => import("@/app/api/recipe/[id]/ec-product-content-ai/route") }),
  routeOperation({ name: "recipe.ec_content.generation_status", description: "商品文章調整の状況", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-product-content-ai", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/ec-product-content-ai/route") }),
  routeOperation({ name: "recipe.ec_price.sync", description: "保存済み価格を指定した活動中ECへ実行または予約。既存照合・Bridgeを利用", mutation: true, method: "POST", pathname: "/api/recipe/[id]/ec-price-jobs", schema: scoped(object({ targets, ...dispatch, expectedPriceInclTax: { type: "integer", minimum: 1, maximum: 1000000000 }, expectedRecipeSnapshot: priceSnapshot }, ["targets", "dispatchMode", "expectedPriceInclTax", "expectedRecipeSnapshot"])), load: () => import("@/app/api/recipe/[id]/ec-price-jobs/route") }),
  routeOperation({ name: "recipe.ec_price.status", description: "EC価格反映の状況・履歴", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-price-jobs", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/ec-price-jobs/route") }),
  routeOperation({ name: "recipe.ec_name.sync", description: "保存済み共通商品名を活動中ECへ実行または予約", mutation: true, method: "POST", pathname: "/api/recipe/[id]/ec-product-name-jobs", schema: scoped(object({ targets, ...dispatch, expectedProductName: text(75), expectedProductNames: siteMap(text(75)), expectedRecipeSnapshot: nameSnapshot }, ["targets", "dispatchMode", "expectedProductName", "expectedProductNames", "expectedRecipeSnapshot"])), load: () => import("@/app/api/recipe/[id]/ec-product-name-jobs/route") }),
  routeOperation({ name: "recipe.ec_name.status", description: "EC商品名反映の状況・履歴", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-product-name-jobs", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/ec-product-name-jobs/route") }),
  routeOperation({ name: "recipe.ec_catchcopy.sync", description: "共通キャッチコピーを楽天・Yahooへ実行または予約", mutation: true, method: "POST", pathname: "/api/recipe/[id]/ec-catchcopy-jobs", schema: scoped(object({ targets: array(enumText(["rakuten", "yahoo"]), 2, 1), ...dispatch, expectedCatchcopy: text(30), expectedCatchcopies: siteMap(text(30), ["rakuten", "yahoo"]), expectedRecipeSnapshot: catchcopySnapshot }, ["targets", "dispatchMode", "expectedCatchcopy", "expectedCatchcopies", "expectedRecipeSnapshot"])), load: () => import("@/app/api/recipe/[id]/ec-catchcopy-jobs/route") }),
  routeOperation({ name: "recipe.ec_catchcopy.status", description: "ECキャッチコピー反映の状況・履歴", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-catchcopy-jobs", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/ec-catchcopy-jobs/route") }),
  routeOperation({ name: "recipe.ec_content.sync", description: "確認済み商品ポイント・説明を活動中ECへ反映", mutation: true, method: "POST", pathname: "/api/recipe/[id]/ec-product-content-jobs", schema: scoped(object({ targets, retryUnfinishedFromJobId: uuid, expectedRecipeSnapshot: contentSnapshot, expectedTargetContents: siteMap(contentValue, activeEc) }, ["targets", "expectedRecipeSnapshot", "expectedTargetContents"])), load: () => import("@/app/api/recipe/[id]/ec-product-content-jobs/route") }),
  routeOperation({ name: "recipe.ec_content.status", description: "EC商品文章反映の状況・履歴", mutation: false, method: "GET", pathname: "/api/recipe/[id]/ec-product-content-jobs", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/ec-product-content-jobs/route") }),
  ...([
    ["price", "/api/recipe/ec-price-reservations", () => import("@/app/api/recipe/ec-price-reservations/route")],
    ["name", "/api/recipe/ec-product-name-reservations", () => import("@/app/api/recipe/ec-product-name-reservations/route")],
    ["catchcopy", "/api/recipe/ec-catchcopy-reservations", () => import("@/app/api/recipe/ec-catchcopy-reservations/route")],
  ] as const).flatMap(([kind, pathname, load]) => [
    routeOperation({ name: `recipe.ec_${kind}.reservations`, description: "既存EC反映予約の一覧", mutation: false, method: "GET", pathname, schema: plain(), load }),
    routeOperation({ name: `recipe.ec_${kind}.execute_reservations`, description: "保存済みEC反映予約を一括実行。各既存snapshotを再照合", mutation: true, method: "POST", pathname, schema: plain(object({ action: enumText(["execute_all"]) })), load }),
    routeOperation({ name: `recipe.ec_${kind}.cancel_reservation`, description: "指定した未開始EC反映予約を取り消す", mutation: true, method: "DELETE", pathname, schema: plain(object({ jobId: uuid })), load }),
  ]),
  routeOperation({ name: "recipe.sns.generate", description: "保存済み画像・商品情報からSNS素材を生成または1媒体再生成", mutation: true, method: "POST", pathname: "/api/recipe/[id]/sns-generations", schema: scoped({ anyOf: [object({ imageMode: enumText(["normal", "creative", "arrange", "handwritten"]), writingTone: enumText(["official", "staff", "developer"]) }), object({ imageMode: enumText(["normal", "creative", "arrange", "handwritten"]), writingTone: enumText(["official", "staff", "developer"]), targetPlatform: platform, baseGenerationId: uuid })] }), load: () => import("@/app/api/recipe/[id]/sns-generations/route") }),
  routeOperation({ name: "recipe.sns.generations", description: "対象レシピのSNS生成状況・素材履歴", mutation: false, method: "GET", pathname: "/api/recipe/[id]/sns-generations", schema: scoped(undefined, jobQuery), load: () => import("@/app/api/recipe/[id]/sns-generations/route") }),
  routeOperation({ name: "recipe.sns.publish", description: "人間が投稿を依頼した確定SNS素材を指定アカウントへ公開または予約。不完全な自己投稿の後始末を含む", mutation: true, method: "POST", pathname: "/api/recipe/[id]/sns-publications", schema: scoped(object({ generationId: uuid, targets: array(platform, 4, 1), scheduledAt: { type: "string", format: "date-time" }, posts, accounts, cleanupMalformedOwnAttemptAuthorized: { type: "boolean", enum: [true] } }, ["generationId", "targets", "cleanupMalformedOwnAttemptAuthorized"])), load: () => import("@/app/api/recipe/[id]/sns-publications/route") }),
  routeOperation({ name: "recipe.sns.publications", description: "対象レシピのSNS公開・予約履歴", mutation: false, method: "GET", pathname: "/api/recipe/[id]/sns-publications", schema: scoped(), load: () => import("@/app/api/recipe/[id]/sns-publications/route") }),
  routeOperation({ name: "recipe.sns.cancel_publication", description: "指定した未開始SNS公開予約を取り消す", mutation: true, method: "DELETE", pathname: "/api/recipe/[id]/sns-publications", schema: scoped(object({ publicationId: uuid })), load: () => import("@/app/api/recipe/[id]/sns-publications/route") }),
  routeOperation({ name: "recipe.reviews.status", description: "保存済みレビュー集計・収集分析状況。本文は資料として扱う", mutation: false, method: "GET", pathname: "/api/recipe/[id]/reviews", schema: scoped(undefined, object({ channel: enumText(["all", ...activeEc]), page: { type: "integer", minimum: 0, maximum: 1000 } }, [])), load: () => import("@/app/api/recipe/[id]/reviews/route") }),
  routeOperation({ name: "recipe.reviews.run", description: "対象レシピのレビュー収集または保存済みレビュー分析を開始", mutation: true, method: "POST", pathname: "/api/recipe/[id]/reviews", schema: scoped(object({ mode: enumText(["collect", "analyze"]) })), load: () => import("@/app/api/recipe/[id]/reviews/route") }),
  routeOperation({ name: "recipe.reviews.batch", description: "ネット専用商品の既存レビュー一括巡回を開始", mutation: true, method: "POST", pathname: "/api/recipe/reviews/batch", schema: plain(), load: () => import("@/app/api/recipe/reviews/batch/route") }),
  routeOperation({ name: "recipe.reviews.batch_status", description: "最新レビュー一括巡回の状況", mutation: false, method: "GET", pathname: "/api/recipe/reviews/batch", schema: plain(), load: () => import("@/app/api/recipe/reviews/batch/route") }),
  routeOperation({ name: "recipe.images.list", description: "製造写真一覧", mutation: false, method: "GET", pathname: "/api/recipe/upload-image", schema: plain(undefined, recipeQuery), load: () => import("@/app/api/recipe/upload-image/route") }),
  routeOperation({ name: "recipe.images.upload", description: "確認済み画像ファイルを製造写真へ登録。最大250KB", mutation: true, method: "POST", pathname: "/api/recipe/upload-image", schema: object({ body: object({ recipeId: uuid }), files: array(imageFile, 1, 1) }), load: () => import("@/app/api/recipe/upload-image/route") }),
  routeOperation({ name: "recipe.images.delete", description: "対象レシピの製造写真と管理Blobを削除", mutation: true, method: "DELETE", pathname: "/api/recipe/upload-image", schema: plain(object({ recipeId: uuid, imageId: uuid })), load: () => import("@/app/api/recipe/upload-image/route") }),
  routeOperation({ name: "recipe.images.reorder", description: "対象レシピの製造写真を並び替え先頭画像を同期", mutation: true, method: "PATCH", pathname: "/api/recipe/upload-image", schema: plain(object({ recipeId: uuid, imageOrder: array(object({ id: uuid, sort_order: { type: "integer", minimum: 0, maximum: 499 } }), 500, 1) })), load: () => import("@/app/api/recipe/upload-image/route") }),
  routeOperation({ name: "recipe.ec_images.list", description: "EC画像・媒体別配置とSNS元画像一覧", mutation: false, method: "GET", pathname: "/api/recipe/web-images", schema: plain(undefined, recipeQuery), load: () => import("@/app/api/recipe/web-images/route") }),
  routeOperation({ name: "recipe.ec_images.upload", description: "EC画像を用途別に登録。最大250KB。任意URLから取得しない", mutation: true, method: "POST", pathname: "/api/recipe/web-images", schema: object({ body: object({ recipeId: uuid, imageRole }, ["recipeId", "imageRole"]), files: array(imageFile, 1, 1) }), load: () => import("@/app/api/recipe/web-images/route") }),
  routeOperation({ name: "recipe.ec_images.copy_portrait", description: "同じレシピの管理済みgallery画像をportraitへ複製", mutation: true, method: "PUT", pathname: "/api/recipe/web-images", schema: plain(object({ recipeId: uuid, sourceImageId: uuid })), load: () => import("@/app/api/recipe/web-images/route") }),
  routeOperation({ name: "recipe.ec_images.delete", description: "指定した対象レシピのEC画像と管理Blobを削除", mutation: true, method: "DELETE", pathname: "/api/recipe/web-images", schema: plain(object({ recipeId: uuid, imageIds: array(uuid, 500, 1) })), load: () => import("@/app/api/recipe/web-images/route") }),
  routeOperation({ name: "recipe.ec_images.reorder", description: "対象レシピ・用途内のEC画像を並び替え", mutation: true, method: "PATCH", pathname: "/api/recipe/web-images", schema: plain(object({ recipeId: uuid, imageRole, imageOrder: array(object({ id: uuid }), 500, 1) })), load: () => import("@/app/api/recipe/web-images/route") }),
  routeOperation({ name: "recipe.import_xlsx", description: "既存Excelレシピ取込を実行。同名・システムシートの既存除外規則を維持。最大2MBを1ファイル", mutation: true, method: "POST", pathname: "/api/recipe/import", schema: object({ files: array(xlsxFile, 1, 1) }), load: () => import("@/app/api/recipe/import/route") }),
  routeOperation({ name: "recipe.versions.list", description: "対象レシピの保存済み版・配合snapshot一覧", mutation: false, method: "GET", pathname: "/api/recipe/versions", schema: plain(undefined, recipeQuery), load: () => import("@/app/api/recipe/versions/route") }),
  routeOperation({ name: "recipe.versions.create", description: "現在の保存済みレシピ・配合を新しい版として保存", mutation: true, method: "POST", pathname: "/api/recipe/versions", schema: plain(object({ recipeId: uuid, note: nullableText(2000) }, ["recipeId"])), load: () => import("@/app/api/recipe/versions/route") }),
  routeOperation({ name: "recipe.versions.restore", description: "対象レシピの確認済み保存版から現レシピ・配合を復元", mutation: true, method: "POST", pathname: "/api/recipe/versions/restore", schema: plain(object({ recipeId: uuid, versionId: uuid })), load: () => import("@/app/api/recipe/versions/restore/route") }),
  routeOperation({ name: "recipe.versions.update_note", description: "保存版のメモを更新", mutation: true, method: "PATCH", pathname: "/api/recipe/versions", schema: plain(object({ id: uuid, note: nullableText(2000) })), load: () => import("@/app/api/recipe/versions/route") }),
  routeOperation({ name: "recipe.versions.delete", description: "指定した保存版を削除", mutation: true, method: "DELETE", pathname: "/api/recipe/versions", schema: plain(undefined, object({ id: uuid })), load: () => import("@/app/api/recipe/versions/route") }),
  routeOperation({ name: "recipe.price_history", description: "販売価格改定履歴と前回価格", mutation: false, method: "GET", pathname: "/api/recipe/[id]/price-history", schema: scoped(), load: () => import("@/app/api/recipe/[id]/price-history/route") }),
  routeOperation({ name: "recipe.sales_price_checks", description: "紐付WEB商品の実売価格・商品対応を照合", mutation: false, method: "GET", pathname: "/api/recipe/[id]/sales-price-check", schema: scoped(), load: () => import("@/app/api/recipe/[id]/sales-price-check/route") }),
  routeOperation({ name: "recipe.database_usages", description: "食材・資材の使用レシピと必要量を集計", mutation: false, method: "GET", pathname: "/api/recipe/database-usages", schema: plain(), load: () => import("@/app/api/recipe/database-usages/route") }),
  routeOperation({ name: "recipe.intermediate_usages", description: "中間部品から使用する親レシピを逆引き", mutation: false, method: "GET", pathname: "/api/recipe/intermediate-usage", schema: plain(), load: () => import("@/app/api/recipe/intermediate-usage/route") }),
  routeOperation({ name: "recipe.integration_candidates", description: "未紐付け配合明細と参照マスター候補", mutation: false, method: "GET", pathname: "/api/recipe/integration", schema: plain(), load: () => import("@/app/api/recipe/integration/route") }),
  routeOperation({ name: "recipe.integrate_references", description: "確認済み名称に一致する配合明細を指定マスターへ一括紐付け", mutation: true, method: "POST", pathname: "/api/recipe/integration", schema: plain(object({ targetName: text(2000), masterId: uuid, masterType: enumText(["ingredient", "material", "recipe"]), masterName: text(2000) })), load: () => import("@/app/api/recipe/integration/route") }),
  ...([
    ["web", "/api/recipe/sync-product", () => import("@/app/api/recipe/sync-product/route")],
    ["wholesale", "/api/recipe/sync-wholesale", () => import("@/app/api/recipe/sync-wholesale/route")],
    ["oem", "/api/recipe/sync-oem", () => import("@/app/api/recipe/sync-oem/route")],
  ] as const).flatMap(([kind, pathname, load]) => [
    routeOperation({ name: `recipe.${kind}_links`, description: "レシピの商品紐付け状況・候補を取得。autoMatch指定時は既存名称・価格スコアで候補を計算", mutation: false, method: "GET", pathname, schema: object({ query: object({ autoMatch: { type: "boolean" } }, []) }, []), load }),
    routeOperation({ name: `recipe.${kind}_link`, description: "確認済み商品との1対1紐付け・解除と既存価格同期", mutation: true, method: "POST", pathname, schema: plain(link), load }),
    routeOperation({ name: `recipe.${kind}_link_batch`, description: "確認済み商品との1対1紐付けを一括保存し既存価格を同期", mutation: true, method: "POST", pathname, schema: plain(object({ batch: { type: "boolean", enum: [true] }, links: array(link, 100, 1) })), load }),
    routeOperation({ name: `recipe.${kind}_create_and_link`, description: "確認済み名称・価格で商品を新規作成しレシピへ紐付け", mutation: true, method: "POST", pathname, schema: plain(object({ createAndLink: { type: "boolean", enum: [true] }, recipeId: uuid, recipeName: text(200), recipePrice: nullableNumber, ...(kind === "web" ? { series: nullableText(200), seriesCode: nullableNumber } : {}) }, ["createAndLink", "recipeId", "recipeName", "recipePrice"])), load }),
    routeOperation({ name: `recipe.${kind}_sync_prices`, description: "既存の紐付済み商品へ保存済みレシピ価格を一括同期", mutation: true, method: "PUT", pathname, schema: plain(), load }),
  ]),
  routeOperation({ name: "recipe.duplicates", description: "既存名称規則で重複レシピの候補を取得", mutation: false, method: "GET", pathname: "/api/recipe/duplicates", schema: plain(), load: () => import("@/app/api/recipe/duplicates/route") }),
  routeOperation({ name: "recipe.merge_duplicates", description: "確認済みの残すレシピへ情報を統合し指定重複レシピを削除", mutation: true, method: "POST", pathname: "/api/recipe/duplicates", schema: plain(object({ action: enumText(["merge_group"]), keepId: uuid, deleteIds: array(uuid, 100, 1) })), load: () => import("@/app/api/recipe/duplicates/route") }),
  routeOperation({ name: "recipe.cleanup_duplicates", description: "既存画面の自動重複整理を全グループへ実行する明示的な一括操作", mutation: true, method: "POST", pathname: "/api/recipe/duplicates", schema: plain(object({ action: enumText(["auto_cleanup"]) })), load: () => import("@/app/api/recipe/duplicates/route") }),
  routeOperation({ name: "recipe.delete_with_items", description: "指定レシピの配合明細と商品紐付けを整理して削除", mutation: true, method: "POST", pathname: "/api/recipe/duplicates", schema: plain(object({ action: enumText(["delete_one"]), recipeId: uuid })), load: () => import("@/app/api/recipe/duplicates/route") }),
  routeOperation({ name: "recipe.estimates", description: "受信見積品目と食材・資材の照合候補を取得", mutation: false, method: "GET", pathname: "/api/recipe/estimates", schema: object({ query: object({ status: enumText(["pending", "applied", "rejected", "skipped"]) }, []) }, []), load: () => import("@/app/api/recipe/estimates/route") }),
  routeOperation({ name: "recipe.estimates_match", description: "未照合見積品目を既存AI処理でマスター候補へ照合", mutation: true, method: "POST", pathname: "/api/recipe/estimates", schema: plain(), load: () => import("@/app/api/recipe/estimates/route") }),
  routeOperation({ name: "recipe.estimate_price_impact", description: "確認済み材料価格変更が配合原価へ与える影響を試算", mutation: false, method: "GET", pathname: "/api/recipe/estimates/impact", schema: plain(undefined, object({ ingredientId: uuid, newPrice: number, targetTable: enumText(["ingredient", "material"]) })), load: () => import("@/app/api/recipe/estimates/impact/route") }),
  routeOperation({ name: "recipe.estimate_apply_price", description: "確認済み受信見積の価格を指定食材・資材へ反映し関連配合を同期", mutation: true, method: "PATCH", pathname: "/api/recipe/estimates", schema: plain(object({ action: enumText(["update_price"]), itemId: uuid, ingredientId: uuid, targetTable: enumText(["ingredient", "material"]) })), load: () => import("@/app/api/recipe/estimates/route") }),
  routeOperation({ name: "recipe.estimate_create_master", description: "確認済み受信見積から名称・入数を指定して食材・資材を登録", mutation: true, method: "PATCH", pathname: "/api/recipe/estimates", schema: plain(object({ action: enumText(["create_new"]), itemId: uuid, targetTable: enumText(["ingredient", "material"]), newIngredientData: object({ name: text(2000), unit_quantity: { type: "number", minimum: 0.0001, maximum: 1000000000 } }) })), load: () => import("@/app/api/recipe/estimates/route") }),
  routeOperation({ name: "recipe.estimate_disposition", description: "指定受信見積の却下・スキップ・保留への復帰", mutation: true, method: "PATCH", pathname: "/api/recipe/estimates", schema: plain(object({ action: enumText(["reject", "skip", "restore"]), itemId: uuid, notes: nullableText(2000) }, ["action", "itemId"])), load: () => import("@/app/api/recipe/estimates/route") }),
  routeOperation({ name: "recipe.estimates_disposition_batch", description: "指定した受信見積品目を一括スキップまたは保留へ復帰", mutation: true, method: "PATCH", pathname: "/api/recipe/estimates", schema: plain(object({ action: enumText(["bulk_skip", "bulk_restore"]), itemIds: array(uuid, 500, 1) })), load: () => import("@/app/api/recipe/estimates/route") }),
  routeOperation({ name: "recipe.inventory", description: "製造棚卸の履歴・明細・集計を取得", mutation: false, method: "GET", pathname: "/api/recipe/inventory", schema: object({ query: object({ id: uuid, fiscalYear }, []) }, []), load: () => import("@/app/api/recipe/inventory/route") }),
  routeOperation({ name: "recipe.inventory_generate", description: "確認済み棚卸日・年度の製造棚卸を既存マスターから作成", mutation: true, method: "POST", pathname: "/api/recipe/inventory", schema: plain(object({ action: enumText(["generate"]), inventoryDate: date, fiscalYear })), load: () => import("@/app/api/recipe/inventory/route") }),
  routeOperation({ name: "recipe.inventory_sync", description: "既存製造棚卸のマスター単価・入数を最新情報へ同期", mutation: true, method: "POST", pathname: "/api/recipe/inventory", schema: plain(object({ action: enumText(["sync"]), inventoryId: uuid })), load: () => import("@/app/api/recipe/inventory/route") }),
  routeOperation({ name: "recipe.inventory_item_create", description: "棚卸明細を確認済み名称・入数・税込原価で追加", mutation: true, method: "POST", pathname: "/api/recipe/inventory/items", schema: plain(object({ inventoryId: uuid, itemName: text(2000), itemType: enumText(["ingredient", "material"]), unitQuantity: nullablePositiveNumber, taxIncludedCost: nullableNumber })), load: () => import("@/app/api/recipe/inventory/items/route") }),
  routeOperation({ name: "recipe.inventory_item_update", description: "棚卸明細の数量・単価・名称・税率を更新し既存計算を適用", mutation: true, method: "PATCH", pathname: "/api/recipe/inventory/items", schema: plain(object({ id: uuid, itemName: text(2000), unitQuantity: nullablePositiveNumber, taxIncludedCost: nullableNumber, stockCount: nullableNumber, taxRate: { type: "integer", enum: [0, 8, 10] }, note: text(1000) }, ["id"])), load: () => import("@/app/api/recipe/inventory/items/route") }),
  routeOperation({ name: "recipe.inventory_item_delete", description: "指定製造棚卸明細を削除", mutation: true, method: "DELETE", pathname: "/api/recipe/inventory/items", schema: plain(object({ id: uuid })), load: () => import("@/app/api/recipe/inventory/items/route") }),
  routeOperation({ name: "recipe.char_siu_production", description: "チャーシュー製造実績と固定材料・出来高定義を取得", mutation: false, method: "GET", pathname: "/api/recipe/char-siu-production", schema: plain(), load: () => import("@/app/api/recipe/char-siu-production/route") }),
  routeOperation({ name: "recipe.char_siu_save_production", description: "確認済み使用量・出来高から製造実績を保存し既存原価計算を適用", mutation: true, method: "POST", pathname: "/api/recipe/char-siu-production", schema: plain(object({ id: uuid, productionDate: date, workerCount: { type: "integer", minimum: 1, maximum: 1000 }, workHours: { type: "number", minimum: 0.0001, maximum: 10000 }, notes: text(2000), deliveryNoteScanId: uuid, materials: array(object({ key: enumText(["pork_belly", "green_onion", "ginger", "soy_sauce", "sake", "haimi", "granulated_sugar"]), usageAmount: number }), 7, 1), outputs: array(object({ key: enumText(["chashu_wakeari_800", "chashu_slice_700", "retort_thick_600", "retort_medium_380", "retort_cut_600", "block", "lard", "minced_chashu"]), quantity: { type: "integer", minimum: 0, maximum: 1000000000 } }), 8, 1) }, ["productionDate", "workerCount", "workHours", "materials", "outputs"])), load: () => import("@/app/api/recipe/char-siu-production/route") }),
  routeOperation({ name: "recipe.char_siu_delivery_notes", description: "未使用の納品書スキャンとDocScanner受信候補を取得", mutation: false, method: "GET", pathname: "/api/recipe/char-siu-production/delivery-notes", schema: object({ query: object({ productionDate: date }, []) }, []), load: () => import("@/app/api/recipe/char-siu-production/delivery-notes/route") }),
  routeOperation({ name: "recipe.char_siu_import_delivery_note", description: "確認済みDocScanner納品書を指定製造日へ取り込む", mutation: true, method: "POST", pathname: "/api/recipe/char-siu-production/delivery-notes", schema: plain(object({ docScannerDocId: text(200), targetProductionDate: date })), load: () => import("@/app/api/recipe/char-siu-production/delivery-notes/route") }),
  routeOperation({ name: "recipe.char_siu_review_delivery_note", description: "確認済み豚バラ・ネギ・生姜の仕入数量と税込価格を納品書へ確定", mutation: true, method: "PATCH", pathname: "/api/recipe/char-siu-production/delivery-notes", schema: plain(object({ scanId: uuid, targetProductionDate: date, items: array(noteMaterial, 3, 3) })), load: () => import("@/app/api/recipe/char-siu-production/delivery-notes/route") }),
  routeOperation({ name: "recipe.char_siu_scan_delivery_note", description: "納品書写真を既存AIで読取。4枚まで・1枚875KB以下で合計3.5MB以下", mutation: true, method: "POST", pathname: "/api/recipe/char-siu-production/invoice-scan", schema: object({ body: object({ targetProductionDate: date }), files: array(productionFile, 4, 1) }), load: () => import("@/app/api/recipe/char-siu-production/invoice-scan/route") }),
  routeOperation({ name: "recipe.dining_costs", description: "飲食メニューと中間部品の原価・利益計算済み一覧または指定詳細", mutation: false, method: "GET", pathname: "/api/recipe/dining", schema: object({ query: object({ id: uuid }, []) }, []), load: () => import("@/app/api/recipe/dining/route") }),
  routeOperation({ name: "recipe.dining_item_costs", description: "飲食用食材・資材の単位原価を取得", mutation: false, method: "GET", pathname: "/api/recipe/dining/items", schema: plain(), load: () => import("@/app/api/recipe/dining/items/route") }),
  routeOperation({ name: "recipe.categories", description: "レシピカテゴリ一覧", mutation: false, method: "GET", pathname: "/api/recipe/categories", schema: plain(), load: () => import("@/app/api/recipe/categories/route") }),
  routeOperation({ name: "recipe.category_create", description: "確認済み名称でレシピカテゴリを登録", mutation: true, method: "POST", pathname: "/api/recipe/categories", schema: plain(object({ name: text(200), description: nullableText(2000) }, ["name"])), load: () => import("@/app/api/recipe/categories/route") }),
];
