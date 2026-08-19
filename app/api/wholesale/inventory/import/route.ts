export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

import {
  currentInventoryFiscalYear,
  normalizeInventoryFiscalYear,
} from "@/lib/inventory-fiscal";
import {
  buildWholesaleInventoryCandidates,
  partitionInventoryRowsByMaster,
  parseSukenekoInventoryCsv,
  type SukenekoRecipe,
  type SukenekoProductMasterRow,
  type SukenekoTitleMapping,
  type SukenekoWebProduct,
  type SukenekoWholesaleProduct,
} from "@/lib/sukeneko-inventory";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "助ネコ在庫CSVを選択してください" },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "CSVは10MB以下にしてください" },
        { status: 400 },
      );
    }

    const fiscalYear = normalizeInventoryFiscalYear(formData.get("fiscalYear"))
      || currentInventoryFiscalYear();
    const rawRows = parseSukenekoInventoryCsv(Buffer.from(await file.arrayBuffer()));
    if (!rawRows.length) {
      return NextResponse.json(
        { success: false, error: "CSVに在庫商品がありません" },
        { status: 400 },
      );
    }

    const [masterImport, masterRows] = await Promise.all([
      fetchLatestMasterImport(),
      fetchAll<SukenekoProductMasterRow>(
        "wholesale_sukeneko_product_master",
        "sourceCode:source_code,productName:product_name,sellingPrice:source_price,isSet:is_set",
      ),
    ]);
    if (!masterImport || !masterRows.length) {
      return NextResponse.json(
        {
          success: false,
          error: "先に助ネコの商品基本情報CSVを登録してください",
          code: "SUKENEKO_MASTER_REQUIRED",
        },
        { status: 409 },
      );
    }

    const partition = partitionInventoryRowsByMaster(rawRows, masterRows);
    if (partition.missingRows.length) {
      const examples = partition.missingRows
        .slice(0, 5)
        .map((row) => `${row.sourceCode || "コードなし"} ${row.productName}`)
        .join(" / ");
      return NextResponse.json(
        {
          success: false,
          error: `商品基本情報CSVにない商品が${partition.missingRows.length}件あります。`
            + `セット判定マスターを更新してください（${examples}）`,
          code: "SUKENEKO_MASTER_OUTDATED",
          missingCount: partition.missingRows.length,
        },
        { status: 409 },
      );
    }

    const [recipes, webProducts, wholesaleProducts, titleMappings] = await Promise.all([
      fetchAll<SukenekoRecipe>(
        "recipes",
        "id,name,selling_price,jan_code,linked_wholesale_product_id,category",
      ),
      fetchAll<SukenekoWebProduct>(
        "products",
        "id,name,price,product_code,product_number,global_product_id,is_hidden",
      ),
      fetchAll<SukenekoWholesaleProduct>(
        "wholesale_products",
        "id,product_code,product_name,price",
      ),
      fetchTitleMappings(),
    ]);

    const result = buildWholesaleInventoryCandidates({
      rows: partition.physicalRows,
      sourceRowCount: rawRows.length,
      setRowCount: partition.setRows.length,
      recipes,
      webProducts,
      wholesaleProducts,
      titleMappings,
    });
    const inventory = await findOrCreateInventory(request, fiscalYear);
    const existingItems = await fetchAllExistingItems(inventory.id);
    const existingBySource = new Map(
      existingItems
        .filter((item) => item.source_key)
        .map((item) => [String(item.source_key), item]),
    );
    const importedSourceKeys = new Set(result.candidates.map((candidate) => candidate.sourceKey));

    const rows = result.candidates.map((candidate, index) => {
      const existing = existingBySource.get(candidate.sourceKey);
      const preserveManualPrice = Boolean(existing?.price_is_manual);
      const preserveReview = existing?.review_status === "confirmed"
        || existing?.review_status === "excluded";
      return {
        ...(existing?.id ? { id: existing.id } : {}),
        inventory_id: inventory.id,
        source_key: candidate.sourceKey,
        source_recipe_id: candidate.sourceRecipeId,
        source_web_product_id: candidate.sourceWebProductId,
        product_name: existing?.product_name || candidate.productName,
        retail_price_excl_tax: preserveManualPrice
          ? existing.retail_price_excl_tax
          : candidate.retailPriceExclTax,
        wholesale_price: preserveManualPrice
          ? existing.wholesale_price
          : candidate.wholesalePrice,
        tax_rate: preserveManualPrice ? existing.tax_rate : candidate.taxRate,
        quantity: candidate.quantity,
        price_source: preserveManualPrice ? "手動修正" : candidate.priceSource,
        calculation_method: candidate.calculationMethod,
        review_status: preserveReview ? existing.review_status : candidate.reviewStatus,
        review_reason: candidate.reviewReason,
        source_rows: candidate.sourceRows,
        note: existing?.note || "",
        is_manual: false,
        price_is_manual: preserveManualPrice,
        sort_order: index + 1,
      };
    });

    for (let index = 0; index < rows.length; index += 150) {
      const { error } = await supabase
        .from("wholesale_inventory_items")
        .upsert(rows.slice(index, index + 150), { onConflict: "inventory_id,source_key" });
      if (error) throw error;
    }

    const staleIds = existingItems
      .filter((item) => !item.is_manual && item.source_key && !importedSourceKeys.has(item.source_key))
      .map((item) => item.id);
    for (let index = 0; index < staleIds.length; index += 300) {
      const { error } = await supabase
        .from("wholesale_inventory_items")
        .delete()
        .in("id", staleIds.slice(index, index + 300));
      if (error) throw error;
    }

    const needsReviewCount = rows.filter((row) => row.review_status === "needs_review").length;
    const { data: updatedInventory, error: updateError } = await supabase
      .from("wholesale_inventory_counts")
      .update({
        inventory_date: todayInJapan(),
        source_file_name: sanitizeFileName(file.name),
        source_row_count: result.sourceRowCount,
        matched_row_count: result.matchedRowCount,
        consolidated_item_count: rows.length,
        set_row_count: result.setRowCount,
        needs_review_count: needsReviewCount,
        master_import_id: masterImport.id,
        imported_at: new Date().toISOString(),
      })
      .eq("id", inventory.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      inventory: updatedInventory,
      items: await fetchInventoryItems(inventory.id),
      summary: {
        sourceRowCount: result.sourceRowCount,
        matchedRowCount: result.matchedRowCount,
        setRowCount: result.setRowCount,
        duplicateRowCount: result.duplicateRowCount,
        consolidatedItemCount: rows.length,
        needsReviewCount,
      },
    });
  } catch (error: any) {
    console.error("wholesale inventory import error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "助ネコ在庫CSVの読み込みに失敗しました" },
      { status: 500 },
    );
  }
}

