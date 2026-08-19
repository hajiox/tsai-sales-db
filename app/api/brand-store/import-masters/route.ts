export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import Papa from "papaparse";
import iconv from "iconv-lite";

import { normalizeBrandStoreTaxRate, type BrandStoreTaxRate } from "@/lib/brand-store-tax";
import { currentInventoryFiscalYear } from "@/lib/inventory-fiscal";
import { brandStoreInventoryPrice } from "@/lib/brand-store-inventory-price";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

type ExistingProduct = {
  id: string;
  product_id: number;
  product_name: string;
  category_id: number | null;
  price: number | null;
  barcode: string | null;
  tax_rate: number | null;
};

type ProductCandidate = {
  productId: number;
  variationId: string;
  productName: string;
  categoryId: number | null;
  price: number | null;
  barcode: string | null;
  taxRate: BrandStoreTaxRate | null;
  taxIncluded: boolean;
};

type ImportedProduct = Omit<ProductCandidate, "variationId" | "taxIncluded"> & {
  variantCount: number;
  hasVariantPriceConflict: boolean;
  taxIncludedSource: boolean;
};

type ImportRun = {
  id: string;
  imported_at: string;
  file_name: string;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  price_changed_count: number;
  synced_inventory_id: string | null;
  synced_item_count: number;
};

export async function GET(request: NextRequest) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const lastImport = await fetchLastImport();
    return NextResponse.json({ success: true, ...buildImportStatus(lastImport) });
  } catch (error: any) {
    console.error("brand store master status error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "商品マスターの更新状況を取得できませんでした" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const formData = await request.formData();
    const categoryFile = asFile(formData.get("categoryMaster"));
    const productFile = asFile(formData.get("productMaster"));
    if (!categoryFile && !productFile) {
      return NextResponse.json(
        { success: false, error: "商品マスターCSVを選択してください" },
        { status: 400 },
      );
    }

    const categoryCount = categoryFile ? await importCategoryMaster(categoryFile) : 0;
    if (!productFile) {
      return NextResponse.json({ success: true, categoryCount });
    }

    const importedProducts = await parseProductMaster(productFile);
    const existingProducts = await fetchAllExistingProducts();
    ensureFullProductMaster(importedProducts.length, existingProducts.length);

    const { data: categories, error: categoriesError } = await supabase
      .from("category_master")
      .select("category_id");
    if (categoriesError) throw categoriesError;
    const validCategoryIds = new Set((categories || []).map((row) => Number(row.category_id)));

    const existingByProductId = new Map(
      existingProducts.map((product) => [product.product_id, product]),
    );
    const importedByProductId = new Map(
      importedProducts.map((product) => [product.productId, product]),
    );
    const now = new Date().toISOString();
    const upsertRows = importedProducts.map((product) => {
      const existing = existingByProductId.get(product.productId);
      return {
        product_id: product.productId,
        product_name: product.productName,
        category_id: product.categoryId !== null && validCategoryIds.has(product.categoryId)
          ? product.categoryId
          : existing?.category_id ?? null,
        price: product.price ?? existing?.price ?? null,
        barcode: product.barcode ?? existing?.barcode ?? null,
        tax_rate: product.taxRate ?? normalizeBrandStoreTaxRate(existing?.tax_rate),
        updated_at: now,
      };
    });

    let insertedCount = 0;
    let updatedCount = 0;
    let priceChangedCount = 0;
    const historyRows: Record<string, unknown>[] = [];
    for (const row of upsertRows) {
      const existing = existingByProductId.get(row.product_id);
      if (!existing) {
        insertedCount += 1;
        continue;
      }
      const changed = (
        existing.product_name !== row.product_name
        || nullableNumber(existing.category_id) !== nullableNumber(row.category_id)
        || nullableNumber(existing.price) !== nullableNumber(row.price)
        || normalizeBarcode(existing.barcode) !== normalizeBarcode(row.barcode)
        || normalizeBrandStoreTaxRate(existing.tax_rate) !== normalizeBrandStoreTaxRate(row.tax_rate)
      );
      if (!changed) continue;
      updatedCount += 1;
      if (nullableNumber(existing.price) !== nullableNumber(row.price)) priceChangedCount += 1;
      historyRows.push({
        product_id: row.product_id,
        old_product_name: existing.product_name,
        new_product_name: row.product_name,
        old_category_id: existing.category_id,
        new_category_id: row.category_id,
        old_price: existing.price,
        new_price: row.price,
        old_tax_rate: normalizeBrandStoreTaxRate(existing.tax_rate),
        new_tax_rate: normalizeBrandStoreTaxRate(row.tax_rate),
        old_barcode: existing.barcode,
        new_barcode: row.barcode,
      });
    }

    for (let index = 0; index < upsertRows.length; index += 300) {
      const { error } = await supabase
        .from("product_master")
        .upsert(upsertRows.slice(index, index + 300), { onConflict: "product_id" });
      if (error) throw error;
    }

    const syncResult = await syncCurrentInventory(importedByProductId);
    const token = await getToken({ req: request as any });
    const { data: importRun, error: importError } = await supabase
      .from("brand_store_product_master_imports")
      .insert({
        file_name: sanitizeFileName(productFile.name),
        row_count: importedProducts.length,
        inserted_count: insertedCount,
        updated_count: updatedCount,
        price_changed_count: priceChangedCount,
        synced_inventory_id: syncResult.inventoryId,
        synced_item_count: syncResult.syncedItemCount,
        imported_by: String(token?.email || ""),
      })
      .select("*")
      .single();
    if (importError) throw importError;

    if (historyRows.length) {
      for (let index = 0; index < historyRows.length; index += 300) {
        const rows = historyRows.slice(index, index + 300).map((row) => ({
          ...row,
          import_id: importRun.id,
        }));
        const { error } = await supabase.from("product_master_history").insert(rows);
        if (error) throw error;
      }
    }

    const variantPriceConflictCount = importedProducts.filter(
      (product) => product.hasVariantPriceConflict,
    ).length;
    const taxIncludedConvertedCount = importedProducts.filter(
      (product) => product.taxIncludedSource && product.price !== null,
    ).length;

    return NextResponse.json({
      success: true,
      categoryCount,
      rowCount: importedProducts.length,
      insertedCount,
      updatedCount,
      priceChangedCount,
      syncedInventoryId: syncResult.inventoryId,
      syncedItemCount: syncResult.syncedItemCount,
      linkedManualItemCount: syncResult.linkedManualItemCount,
      variantPriceConflictCount,
      taxIncludedConvertedCount,
      ...buildImportStatus(importRun as ImportRun),
    });
  } catch (error: any) {
    console.error("brand store master import error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "商品マスターの読み込みに失敗しました" },
      { status: 500 },
    );
  }
}

