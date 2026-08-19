export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import { normalizeBrandStoreTaxRate } from "@/lib/brand-store-tax";
import { brandStoreInventoryPrice } from "@/lib/brand-store-inventory-price";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const inventoryId = String(body.inventoryId || "").trim();
    const productName = normalizeProductName(body.productName);
    if (!inventoryId || !productName) {
      return NextResponse.json({ success: false, error: "棚卸し表と商品名は必須です" }, { status: 400 });
    }

    const { data: latest } = await supabase
      .from("brand_store_inventory_items")
      .select("sort_order")
      .eq("inventory_id", inventoryId)
      .order("sort_order", { ascending: true })
      .limit(1);
    const sellingPrice = nullableNonNegativeNumber(body.sellingPrice);
    if (sellingPrice === null) {
      return NextResponse.json({ success: false, error: "販売価格は必須です" }, { status: 400 });
    }
    const taxRate = normalizeBrandStoreTaxRate(body.taxRate) || 8;

    const { data, error } = await supabase
      .from("brand_store_inventory_items")
      .insert({
        inventory_id: inventoryId,
        source_key: null,
        source_product_id: null,
        product_name: productName,
        selling_price: sellingPrice,
        wholesale_price: brandStoreInventoryPrice(sellingPrice),
        tax_rate: taxRate,
        quantity: null,
        note: "",
        annual_quantity_sold: 0,
        last_sold_month: null,
        sort_order: Number(latest?.[0]?.sort_order || 0) - 1,
        is_manual: true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("brand store inventory item POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "商品の追加に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ success: false, error: "明細IDは必須です" }, { status: 400 });

    const { data: current, error: currentError } = await supabase
      .from("brand_store_inventory_items")
      .select("id,is_manual,selling_price")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;

    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "wholesalePrice")) {
      return NextResponse.json(
        { success: false, error: "棚卸単価は販売価格の70%で自動計算されます" },
        { status: 400 },
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "quantity")) {
      const value = nullableNonNegativeInteger(body.quantity);
      if (body.quantity !== null && body.quantity !== "" && value === null) {
        return NextResponse.json({ success: false, error: "個数は0以上の整数で入力してください" }, { status: 400 });
      }
      updates.quantity = value;
    }
    if (Object.prototype.hasOwnProperty.call(body, "taxRate")) {
      const value = normalizeBrandStoreTaxRate(body.taxRate);
      if (!value) {
        return NextResponse.json({ success: false, error: "税率は8%または10%を選択してください" }, { status: 400 });
      }
      updates.tax_rate = value;
    }
    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      updates.note = String(body.note || "").slice(0, 1000);
    }
    if (current.is_manual && Object.prototype.hasOwnProperty.call(body, "productName")) {
      const productName = normalizeProductName(body.productName);
      if (!productName) return NextResponse.json({ success: false, error: "商品名は必須です" }, { status: 400 });
      updates.product_name = productName;
    }
    if (current.is_manual && Object.prototype.hasOwnProperty.call(body, "sellingPrice")) {
      const value = nullableNonNegativeNumber(body.sellingPrice);
      if (body.sellingPrice !== null && body.sellingPrice !== "" && value === null) {
        return NextResponse.json({ success: false, error: "販売価格を正しく入力してください" }, { status: 400 });
      }
      updates.selling_price = value;
      updates.wholesale_price = brandStoreInventoryPrice(value);
    }
    if (!Object.keys(updates).length) {
      return NextResponse.json({ success: false, error: "更新内容がありません" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("brand_store_inventory_items")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("brand store inventory item PATCH error:", error);
    return NextResponse.json({ success: false, error: error.message || "入力内容の保存に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ success: false, error: "明細IDは必須です" }, { status: 400 });

    const { error } = await supabase
      .from("brand_store_inventory_items")
      .delete()
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("brand store inventory item DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message || "商品の削除に失敗しました" }, { status: 500 });
  }
}

function normalizeProductName(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

function nullableNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
