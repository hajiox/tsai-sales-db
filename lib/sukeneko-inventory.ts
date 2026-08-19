import { createHash } from "crypto";
import iconv from "iconv-lite";
import Papa from "papaparse";

import {
  retailPriceExclTaxFromIncluded,
  wholesaleInventoryPrice,
  type WholesaleInventoryTaxRate,
} from "./wholesale-inventory-price";

export type SukenekoRecipe = {
  id: string;
  name: string;
  selling_price: number | string | null;
  jan_code: string | null;
  linked_wholesale_product_id: string | null;
  category: string | null;
};

export type SukenekoWebProduct = {
  id: string;
  name: string;
  price: number | string | null;
  product_code: string | null;
  product_number: string | null;
  global_product_id: string | null;
  is_hidden: boolean | null;
};

export type SukenekoWholesaleProduct = {
  id: string;
  product_code: string | null;
  product_name: string;
  price: number | string | null;
};

export type SukenekoTitleMapping = {
  channel: string;
  title: string;
  productId: string;
};

export type SukenekoProductMasterRow = {
  sourceCode: string;
  productName: string;
  sellingPrice: number | null;
  isSet: boolean;
};

export type SukenekoRawRow = {
  rowNumber: number;
  sourceCode: string;
  productName: string;
  optionName: string;
  axisName: string;
  stock: number;
  sellingPriceInclTax: number | null;
  codes: string[];
  marketplaceCodes: {
    rakuten: string;
    yahoo: string;
    amazon: string;
    qoo10: string;
    base: string;
    mercari: string;
  };
};

export type WholesaleInventoryCandidate = {
  sourceKey: string;
  sourceRecipeId: string | null;
  sourceWebProductId: string | null;
  productName: string;
  retailPriceExclTax: number | null;
  wholesalePrice: number | null;
  taxRate: WholesaleInventoryTaxRate;
  quantity: number;
  priceSource: string;
  calculationMethod: "direct" | "unmatched";
  reviewStatus: "confirmed" | "needs_review";
  reviewReason: string;
  sourceRows: Record<string, unknown>[];
};

export type SukenekoImportResult = {
  sourceRowCount: number;
  matchedRowCount: number;
  setRowCount: number;
  duplicateRowCount: number;
  needsReviewCount: number;
  candidates: WholesaleInventoryCandidate[];
};

export type SukenekoMasterPartition = {
  physicalRows: SukenekoRawRow[];
  setRows: SukenekoRawRow[];
  missingRows: SukenekoRawRow[];
};

type PriceResolution = {
  recipe: SukenekoRecipe | null;
  webProduct: SukenekoWebProduct | null;
  productName: string;
  retailPriceExclTax: number | null;
  wholesalePrice: number | null;
  priceSource: string;
  reviewStatus: "confirmed" | "needs_review";
  reviewReason: string;
};

const INVENTORY_REQUIRED_HEADERS = [
  "助ネコ商品コード",
  "商品名",
  "販売価格（円）",
  "在庫数",
];

const MASTER_REQUIRED_HEADERS = [
  "助ネコ商品コード",
  "商品名",
  "セット商品フラグ",
];

