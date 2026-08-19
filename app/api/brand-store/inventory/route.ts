export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import {
  inventoryFiscalRange,
  inventoryFiscalYearFromDate,
  normalizeInventoryFiscalYear,
} from "@/lib/inventory-fiscal";
import {
  inferBrandStoreTaxRate,
  normalizeBrandStoreTaxRate,
} from "@/lib/brand-store-tax";
import { brandStoreInventoryPrice } from "@/lib/brand-store-inventory-price";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

type SalesRow = {
  id: string;
  product_id: number | null;
  product_name: string;
  product_code: string | null;
  barcode: string | null;
  category: string | null;
  report_month: string;
  total_sales: number | null;
  quantity_sold: number | null;
};

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const requestedId = url.searchParams.get("id");
    const requestedFiscalYear = normalizeInventoryFiscalYear(url.searchParams.get("fiscalYear"));
    const { data: histories, error: historiesError } = await supabase
      .from("brand_store_inventory_counts")
      .select("*")
      .order("fiscal_year", { ascending: false })
      .order("inventory_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (historiesError) throw historiesError;

    const inventory = requestedId
      ? (histories || []).find((row) => row.id === requestedId)
      : requestedFiscalYear
        ? (histories || []).find((row) => row.fiscal_year === requestedFiscalYear)
        : histories?.[0];
    if (!inventory) {
      return NextResponse.json({ success: true, inventory: null, items: [], histories: histories || [] });
    }

    const items = await fetchInventoryItems(inventory.id);
    return NextResponse.json({ success: true, inventory, items, histories: histories || [] });
  } catch (error: any) {
    console.error("brand store inventory GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "棚卸し表の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let createdInventoryId: string | null = null;
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => ({}));
    if (body.action !== "generate") {
      return NextResponse.json({ success: false, error: "操作が不正です" }, { status: 400 });
    }

    const inventoryDate = normalizeDate(body.inventoryDate) || todayInJapan();
    const fiscalYear = normalizeInventoryFiscalYear(body.fiscalYear)
      || inventoryFiscalYearFromDate(inventoryDate);
    const { data: existing, error: existingError } = await supabase
      .from("brand_store_inventory_counts")
      .select("*")
      .eq("fiscal_year", fiscalYear)
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.[0]) {
      return NextResponse.json({
        success: true,
        existing: true,
        inventory: existing[0],
        items: await fetchInventoryItems(existing[0].id),
        generatedCount: 0,
      });
    }

    const { startMonth: sourceStartMonth, endMonth: sourceEndMonth } = inventoryFiscalRange(fiscalYear);
    const salesRows = await fetchAllSales(sourceStartMonth, sourceEndMonth);
    if (!salesRows.length) {
      return NextResponse.json({ success: false, error: `${fiscalYear}年度の販売実績がありません` }, { status: 400 });
    }
    const productMaster = await fetchAllProductMaster();
    const priceByProductId = new Map<string, number>();
    const priceByBarcode = new Map<string, number>();
    const taxByProductId = new Map<string, 8 | 10>();
    const taxByBarcode = new Map<string, 8 | 10>();
    for (const product of productMaster) {
      const price = toNullableNumber(product.price);
      if (product.product_id !== null && product.product_id !== undefined) {
        if (price !== null && price >= 0) priceByProductId.set(String(product.product_id), price);
        const taxRate = normalizeBrandStoreTaxRate(product.tax_rate);
        if (taxRate) taxByProductId.set(String(product.product_id), taxRate);
      }
      const barcode = normalizeCode(product.barcode);
      if (barcode) {
        if (price !== null && price >= 0) priceByBarcode.set(barcode, price);
        const taxRate = normalizeBrandStoreTaxRate(product.tax_rate);
        if (taxRate) taxByBarcode.set(barcode, taxRate);
      }
    }

    const grouped = new Map<string, {
      latest: SalesRow;
      annualQuantity: number;
      highestObservedUnitPrice: number | null;
    }>();
    for (const row of salesRows) {
      const quantity = Math.max(0, Number(row.quantity_sold) || 0);
      if (!quantity) continue;
      const key = buildSourceKey(row);
      // 売上金額には値引きが含まれるため、マスター未登録時は最新月の
      // 平均単価ではなく、期間内で最も高い観測単価を定価の代替値とする。
      const observedUnitPrice = Math.round((Number(row.total_sales) || 0) / quantity);
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, {
          latest: row,
          annualQuantity: quantity,
          highestObservedUnitPrice: observedUnitPrice >= 0 ? observedUnitPrice : null,
        });
      } else {
        current.annualQuantity += quantity;
        if (observedUnitPrice >= 0) {
          current.highestObservedUnitPrice = current.highestObservedUnitPrice === null
            ? observedUnitPrice
            : Math.max(current.highestObservedUnitPrice, observedUnitPrice);
        }
      }
    }

    const token = await getToken({ req: request as any });
    const { data: inventory, error: inventoryError } = await supabase
      .from("brand_store_inventory_counts")
      .insert({
        inventory_date: inventoryDate,
        fiscal_year: fiscalYear,
        source_start_month: sourceStartMonth,
        source_end_month: sourceEndMonth,
        status: "draft",
        created_by: String(token?.email || ""),
      })
      .select("*")
      .single();
    if (inventoryError) throw inventoryError;
    createdInventoryId = inventory.id;

    const items = Array.from(grouped.entries())
      .map(([sourceKey, value]) => {
        const latest = value.latest;
        const masterPrice = latest.product_id === null ? undefined : priceByProductId.get(String(latest.product_id));
        const normalizedBarcode = normalizeCode(latest.barcode);
        const barcodePrice = priceByBarcode.get(normalizedBarcode);
        const masterTaxRate = latest.product_id === null
          ? undefined
          : taxByProductId.get(String(latest.product_id));
        const taxRate = masterTaxRate
          ?? taxByBarcode.get(normalizedBarcode)
          ?? inferBrandStoreTaxRate(latest.product_name, latest.category);
        const sellingPrice = masterPrice ?? barcodePrice ?? value.highestObservedUnitPrice;
        return {
          inventory_id: inventory.id,
          source_key: sourceKey,
          source_product_id: latest.product_id,
          product_name: String(latest.product_name || "").trim() || "商品名未設定",
          selling_price: sellingPrice,
          wholesale_price: brandStoreInventoryPrice(sellingPrice),
          tax_rate: taxRate,
          quantity: null,
          note: "",
          annual_quantity_sold: value.annualQuantity,
          last_sold_month: latest.report_month,
          sort_order: 0,
          is_manual: false,
        };
      })
      .sort((a, b) => a.tax_rate - b.tax_rate || a.product_name.localeCompare(b.product_name, "ja"))
      .map((item, index) => ({ ...item, sort_order: index + 1 }));

    for (let index = 0; index < items.length; index += 300) {
      const { error } = await supabase.from("brand_store_inventory_items").insert(items.slice(index, index + 300));
      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      inventory,
      items: await fetchInventoryItems(inventory.id),
      generatedCount: items.length,
    });
  } catch (error: any) {
    if (createdInventoryId) {
      await supabase.from("brand_store_inventory_counts").delete().eq("id", createdInventoryId);
    }
    console.error("brand store inventory POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "棚卸し表の作成に失敗しました" }, { status: 500 });
  }
}

