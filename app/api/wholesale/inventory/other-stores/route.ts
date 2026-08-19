export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

import {
  currentInventoryFiscalYear,
  normalizeInventoryFiscalYear,
} from "@/lib/inventory-fiscal";
import {
  buildWholesalePartnerInventory,
  isRegularWholesaleProduct,
  type WholesaleProductSource,
  type WholesaleSaleSource,
} from "@/lib/wholesale-partner-inventory";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const token = await authorizedToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const requestedId = String(url.searchParams.get("id") || "").trim();
    const requestedFiscalYear = normalizeInventoryFiscalYear(url.searchParams.get("fiscalYear"));
    const { data: histories, error: historiesError } = await supabase
      .from("wholesale_partner_inventory_counts")
      .select("*")
      .order("fiscal_year", { ascending: false })
      .limit(50);
    if (historiesError) throw historiesError;

    const inventory = requestedId
      ? (histories || []).find((row) => row.id === requestedId)
      : requestedFiscalYear
        ? (histories || []).find((row) => row.fiscal_year === requestedFiscalYear)
        : histories?.[0];

    if (!inventory) {
      return NextResponse.json({
        success: true,
        inventory: null,
        items: [],
        histories: histories || [],
      });
    }

    return NextResponse.json({
      success: true,
      inventory,
      items: await fetchInventoryItems(inventory.id),
      histories: histories || [],
    });
  } catch (error: any) {
    console.error("wholesale partner inventory GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "他社分の決算棚卸し取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = await authorizedToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action !== "create" && action !== "refresh") {
      return NextResponse.json({ success: false, error: "操作が不正です" }, { status: 400 });
    }

    const fiscalYear = normalizeInventoryFiscalYear(body.fiscalYear)
      || currentInventoryFiscalYear();
    const { data: existing, error: existingError } = await supabase
      .from("wholesale_partner_inventory_counts")
      .select("*")
      .eq("fiscal_year", fiscalYear)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing && action === "create") {
      return NextResponse.json({
        success: true,
        existing: true,
        inventory: existing,
        items: await fetchInventoryItems(existing.id),
      });
    }

    const sourceMonth = `${fiscalYear}-07-01`;
    const sourceEnd = `${fiscalYear}-07-31`;
    const [products, sales] = await Promise.all([
      fetchAllRows<WholesaleProductSource>(
        "wholesale_products",
        "id, product_code, product_name, product_type",
      ),
      fetchJulySales(sourceMonth, sourceEnd),
    ]);
    const regularProductIds = new Set(
      products.filter(isRegularWholesaleProduct).map((product) => product.id),
    );
    const eligibleSales = sales.filter((sale) => regularProductIds.has(sale.product_id));
    const items = buildWholesalePartnerInventory(products, eligibleSales);
    const sourceTotalQuantity = items.reduce((sum, item) => sum + item.sold_quantity, 0);
    const sourceTotalAmount = items.reduce((sum, item) => sum + item.sales_amount, 0);

    const { data: inventoryId, error: replaceError } = await supabase.rpc(
      "replace_wholesale_partner_inventory",
      {
        p_fiscal_year: fiscalYear,
        p_inventory_date: sourceEnd,
        p_source_month: sourceMonth,
        p_source_sale_row_count: eligibleSales.length,
        p_source_product_count: items.length,
        p_source_total_quantity: sourceTotalQuantity,
        p_source_total_amount: sourceTotalAmount,
        p_created_by: String(token.email || ""),
        p_items: items,
      },
    );
    if (replaceError) throw replaceError;

    const { data: inventory, error: inventoryError } = await supabase
      .from("wholesale_partner_inventory_counts")
      .select("*")
      .eq("id", inventoryId)
      .single();
    if (inventoryError) throw inventoryError;

    return NextResponse.json({
      success: true,
      existing: Boolean(existing),
      refreshed: Boolean(existing),
      inventory,
      items: await fetchInventoryItems(inventory.id),
    });
  } catch (error: any) {
    console.error("wholesale partner inventory POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "他社分の決算棚卸し作成に失敗しました" },
      { status: 500 },
    );
  }
}

async function fetchJulySales(start: string, end: string) {
  const rows: WholesaleSaleSource[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wholesale_sales")
      .select("product_id, quantity, unit_price, amount")
      .gte("sale_date", start)
      .lte("sale_date", end)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as WholesaleSaleSource[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchAllRows<T>(table: string, select: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchInventoryItems(inventoryId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wholesale_partner_inventory_items")
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

async function authorizedToken(request: Request) {
  const token = await getToken({ req: request as any });
  return token?.email === "aizubrandhall@gmail.com" ? token : null;
}