export function parseSukenekoInventoryCsv(buffer: Buffer): SukenekoRawRow[] {
  const data = parseCsvRows(buffer, INVENTORY_REQUIRED_HEADERS, "助ネコ在庫CSV");
  const headers = data.headers;
  const column = (label: string) => findColumn(headers, label);
  const indexes = {
    sourceCode: column("助ネコ商品コード"),
    rakuten: column("楽天商品コード"),
    yahoo: column("Yahoo商品コード"),
    amazon: column("Amazon商品コード"),
    qoo10: column("Qoo10商品コード"),
    base: column("BASE商品コード"),
    mercari: column("メルカリShops商品コード"),
    productName: column("商品名"),
    optionName: column("商品名(オプション)"),
    axisName: column("横軸名"),
    sellingPrice: column("販売価格（円）"),
    stock: column("在庫数"),
    customCode: column("カスタム商品コード"),
    janCode: column("JANコード"),
  };

  return data.rows
    .map((row, index) => {
      const read = (position: number) => position >= 0 ? String(row[position] ?? "").trim() : "";
      const productName = normalizeDisplayName(read(indexes.productName));
      const optionName = normalizeDisplayName(read(indexes.optionName));
      const axisName = normalizeDisplayName(read(indexes.axisName));
      const stock = nonNegativeInteger(read(indexes.stock));
      if (!productName || stock === null) return null;

      const marketplaceCodes = {
        rakuten: read(indexes.rakuten),
        yahoo: read(indexes.yahoo),
        amazon: read(indexes.amazon),
        qoo10: read(indexes.qoo10),
        base: read(indexes.base),
        mercari: read(indexes.mercari),
      };
      const rawCodes = [
        read(indexes.sourceCode),
        ...Object.values(marketplaceCodes),
        read(indexes.customCode),
        read(indexes.janCode),
      ];

      return {
        rowNumber: data.headerIndex + index + 2,
        sourceCode: normalizeCode(read(indexes.sourceCode)),
        productName,
        optionName,
        axisName,
        stock,
        sellingPriceInclTax: nonNegativeNumber(read(indexes.sellingPrice)),
        codes: expandCodes(rawCodes),
        marketplaceCodes,
      } satisfies SukenekoRawRow;
    })
    .filter((row): row is SukenekoRawRow => row !== null);
}

export function parseSukenekoProductMasterCsv(
  buffer: Buffer,
): SukenekoProductMasterRow[] {
  const data = parseCsvRows(buffer, MASTER_REQUIRED_HEADERS, "助ネコ商品基本情報CSV");
  const codeIndex = findColumn(data.headers, "助ネコ商品コード");
  const nameIndex = findColumn(data.headers, "商品名");
  const priceIndex = findColumn(data.headers, "販売価格");
  const setIndex = findColumn(data.headers, "セット商品フラグ");
  const byCode = new Map<string, SukenekoProductMasterRow>();

  for (const row of data.rows) {
    const sourceCode = normalizeCode(row[codeIndex]);
    const productName = normalizeDisplayName(row[nameIndex]);
    if (!sourceCode || !productName) continue;
    byCode.set(sourceCode, {
      sourceCode,
      productName,
      sellingPrice: nonNegativeNumber(row[priceIndex]),
      isSet: normalizeSetFlag(row[setIndex]),
    });
  }

  if (!byCode.size) {
    throw new Error("商品基本情報CSVに登録済み商品がありません");
  }
  return Array.from(byCode.values());
}

export function partitionInventoryRowsByMaster(
  rows: SukenekoRawRow[],
  masterRows: SukenekoProductMasterRow[],
): SukenekoMasterPartition {
  const masterByCode = new Map(
    masterRows.map((row) => [normalizeCode(row.sourceCode), row]),
  );
  const physicalRows: SukenekoRawRow[] = [];
  const setRows: SukenekoRawRow[] = [];
  const missingRows: SukenekoRawRow[] = [];

  for (const row of rows) {
    const master = masterByCode.get(normalizeCode(row.sourceCode));
    if (!master) {
      missingRows.push(row);
    } else if (master.isSet) {
      setRows.push(row);
    } else {
      physicalRows.push(row);
    }
  }
  return { physicalRows, setRows, missingRows };
}