async function fetchInventoryItems(inventoryId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("brand_store_inventory_items")
      .select("*")
      .eq("inventory_id", inventoryId)
      .order("tax_rate", { ascending: true })
      .order("sort_order", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchAllSales(startMonth: string, endMonth: string): Promise<SalesRow[]> {
  const rows: SalesRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("brand_store_sales")
      .select("id,product_id,product_name,product_code,barcode,category,report_month,total_sales,quantity_sold")
      .gte("report_month", startMonth)
      .lte("report_month", endMonth)
      .gt("quantity_sold", 0)
      .order("report_month", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as SalesRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchAllProductMaster() {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("product_master")
      .select("id,product_id,price,barcode,tax_rate")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function buildSourceKey(row: SalesRow) {
  if (row.product_id !== null && row.product_id !== undefined) return `product:${row.product_id}`;
  const productCode = normalizeCode(row.product_code);
  if (productCode) return `code:${productCode}`;
  const barcode = normalizeCode(row.barcode);
  if (barcode) return `barcode:${barcode}`;
  return `name:${String(row.product_name || "").normalize("NFKC").trim().toLocaleLowerCase("ja-JP")}`;
}

function normalizeCode(value: unknown) {
  return String(value || "").replace(/^#/, "").trim();
}

function normalizeDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
