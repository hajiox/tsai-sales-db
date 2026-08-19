export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

import {
  normalizeWholesaleInventoryTaxRate,
  wholesaleInventoryPrice,
} from "@/lib/wholesale-inventory-price";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const inventoryId = String(body.inventoryId || "").trim();
    const productName = normalizeProductName(body.productName);
    const retailPrice = nullableNonNegativeNumber(body.retailPrice);
    if (!inventoryId || !productName) {
      return NextResponse.json(
        { success: false, error: "棚卸し表と商品名は必須です" },
        { status: 400 },
      );
    }
    if (retailPrice === null) {
      return NextResponse.json(
        { success: false, error: "販売価格（税別）は必須です" },
        { status: 400 },
      );
    }
    const taxRate = normalizeWholesaleInventoryTaxRate(body.taxRate);
    const quantity = nullableNonNegativeNumber(body.quantity);

    const { data: firstItem, error: orderError } = await supabase
      .from("wholesale_inventory_items")
      .select("sort_order")
      .eq("inventory_id", inventoryId)
      .order("sort_order", { ascending: true })
      .limit(1);
    if (orderError) throw orderError;

    const { data, error } = await supabase
      .from("wholesale_inventory_items")
      .insert({
        inventory_id: inventoryId,
        source_key: null,
        source_recipe_id: null,
        source_web_product_id: null,
        product_name: productName,
        retail_price_excl_tax: retailPrice,
        wholesale_price: wholesaleInventoryPrice(retailPrice, taxRate),
        tax_rate: taxRate,
        quantity,
        price_source: "手動登録",
        calculation_method: "manual",
        review_status: "confirmed",
        review_reason: "",
        source_rows: [],
        note: String(body.note || "").slice(0, 1000),
        is_manual: true,
        price_is_manual: true,
        sort_order: Number(firstItem?.[0]?.sort_order || 0) - 1,
      })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("wholesale inventory item POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "商品の追加に失敗しました" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "明細IDは必須です" }, { status: 400 });
    }

    const { data: current, error: currentError } = await supabase
      .from("wholesale_inventory_items")
      .select("*")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;

    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "productName")) {
      const productName = normalizeProductName(body.productName);
      if (!productName) {
        return NextResponse.json({ success: false, error: "商品名は必須です" }, { status: 400 });
      }
      updates.product_name = productName;
    }
    if (Object.prototype.hasOwnProperty.call(body, "quantity")) {
      const quantity = nullableNonNegativeNumber(body.quantity);
      if (body.quantity !== null && body.quantity !== "" && quantity === null) {
        return NextResponse.json(
          { success: false, error: "在庫数は0以上で入力してください" },
          { status: 400 },
        );
      }
      updates.quantity = quantity;
    }
    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      updates.note = String(body.note || "").slice(0, 1000);
    }
    if (Object.prototype.hasOwnProperty.call(body, "reviewStatus")) {
      const reviewStatus = String(body.reviewStatus || "");
      if (!["confirmed", "needs_review", "excluded"].includes(reviewStatus)) {
        return NextResponse.json({ success: false, error: "確認状態が不正です" }, { status: 400 });
      }
      updates.review_status = reviewStatus;
    }

    const nextTaxRate = Object.prototype.hasOwnProperty.call(body, "taxRate")
      ? normalizeWholesaleInventoryTaxRate(body.taxRate)
      : normalizeWholesaleInventoryTaxRate(current.tax_rate);
    if (Object.prototype.hasOwnProperty.call(body, "taxRate")) {
      updates.tax_rate = nextTaxRate;
    }
    if (Object.prototype.hasOwnProperty.call(body, "retailPrice")) {
      const retailPrice = nullableNonNegativeNumber(body.retailPrice);
      if (retailPrice === null) {
        return NextResponse.json(
          { success: false, error: "販売価格（税別）を正しく入力してください" },
          { status: 400 },
        );
      }
      updates.retail_price_excl_tax = retailPrice;
      updates.wholesale_price = wholesaleInventoryPrice(retailPrice, nextTaxRate);
      updates.price_source = "手動修正";
      updates.price_is_manual = true;
    } else if (Object.prototype.hasOwnProperty.call(body, "taxRate")) {
      updates.wholesale_price = wholesaleInventoryPrice(current.retail_price_excl_tax, nextTaxRate);
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ success: false, error: "更新内容がありません" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("wholesale_inventory_items")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("wholesale inventory item PATCH error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "棚卸し明細の保存に失敗しました" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "明細IDは必須です" }, { status: 400 });
    }

    const { error } = await supabase
      .from("wholesale_inventory_items")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("wholesale inventory item DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "商品の削除に失敗しました" },
      { status: 500 },
    );
  }
}

function normalizeProductName(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.round(number * 1000) / 1000
    : null;
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