export function buildWholesaleInventoryCandidates({
  rows,
  sourceRowCount,
  setRowCount,
  recipes,
  webProducts,
  wholesaleProducts,
  titleMappings,
}: {
  rows: SukenekoRawRow[];
  sourceRowCount: number;
  setRowCount: number;
  recipes: SukenekoRecipe[];
  webProducts: SukenekoWebProduct[];
  wholesaleProducts: SukenekoWholesaleProduct[];
  titleMappings: SukenekoTitleMapping[];
}): SukenekoImportResult {
  const recipesByCode = indexByCodes(recipes, (recipe) => [recipe.jan_code]);
  const webProductsByCode = indexByCodes(
    webProducts.filter((product) => !product.is_hidden),
    (product) => [
      product.product_code,
      product.product_number,
      product.global_product_id,
    ],
  );
  const webProductsById = new Map(webProducts.map((product) => [product.id, product]));
  const wholesaleProductsById = new Map(
    wholesaleProducts.map((product) => [product.id, product]),
  );
  const mappedProductsByTitle = buildMappedProductLookup(titleMappings, webProductsById);

  const candidates = rows.map((row) => {
    const resolution = resolvePrice({
      row,
      recipes,
      recipesByCode,
      webProductsByCode,
      wholesaleProductsById,
      mappedProductsByTitle,
    });
    return {
      sourceKey: `sukeneko:${stableHash(row.sourceCode || `row-${row.rowNumber}`)}`,
      sourceRecipeId: resolution.recipe?.id || null,
      sourceWebProductId: resolution.webProduct?.id || null,
      productName: resolution.productName,
      retailPriceExclTax: resolution.retailPriceExclTax,
      wholesalePrice: resolution.wholesalePrice,
      taxRate: 8,
      quantity: row.stock,
      priceSource: resolution.priceSource,
      calculationMethod: resolution.reviewStatus === "confirmed" ? "direct" : "unmatched",
      reviewStatus: resolution.reviewStatus,
      reviewReason: resolution.reviewReason,
      sourceRows: [{
        rowNumber: row.rowNumber,
        sourceCode: row.sourceCode,
        productName: row.productName,
        optionName: row.optionName,
        axisName: row.axisName,
        stock: row.stock,
        sellingPriceInclTax: row.sellingPriceInclTax,
        codes: row.codes,
        matchedRecipeId: resolution.recipe?.id || null,
        matchedRecipeName: resolution.recipe?.name || null,
        matchedWebProductId: resolution.webProduct?.id || null,
        matchedWebProductName: resolution.webProduct?.name || null,
        convertedQuantity: row.stock,
        multiplier: 1,
        matchKind: resolution.priceSource,
      }],
    } satisfies WholesaleInventoryCandidate;
  });

  candidates.sort((left, right) => (
    statusOrder(left.reviewStatus) - statusOrder(right.reviewStatus)
    || left.productName.localeCompare(right.productName, "ja")
  ));

  return {
    sourceRowCount,
    matchedRowCount: candidates.filter(
      (candidate) => candidate.sourceRecipeId || candidate.sourceWebProductId,
    ).length,
    setRowCount,
    duplicateRowCount: 0,
    needsReviewCount: candidates.filter(
      (candidate) => candidate.reviewStatus === "needs_review",
    ).length,
    candidates,
  };
}

