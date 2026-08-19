export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

import {
  currentInventoryFiscalYear,
  normalizeInventoryFiscalYear,
} from "@/lib/inventory-fiscal";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const requestedId = String(url.searchParams.get("id") || "").trim();
    const requestedFiscalYear = normalizeInventoryFiscalYear(url.searchParams.get("fiscalYear"));
    const { data: histories, error: historiesError } = await supabase
      .from("wholesale_inventory_counts")
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
    console.error("wholesale inventory GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "卸決算棚卸しの取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => ({}));
    if (body.action !== "create") {
      return NextResponse.json({ success: false, error: "操作が不正です" }, { status: 400 });
    }

    const fiscalYear = normalizeInventoryFiscalYear(body.fiscalYear)
      || currentInventoryFiscalYear();
    const { data: existing, error: existingError } = await supabase
      .from("wholesale_inventory_counts")
      .select("*")
      .eq("fiscal_year", fiscalYear)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return NextResponse.json({
        success: true,
        existing: true,
        inventory: existing,
        items: await fetchInventoryItems(existing.id),
      });
    }

    const token = await getToken({ req: request as any });
    const { data: inventory, error } = await supabase
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

    return NextResponse.json({
      success: true,
      existing: false,
      inventory,
      items: [],
    });
  } catch (error: any) {
    console.error("wholesale inventory POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "卸決算棚卸しの作成に失敗しました" },
      { status: 500 },
    );
  }
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
