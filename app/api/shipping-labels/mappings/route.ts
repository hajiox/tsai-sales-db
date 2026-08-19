export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

import type { ConversionTableRow, DeliveryPattern } from "@/lib/shipping-labels";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const deliveryPatterns: DeliveryPattern[] = ["通常", "冷凍", "冷蔵", "ネコポス", "未設定"];

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const { data, error } = await supabase
      .from("shipping_label_mappings")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("sku", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, mappings: (data || []).map(fromDbRow) });
  } catch (error: any) {
    console.error("shipping label mappings GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "変換表の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();

    if (Array.isArray(body.mappings)) {
      const rows = deduplicateMappings(body.mappings);
      if (!rows.length) {
        return NextResponse.json({ success: false, error: "登録できる商品コードがありません" }, { status: 400 });
      }

      const saved = [];
      for (const [index, mapping] of rows.entries()) {
        saved.push(await persistMapping(mapping, index));
      }
      return NextResponse.json({ success: true, mappings: saved.map(fromDbRow), count: saved.length });
    }

    if (!hasChannelCode(body)) {
      return NextResponse.json({ success: false, error: "Amazon SKUまたはYahoo商品コードは必須です" }, { status: 400 });
    }
    const data = await persistMapping(body);
    return NextResponse.json({ success: true, mapping: fromDbRow(data) });
  } catch (error: any) {
    console.error("shipping label mappings POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "変換表の登録に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "IDは必須です" }, { status: 400 });
    }

    const row = toDbRow(body);
    if (!row.sku && !row.yahoo_item_id) {
      return NextResponse.json({ success: false, error: "Amazon SKUまたはYahoo商品コードは必須です" }, { status: 400 });
    }
    delete (row as any).id;
    delete (row as any).created_at;

    const { data, error } = await supabase
      .from("shipping_label_mappings")
      .update(row)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, mapping: fromDbRow(data) });
  } catch (error: any) {
    console.error("shipping label mappings PUT error:", error);
    return NextResponse.json({ success: false, error: error.message || "変換表の更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
    if (!ids.length) {
      return NextResponse.json({ success: false, error: "削除対象がありません" }, { status: 400 });
    }

    const { error } = await supabase
      .from("shipping_label_mappings")
      .delete()
      .in("id", ids);
    if (error) throw error;

    return NextResponse.json({ success: true, deletedCount: ids.length });
  } catch (error: any) {
    console.error("shipping label mappings DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message || "変換表の削除に失敗しました" }, { status: 500 });
  }
}

function fromDbRow(row: any): ConversionTableRow {
  return {
    id: row.id,
    amazonName: row.amazon_name || "",
    sku: row.sku || "",
    yahooName: row.yahoo_name || "",
    yahooItemId: row.yahoo_item_id || "",
    labelName: row.label_name || "",
    amazonPattern: row.amazon_pattern || "",
    deliveryPattern: normalizePattern(row.delivery_pattern),
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function toDbRow(row: Partial<ConversionTableRow>, index = 0) {
  return {
    sku: nullableText(row.sku),
    amazon_name: String(row.amazonName || "").trim(),
    yahoo_item_id: nullableText(row.yahooItemId),
    yahoo_name: String(row.yahooName || "").trim(),
    label_name: String(row.labelName || "").trim(),
    amazon_pattern: String(row.amazonPattern || "").trim(),
    delivery_pattern: normalizePattern(row.deliveryPattern),
    sort_order: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
  };
}

function hasChannelCode(row: Partial<ConversionTableRow>) {
  return Boolean(nullableText(row.sku) || nullableText(row.yahooItemId));
}

function nullableText(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function deduplicateMappings(rows: ConversionTableRow[]): ConversionTableRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.id || (row.sku ? `amazon:${row.sku.trim()}` : `yahoo:${row.yahooItemId?.trim() || ""}`);
    if (!hasChannelCode(row) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function persistMapping(mapping: Partial<ConversionTableRow>, index = 0) {
  const row = toDbRow(mapping, index);
  if (!row.sku && !row.yahoo_item_id) throw new Error("商品コードがありません");

  const matchedIds = new Set<string>();
  if (mapping.id) matchedIds.add(mapping.id);

  for (const [column, value] of [["sku", row.sku], ["yahoo_item_id", row.yahoo_item_id]] as const) {
    if (!value) continue;
    const { data, error } = await supabase
      .from("shipping_label_mappings")
      .select("id")
      .eq(column, value)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) matchedIds.add(data.id);
  }

  if (matchedIds.size > 1) {
    throw new Error("Amazon SKUとYahoo商品コードが別々の商品に登録されています。変換表を確認してください");
  }

  const existingId = Array.from(matchedIds)[0];
  const query = existingId
    ? supabase.from("shipping_label_mappings").update(row).eq("id", existingId)
    : supabase.from("shipping_label_mappings").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

function normalizePattern(value: unknown): DeliveryPattern {
  const pattern = String(value || "").trim() as DeliveryPattern;
  return deliveryPatterns.includes(pattern) ? pattern : "未設定";
}