async function parseProductMaster(file: File): Promise<ImportedProduct[]> {
  const text = await decodeCsvFile(file);
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
  });
  if (result.errors.length && !result.data.length) {
    throw new Error("商品マスターCSVを解析できませんでした");
  }

  const headerIndex = result.data.findIndex((row) => (
    findColumn(row, "商品ID") >= 0
    && findColumn(row, "商品名") >= 0
    && findColumn(row, "価格") >= 0
  ));
  if (headerIndex < 0) {
    throw new Error("Airレジの商品マスターCSVではありません（商品ID・商品名・価格が必要です）");
  }

  const headers = result.data[headerIndex];
  const read = (row: string[], label: string) => {
    const index = findColumn(headers, label);
    return index >= 0 ? String(row[index] ?? "").trim() : "";
  };
  const candidatesByProductId = new Map<number, ProductCandidate[]>();

  for (const row of result.data.slice(headerIndex + 1)) {
    const productIdText = normalizeNumericText(read(row, "商品ID"));
    if (!/^\d+$/.test(productIdText)) continue;
    const productName = normalizeProductName(read(row, "商品名"));
    if (!productName) continue;

    const productId = Number(productIdText);
    const taxRate = normalizeBrandStoreTaxRate(read(row, "適用税率"));
    const taxSetting = normalizeHeader(read(row, "税設定"));
    const priceSetting = normalizeHeader(read(row, "価格設定"));
    const rawPrice = parsePrice(read(row, "価格"));
    const sourcePrice = rawPrice ?? (priceSetting.includes("部門打ち") ? 0 : null);
    const taxIncluded = taxSetting.includes("内税") && taxRate !== null;
    const price = sourcePrice !== null && taxIncluded
      ? Math.round((sourcePrice * 100) / (100 + taxRate))
      : sourcePrice;
    const categoryIdText = normalizeNumericText(read(row, "カテゴリーID"));
    const candidate: ProductCandidate = {
      productId,
      variationId: normalizeNumericText(read(row, "バリエーションID")),
      productName,
      categoryId: /^\d+$/.test(categoryIdText) ? Number(categoryIdText) : null,
      price,
      barcode: normalizeStoredBarcode(read(row, "バーコード")),
      taxRate,
      taxIncluded,
    };
    const candidates = candidatesByProductId.get(productId) || [];
    candidates.push(candidate);
    candidatesByProductId.set(productId, candidates);
  }

  if (!candidatesByProductId.size) {
    throw new Error("商品マスターCSVに登録済み商品がありません");
  }

  return Array.from(candidatesByProductId.values()).map((candidates) => {
    const representative = chooseRepresentative(candidates);
    const priceKeys = new Set(
      candidates.map((candidate) => `${candidate.price ?? ""}:${candidate.taxRate ?? ""}`),
    );
    return {
      productId: representative.productId,
      productName: representative.productName,
      categoryId: representative.categoryId,
      price: representative.price,
      barcode: representative.barcode,
      taxRate: representative.taxRate,
      variantCount: candidates.length,
      hasVariantPriceConflict: priceKeys.size > 1,
      taxIncludedSource: representative.taxIncluded,
    };
  });
}

