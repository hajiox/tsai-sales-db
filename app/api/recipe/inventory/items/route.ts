export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const inventoryId = String(body.inventoryId || "").trim();
    const itemName = normalizeName(body.itemName);
    const itemType = body.itemType === "material" ? "material" : "ingredient";
    if (!inventoryId || !itemName) {
      return NextResponse.json({ success: false, error: "棚卸し表と品名は必須です" }, { status: 400 });
    }

    const unitQuantity = nullablePositiveNumber(body.unitQuantity);
    const taxIncludedCost = nullableNonNegativeNumber(body.taxIncludedCost);
    if (body.unitQuantity !== null && body.unitQuantity !== "" && unitQuantity === null) {
      return NextResponse.json({ success: false, error: "入数は0より大きい数値で入力してください" }, { status: 400 });
    }
    if (body.taxIncludedCost !== null && body.taxIncludedCost !== "" && taxIncludedCost === null) {
      return NextResponse.json({ success: false, error: "税込原価を正しく入力してください" }, { status: 400 });
    }

    const { data: latest, error: latestError } = await supabase
      .from("manufacturing_inventory_items")
      .select("sort_order")
      .eq("inventory_id", inventoryId)
      .order("sort_order", { ascending: true })
      .limit(1);
    if (latestError) throw latestError;

    const { data, error } = await supabase
      .from("manufacturing_inventory_items")
      .insert({
        inventory_id: inventoryId,
        item_type: itemType,
        source_id: null,
        item_name: itemName,
        source_unit_text: unitQuantity === null ? null : String(unitQuantity),
        base_unit_quantity: unitQuantity,
        unit_quantity: unitQuantity,
        base_tax_included_cost: taxIncludedCost,
        tax_included_cost: taxIncludedCost,
        stock_count: null,
        note: "",
        sort_order: Number(latest?.[0]?.sort_order || 0) - 1,
        is_manual: true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("manufacturing inventory item POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "品目の追加に失敗しました" }, { status: 500 });
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
      .from("manufacturing_inventory_items")
      .select("*")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;

    const updates: Record<string, unknown> = {};
    let effectiveUnitQuantity = toNullableNumber(current.unit_quantity);
    if (Object.prototype.hasOwnProperty.call(body, "unitQuantity")) {
      const value = nullablePositiveNumber(body.unitQuantity);
      if (body.unitQuantity !== null && body.unitQuantity !== "" && value === null) {
        return NextResponse.json({ success: false, error: "入数は0より大きい数値で入力してください" }, { status: 400 });
      }
      updates.unit_quantity = value;
      effectiveUnitQuantity = value;
      const baseQuantity = toNullableNumber(current.base_unit_quantity);
      const baseCost = toNullableNumber(current.base_tax_included_cost);
      if (value !== null && baseQuantity !== null && baseQuantity > 0 && baseCost !== null) {
        updates.tax_included_cost = roundCost(baseCost * value / baseQuantity);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "taxIncludedCost")) {
      const value = nullableNonNegativeNumber(body.taxIncludedCost);
      if (body.taxIncludedCost !== null && body.taxIncludedCost !== "" && value === null) {
        return NextResponse.json({ success: false, error: "税込原価を正しく入力してください" }, { status: 400 });
      }
      updates.tax_included_cost = value;
      updates.base_tax_included_cost = value;
      if (value !== null && effectiveUnitQuantity !== null) updates.base_unit_quantity = effectiveUnitQuantity;
    }
    if (Object.prototype.hasOwnProperty.call(body, "stockCount")) {
      const value = nullableNonNegativeNumber(body.stockCount);
      if (body.stockCount !== null && body.stockCount !== "" && value === null) {
        return NextResponse.json({ success: false, error: "個数は0以上の数値で入力してください" }, { status: 400 });
      }
      updates.stock_count = value;
    }
    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      updates.note = String(body.note || "").slice(0, 1000);
    }
    if (current.is_manual && Object.prototype.hasOwnProperty.call(body, "itemName")) {
      const itemName = normalizeName(body.itemName);
      if (!itemName) return NextResponse.json({ success: false, error: "品名は必須です" }, { status: 400 });
      updates.item_name = itemName;
    }
    if (!Object.keys(updates).length) {
      return NextResponse.json({ success: false, error: "更新内容がありません" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("manufacturing_inventory_items")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("manufacturing inventory item PATCH error:", error);
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
      .from("manufacturing_inventory_items")
      .delete()
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("manufacturing inventory item DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message || "品目の削除に失敗しました" }, { status: 500 });
  }
}

function normalizeName(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function nullablePositiveNumber(value: unknown): number | null {
  const number = nullableNonNegativeNumber(value);
  return number !== null && number > 0 ? number : null;
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundCost(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