function resolvePrice({
  row,
  recipes,
  recipesByCode,
  webProductsByCode,
  wholesaleProductsById,
  mappedProductsByTitle,
}: {
  row: SukenekoRawRow;
  recipes: SukenekoRecipe[];
  recipesByCode: Map<string, SukenekoRecipe[]>;
  webProductsByCode: Map<string, SukenekoWebProduct[]>;
  wholesaleProductsById: Map<string, SukenekoWholesaleProduct>;
  mappedProductsByTitle: Map<string, SukenekoWebProduct[]>;
}): PriceResolution {
  const mappedProducts = unique(
    rowTitleKeys(row).flatMap((key) => mappedProductsByTitle.get(key) || []),
    (product) => product.id,
  ).filter((product) => toNullableNumber(product.price) !== null);
  const exactRecipes = unique(
    row.codes.flatMap((code) => recipesByCode.get(code) || []),
    (recipe) => recipe.id,
  );
  const pricedExactRecipes = exactRecipes.filter(
    (recipe) => toNullableNumber(recipe.selling_price) !== null,
  );
  if (pricedExactRecipes.length) {
    const recipe = bestRecipeForRow(row, pricedExactRecipes);
    const retailPrice = toNullableNumber(recipe.selling_price);
    const distinctPrices = new Set(
      pricedExactRecipes.map((candidate) => toNullableNumber(candidate.selling_price)),
    );
    const ambiguous = distinctPrices.size > 1;
    if (ambiguous && mappedProducts.length === 1) {
      return resolvedFromWebProduct(
        mappedProducts[0],
        "WEB販売管理（レシピ価格差を解決）",
      );
    }
    return resolvedFromRecipe(
      recipe,
      retailPrice,
      "レシピ（商品コード一致）",
      ambiguous
        ? "同じ商品コードに価格の異なるレシピが複数あります。選択結果を確認してください"
        : "",
    );
  }

  if (mappedProducts.length === 1) {
    return resolvedFromWebProduct(mappedProducts[0], "WEB販売管理（確定済み紐付け）");
  }
  if (mappedProducts.length > 1) {
    const product = bestWebProductForRow(row, mappedProducts);
    const resolution = resolvedFromWebProduct(product, "WEB販売管理（確定済み紐付け）");
    return {
      ...resolution,
      reviewStatus: "needs_review",
      reviewReason: "同じ商品名に複数のWEB商品が紐付いています。価格を確認してください",
    };
  }

  const exactWebProducts = unique(
    row.codes.flatMap((code) => webProductsByCode.get(code) || []),
    (product) => product.id,
  ).filter((product) => toNullableNumber(product.price) !== null);
  if (exactWebProducts.length) {
    const product = bestWebProductForRow(row, exactWebProducts);
    const resolution = resolvedFromWebProduct(product, "WEB商品マスター（商品コード一致）");
    return exactWebProducts.length === 1
      ? resolution
      : {
          ...resolution,
          reviewStatus: "needs_review",
          reviewReason: "同じ商品コードに複数のWEB商品があります。価格を確認してください",
        };
  }

  const containedRecipes = findContainedRecipes(row, recipes);
  if (containedRecipes.length) {
    const recipe = containedRecipes[0];
    const retailPrice = toNullableNumber(recipe.selling_price);
    const topCoreLength = recipeCore(recipe.name).length;
    const competingPrices = new Set(
      containedRecipes
        .filter((candidate) => recipeCore(candidate.name).length === topCoreLength)
        .map((candidate) => toNullableNumber(candidate.selling_price)),
    );
    const ambiguous = competingPrices.size > 1;
    return resolvedFromRecipe(
      recipe,
      retailPrice,
      "レシピ（商品名一致）",
      ambiguous
        ? "商品名に一致する価格違いのレシピが複数あります。価格を確認してください"
        : "",
    );
  }

  const linkedRecipe = exactRecipes.length
    ? bestRecipeForRow(row, exactRecipes)
    : null;
  const linkedWholesale = linkedRecipe?.linked_wholesale_product_id
    ? wholesaleProductsById.get(linkedRecipe.linked_wholesale_product_id) || null
    : null;
  const linkedWholesalePrice = toNullableNumber(linkedWholesale?.price);
  if (linkedRecipe && linkedWholesalePrice !== null) {
    const retailPrice = retailFromWholesalePrice(linkedWholesalePrice, 8);
    return {
      recipe: linkedRecipe,
      webProduct: null,
      productName: displayRecipeName(linkedRecipe.name),
      retailPriceExclTax: retailPrice,
      wholesalePrice: wholesaleInventoryPrice(retailPrice, 8),
      priceSource: "卸商品マスター（レシピ紐付け）",
      reviewStatus: "needs_review",
      reviewReason: "レシピ販売価格が未設定のため、卸商品マスターから逆算しました",
    };
  }

  const retailPrice = retailPriceExclTaxFromIncluded(row.sellingPriceInclTax, 8);
  return {
    recipe: null,
    webProduct: null,
    productName: conciseProductName(row),
    retailPriceExclTax: retailPrice,
    wholesalePrice: wholesaleInventoryPrice(retailPrice, 8),
    priceSource: "助ネコ販売価格",
    reviewStatus: retailPrice === null ? "needs_review" : "confirmed",
    reviewReason: retailPrice === null
      ? "他システムと価格照合できず、助ネコ販売価格もありません"
      : "",
  };
}

function resolvedFromRecipe(
  recipe: SukenekoRecipe,
  retailPrice: number | null,
  priceSource: string,
  reviewReason: string,
): PriceResolution {
  return {
    recipe,
    webProduct: null,
    productName: displayRecipeName(recipe.name),
    retailPriceExclTax: retailPrice,
    wholesalePrice: wholesaleInventoryPrice(retailPrice, 8),
    priceSource,
    reviewStatus: reviewReason ? "needs_review" : "confirmed",
    reviewReason,
  };
}