async function findOrCreateInventory(request: Request, fiscalYear: number) {
  const { data: existing, error: existingError } = await supabase
    .from("wholesale_inventory_counts")
    .select("*")
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const token = await getToken({ req: request as any });
  const { data, error } = await supabase
    .from("wholesale_inventory_counts")
    .insert({
      fiscal_year: fiscalYear,
      inventory_date: todayInJapan(),
      status: "draft",
      created_by: String(token?.email || ""),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function fetchLatestMasterImport() {
  const { data, error } = await supabase
    .from("wholesale_sukeneko_master_imports")
    .select("id,file_name,row_count,set_item_count,imported_at")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchTitleMappings(): Promise<SukenekoTitleMapping[]> {
  const definitions = [
    ["amazon_product_mapping", "amazon_title", "Amazon"],
    ["rakuten_product_mapping", "rakuten_title", "楽天"],
    ["yahoo_product_mapping", "yahoo_title", "Yahoo"],
    ["qoo10_product_mapping", "qoo10_title", "Qoo10"],
    ["base_product_mapping", "base_title", "BASE"],
    ["mercari_product_mapping", "mercari_title", "メルカリShops"],
    ["tiktok_product_mapping", "tiktok_product_name", "TikTok"],
  ] as const;
  const groups = await Promise.all(definitions.map(
    async ([table, titleColumn, channel]) => {
      const rows = await fetchAll<Record<string, unknown>>(
        table,
        `${titleColumn},product_id`,
      );
      return rows.flatMap((row) => {
        const title = String(row[titleColumn] || "").trim();
        const productId = String(row.product_id || "").trim();
        return title && productId
          ? [{ channel, title, productId }]
          : [];
      });
    },
  ));
  return groups.flat();
}

async function fetchAll<T>(
  table: string,
  columns: string,
  refine?: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(from, from + 999);
    if (refine) query = refine(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchAllExistingItems(inventoryId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wholesale_inventory_items")
      .select("*")
      .eq("inventory_id", inventoryId)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchInventoryItems(inventoryId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wholesale_inventory_items")
      .select("*")
      .eq("inventory_id", inventoryId)
      .order("sort_order", { ascending: true })
      .order("product_name", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function sanitizeFileName(value: string) {
  return String(value || "sukeneko_inventory.csv")
    .replace(/[^\p{L}\p{N}._()（）\- ]/gu, "_")
    .slice(0, 255);
}

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