function chooseRepresentative(candidates: ProductCandidate[]) {
  if (candidates.length === 1) return candidates[0];
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = `${candidate.price ?? ""}:${candidate.taxRate ?? ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let selected = candidates[0];
  let selectedCount = -1;
  for (const candidate of candidates) {
    const key = `${candidate.price ?? ""}:${candidate.taxRate ?? ""}`;
    const count = counts.get(key) || 0;
    if (count > selectedCount) {
      selected = candidate;
      selectedCount = count;
    }
  }
  return selected;
}

async function syncCurrentInventory(importedByProductId: Map<number, ImportedProduct>) {
  const fiscalYear = currentInventoryFiscalYear();
  const { data: inventory, error: inventoryError } = await supabase
    .from("brand_store_inventory_counts")
    .select("*")
    .eq("fiscal_year", fiscalYear)
    .eq("status", "draft")
    .maybeSingle();
  if (inventoryError) throw inventoryError;
  if (!inventory) {
    return { inventoryId: null, syncedItemCount: 0, linkedManualItemCount: 0 };
  }

  const items: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("brand_store_inventory_items")
      .select("*")
      .eq("inventory_id", inventory.id)
      .range(from, from + 999);
    if (error) throw error;
    items.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const importedByName = buildUniqueProductNameLookup(importedByProductId);
  let linkedManualItemCount = 0;
  const changedItems = items.flatMap((item) => {
    let product = importedByProductId.get(Number(item.source_product_id));
    let linkedManualItem = false;
    if (!product && item.is_manual && item.source_product_id === null) {
      product = findManualProductMatch(item.product_name, importedByName);
      linkedManualItem = Boolean(product);
    }
    if (!product) return [];
    const taxRate = product.taxRate || normalizeBrandStoreTaxRate(item.tax_rate) || 10;
    const wholesalePrice = brandStoreInventoryPrice(product.price);
    const sourceProductId = Number(item.source_product_id) || product.productId;
    const productName = item.is_manual ? item.product_name : product.productName;
    const changed = (
      Number(item.source_product_id) !== sourceProductId
      || item.product_name !== productName
      || nullableNumber(item.selling_price) !== nullableNumber(product.price)
      || nullableNumber(item.wholesale_price) !== wholesalePrice
      || normalizeBrandStoreTaxRate(item.tax_rate) !== taxRate
    );
    if (!changed) return [];
    if (linkedManualItem) linkedManualItemCount += 1;
    return [{
      ...item,
      source_product_id: sourceProductId,
      product_name: productName,
      selling_price: product.price,
      wholesale_price: wholesalePrice,
      tax_rate: taxRate,
    }];
  });

  for (let index = 0; index < changedItems.length; index += 300) {
    const { error } = await supabase
      .from("brand_store_inventory_items")
      .upsert(changedItems.slice(index, index + 300), { onConflict: "id" });
    if (error) throw error;
  }
  return {
    inventoryId: inventory.id,
    syncedItemCount: changedItems.length,
    linkedManualItemCount,
  };
}

function buildUniqueProductNameLookup(importedByProductId: Map<number, ImportedProduct>) {
  const grouped = new Map<string, ImportedProduct[]>();
  for (const product of importedByProductId.values()) {
    const key = normalizeProductMatchName(product.productName);
    if (!key) continue;
    const matches = grouped.get(key) || [];
    matches.push(product);
    grouped.set(key, matches);
  }

  const unique = new Map<string, ImportedProduct>();
  for (const [key, matches] of grouped) {
    if (matches.length === 1) unique.set(key, matches[0]);
  }
  return unique;
}

function findManualProductMatch(
  productName: string,
  importedByName: Map<string, ImportedProduct>,
) {
  const exact = importedByName.get(normalizeProductMatchName(productName));
  if (exact) return exact;

  const withoutCosmeticSuffix = stripCosmeticProductSuffix(productName);
  if (withoutCosmeticSuffix === productName) return undefined;
  return importedByName.get(normalizeProductMatchName(withoutCosmeticSuffix));
}

function stripCosmeticProductSuffix(value: string) {
  const normalized = String(value || "").normalize("NFKC").trim();
  const match = normalized.match(/^(.*?)[\s　]*\(([^()]*)\)\s*$/);
  if (!match) return value;
  const descriptor = match[2].trim();
  if (!/(?:色|カラー|パッケージ|ラベル)/.test(descriptor)) return value;
  return match[1].trim();
}

function normalizeProductMatchName(value: string) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s　・･]/g, "");
}

async function importCategoryMaster(file: File) {
  const text = await decodeCsvFile(file);
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
  const headerIndex = result.data.findIndex((row) => (
    findColumn(row, "カテゴリーID") >= 0 && findColumn(row, "カテゴリー名") >= 0
  ));
  if (headerIndex < 0) throw new Error("AirレジのカテゴリーマスターCSVではありません");
  const headers = result.data[headerIndex];
  const read = (row: string[], label: string) => {
    const index = findColumn(headers, label);
    return index >= 0 ? String(row[index] ?? "").trim() : "";
  };
  const categoryMap = new Map<number, Record<string, unknown>>();
  for (const row of result.data.slice(headerIndex + 1)) {
    const idText = normalizeNumericText(read(row, "カテゴリーID"));
    if (!/^\d+$/.test(idText)) continue;
    const id = Number(idText);
    categoryMap.set(id, {
      category_id: id,
      category_name: read(row, "カテゴリー名"),
      category_short_name: read(row, "カテゴリー名（略称）"),
      is_visible: read(row, "表示/非表示") || "1",
      updated_at: new Date().toISOString(),
    });
  }
  const rows = Array.from(categoryMap.values());
  for (let index = 0; index < rows.length; index += 300) {
    const { error } = await supabase
      .from("category_master")
      .upsert(rows.slice(index, index + 300), { onConflict: "category_id" });
    if (error) throw error;
  }
  return rows.length;
}

async function fetchAllExistingProducts(): Promise<ExistingProduct[]> {
  const rows: ExistingProduct[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("product_master")
      .select("id,product_id,product_name,category_id,price,barcode,tax_rate")
      .not("product_id", "is", null)
      .order("product_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as ExistingProduct[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchLastImport(): Promise<ImportRun | null> {
  const { data, error } = await supabase
    .from("brand_store_product_master_imports")
    .select("id,imported_at,file_name,row_count,inserted_count,updated_count,price_changed_count,synced_inventory_id,synced_item_count")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ImportRun | null) || null;
}

function buildImportStatus(lastImport: ImportRun | null) {
  if (!lastImport) {
    return { lastImport: null, nextDueAt: null, alert: true };
  }
  const nextDue = new Date(lastImport.imported_at);
  nextDue.setUTCMonth(nextDue.getUTCMonth() + 3);
  return {
    lastImport,
    nextDueAt: nextDue.toISOString(),
    alert: Date.now() >= nextDue.getTime(),
  };
}

function ensureFullProductMaster(importedCount: number, existingCount: number) {
  const minimum = Math.max(10, Math.floor(existingCount * 0.5));
  if (importedCount < minimum) {
    throw new Error(
      `商品数が${importedCount.toLocaleString()}件しかありません。Airレジから全商品を含む一括編集CSVをダウンロードしてください`,
    );
  }
}

async function decodeCsvFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("商品ID") || utf8.includes("カテゴリーID")) return utf8;
  const shiftJis = iconv.decode(buffer, "cp932");
  if (shiftJis.includes("商品ID") || shiftJis.includes("カテゴリーID")) return shiftJis;
  throw new Error("CSVの文字コードまたは形式を認識できませんでした");
}

function findColumn(headers: string[], label: string) {
  return headers.findIndex((value) => {
    const header = normalizeHeader(value).replace(/^【必須】/, "");
    return header === label
      || header.startsWith(`${label} `)
      || header.startsWith(`${label}※`);
  });
}

function normalizeHeader(value: unknown) {
  return String(value || "").replace(/^\uFEFF/, "").normalize("NFKC").trim();
}

function normalizeNumericText(value: unknown) {
  return String(value || "").normalize("NFKC").trim();
}

function normalizeProductName(value: unknown) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 300);
}

function normalizeStoredBarcode(value: unknown) {
  const text = String(value || "").normalize("NFKC").trim();
  return text || null;
}

function normalizeBarcode(value: unknown) {
  return String(value || "").normalize("NFKC").replace(/^#/, "").trim();
}

function parsePrice(value: unknown) {
  const text = String(value || "")
    .normalize("NFKC")
    .replace(/[,\s¥￥円]/g, "")
    .trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeFileName(value: unknown) {
  return String(value || "").replace(/[^\p{L}\p{N}._()（）-]/gu, "_").slice(0, 200);
}

function asFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
}

async function requireAuthorized(request: NextRequest) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