function resolvedFromWebProduct(
  product: SukenekoWebProduct,
  priceSource: string,
): PriceResolution {
  const retailPrice = retailPriceExclTaxFromIncluded(product.price, 8);
  return {
    recipe: null,
    webProduct: product,
    productName: normalizeDisplayName(product.name),
    retailPriceExclTax: retailPrice,
    wholesalePrice: wholesaleInventoryPrice(retailPrice, 8),
    priceSource,
    reviewStatus: "confirmed",
    reviewReason: "",
  };
}

function buildMappedProductLookup(
  mappings: SukenekoTitleMapping[],
  productsById: Map<string, SukenekoWebProduct>,
) {
  const result = new Map<string, SukenekoWebProduct[]>();
  for (const mapping of mappings) {
    const product = productsById.get(mapping.productId);
    const key = comparableTitle(mapping.title);
    if (!product || product.is_hidden || !key) continue;
    const current = result.get(key) || [];
    current.push(product);
    result.set(key, current);
  }
  return result;
}

function rowTitleKeys(row: SukenekoRawRow) {
  return unique(
    [row.productName, row.optionName, row.axisName]
      .map(comparableTitle)
      .filter(Boolean),
    (value) => value,
  );
}

function findContainedRecipes(row: SukenekoRawRow, recipes: SukenekoRecipe[]) {
  const rowNames = [row.productName, row.optionName, row.axisName]
    .map(recipeCore)
    .filter(Boolean);
  return recipes
    .filter((recipe) => toNullableNumber(recipe.selling_price) !== null)
    .map((recipe) => ({ recipe, core: recipeCore(recipe.name) }))
    .filter(({ recipe, core }) => (
      core.length >= 5
      && compatibleQuantityTokens(row, recipe.name)
      && rowNames.some((name) => name.includes(core) || (
        name.length >= 5 && core.includes(name)
      ))
    ))
    .sort((left, right) => (
      right.core.length - left.core.length
      || bestNameSimilarity(row, right.recipe.name)
        - bestNameSimilarity(row, left.recipe.name)
    ))
    .map(({ recipe }) => recipe);
}

function bestRecipeForRow(
  row: SukenekoRawRow,
  recipes: SukenekoRecipe[],
) {
  return [...recipes].sort(
    (left, right) => bestNameSimilarity(row, right.name) - bestNameSimilarity(row, left.name),
  )[0];
}

function bestWebProductForRow(
  row: SukenekoRawRow,
  products: SukenekoWebProduct[],
) {
  return [...products].sort(
    (left, right) => bestNameSimilarity(row, right.name) - bestNameSimilarity(row, left.name),
  )[0];
}

function bestNameSimilarity(row: SukenekoRawRow, target: string) {
  return Math.max(
    nameSimilarity(row.productName, target),
    nameSimilarity(row.optionName, target),
    nameSimilarity(row.axisName, target),
  );
}

function nameSimilarity(left: string, right: string) {
  const a = comparableName(left);
  const b = comparableName(right);
  if (!a || !b) return 0;
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  let intersection = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) intersection += 1;
  }
  let score = (2 * intersection) / (gramsA.size + gramsB.size || 1);
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) {
    score = Math.max(score, 0.72 + (0.25 * shorter.length / longer.length));
  }
  return Math.min(score, 1);
}

function compatibleQuantityTokens(row: SukenekoRawRow, recipeName: string) {
  const rowTokens = quantityTokens(
    `${row.productName} ${row.optionName} ${row.axisName}`,
  );
  const recipeTokens = quantityTokens(recipeName);
  if (!rowTokens.length || !recipeTokens.length) return true;
  return rowTokens.some((token) => recipeTokens.includes(token));
}

function quantityTokens(value: string) {
  const normalized = String(value || "").normalize("NFKC").toLowerCase();
  return unique(
    Array.from(normalized.matchAll(
      /(\d+(?:\.\d+)?)\s*(個|食|袋|本|箱|枚|セット|g|kg|ml|l)/g,
    )).map((match) => `${match[1]}${match[2]}`),
    (token) => token,
  );
}

