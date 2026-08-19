import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const asNumber = (value: unknown) => Number(value || 0);

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data, error } = await supabase
      .from("dining_items")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return NextResponse.json({
      items: (data || []).map((item) => ({
        ...item,
        purchase_quantity: asNumber(item.purchase_quantity),
        yield_quantity: asNumber(item.yield_quantity),
        price_incl_tax: asNumber(item.price_incl_tax),
        unit_cost: asNumber(item.yield_quantity) > 0
          ? asNumber(item.price_incl_tax) / asNumber(item.yield_quantity)
          : 0,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "名称を入力してください" }, { status: 400 });
    const { data, error } = await supabase
      .from("dining_items")
      .insert({
        name,
        item_type: body.item_type === "material" ? "material" : "food",
        purchase_quantity: asNumber(body.purchase_quantity) || 1,
        yield_quantity: asNumber(body.yield_quantity) || 1,
        price_incl_tax: asNumber(body.price_incl_tax),
        unit: body.unit || "g",
        notes: body.notes || null,
        source_file: body.source_file || null,
        source_sheet: body.source_sheet || null,
        source_reference: body.source_reference || null,
        sort_order: asNumber(body.sort_order),
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const allowed = [
      "name", "item_type", "purchase_quantity", "yield_quantity", "price_incl_tax",
      "unit", "notes", "source_file", "source_sheet", "source_reference", "sort_order",
    ];
    const updates = Object.fromEntries(allowed.filter((key) => key in body.data).map((key) => [key, body.data[key]]));
    const { error } = await supabase.from("dining_items").update(updates).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const { error } = await supabase.from("dining_items").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = error.code === "23503"
      ? "使用中の食材・資材は削除できません"
      : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