function parseCsvRows(
  buffer: Buffer,
  requiredHeaders: string[],
  label: string,
) {
  const text = decodeCsv(buffer, requiredHeaders);
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
  });
  if (result.errors.length && !result.data.length) {
    throw new Error(`${label}を解析できませんでした`);
  }
  const headerIndex = result.data.findIndex((row) => (
    requiredHeaders.every((header) => findColumn(row, header) >= 0)
  ));
  if (headerIndex < 0) {
    throw new Error(
      `${label}ではありません（${requiredHeaders.join("・")}が必要です）`,
    );
  }
  return {
    headerIndex,
    headers: result.data[headerIndex],
    rows: result.data.slice(headerIndex + 1),
  };
}

function decodeCsv(buffer: Buffer, requiredHeaders: string[]) {
  const utf8 = iconv.decode(buffer, "utf8").replace(/^\uFEFF/, "");
  if (
    !utf8.includes("\uFFFD")
    && requiredHeaders.some((header) => utf8.includes(header))
  ) {
    return utf8;
  }
  return iconv.decode(buffer, "cp932").replace(/^\uFEFF/, "");
}

function findColumn(headers: unknown[], label: string) {
  const expected = normalizeHeader(label);
  return headers.findIndex((value) => normalizeHeader(value) === expected);
}

function indexByCodes<T>(
  values: T[],
  readCodes: (value: T) => Array<unknown>,
) {
  const result = new Map<string, T[]>();
  for (const value of values) {
    for (const code of expandCodes(readCodes(value).map(String))) {
      const current = result.get(code) || [];
      current.push(value);
      result.set(code, current);
    }
  }
  return result;
}

function expandCodes(values: string[]) {
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeCode(value);
    if (!normalized) continue;
    result.push(normalized);
    result.push(...(normalized.match(/\d{13}/g) || []));
  }
  return unique(result.filter(Boolean), (code) => code);
}

function normalizeSetFlag(value: unknown) {
  const text = normalizeHeader(value);
  return text === "1" || text === "true" || text === "有" || text === "セット";
}

function comparableTitle(value: unknown) {
  return normalizeDisplayName(value).toLocaleLowerCase("ja-JP");
}

function recipeCore(value: unknown) {
  return normalizeDisplayName(value)
    .replace(/【[^】]*】/g, "")
    .replace(/[、，,.・\s　\-―ー_/()（）「」]/g, "")
    .toLocaleLowerCase("ja-JP");
}

function comparableName(value: unknown) {
  return normalizeDisplayName(value)
    .replace(/&#\d+;/g, "")
    .replace(/【(?:TikTok連携|送料無料|単品|ネット|商品|非売品|お試し)[^】]*】/g, "")
    .replace(/[、，,.・\s　\-―ー_/()（）【】\[\]「」]/g, "")
    .toLocaleLowerCase("ja-JP");
}

function displayRecipeName(value: string) {
  return normalizeDisplayName(value)
    .replace(/^【(?:卸|商品|ネット)】\s*/, "")
    .trim();
}

function conciseProductName(row: SukenekoRawRow) {
  const value = row.optionName && row.optionName.length >= 4
    ? row.optionName
    : row.axisName && row.axisName.length >= 4
      ? row.axisName
      : row.productName;
  return normalizeDisplayName(value).slice(0, 300);
}

function normalizeCode(value: unknown) {
  return String(value || "").normalize("NFKC").trim();
}

function normalizeHeader(value: unknown) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

function normalizeDisplayName(value: unknown) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string) {
  const result = new Set<string>();
  if (value.length === 1) result.add(value);
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function stableHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 20);
}

function statusOrder(status: WholesaleInventoryCandidate["reviewStatus"]) {
  return status === "needs_review" ? 0 : 1;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = toNullableNumber(String(value || "").replace(/,/g, ""));
  return number !== null && number >= 0 ? number : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = nonNegativeNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function retailFromWholesalePrice(
  wholesalePriceInclTax: number | null,
  taxRate: WholesaleInventoryTaxRate,
) {
  if (wholesalePriceInclTax === null) return null;
  const wholesaleExclTax = retailPriceExclTaxFromIncluded(
    wholesalePriceInclTax,
    taxRate,
  );
  if (wholesaleExclTax === null) return null;
  return Math.round((wholesaleExclTax / 0.7) * 100) / 100;
}

function unique<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
