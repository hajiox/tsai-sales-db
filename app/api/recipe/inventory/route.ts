export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import {
  inventoryFiscalYearFromDate,
  normalizeInventoryFiscalYear,
} from "@/lib/inventory-fiscal";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

type MasterRow = {
  id: string;
  name: string;
  unit_quantity: number | string | null;
  price: number | string | null;
  tax_included: boolean | null;
};

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const requestedId = url.searchParams.get("id");
    const requestedFiscalYear = normalizeInventoryFiscalYear(url.searchParams.get("fiscalYear"));
    const { data: histories, error: historiesError } = await supabase
      .from("manufacturing_inventory_counts")
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

    return NextResponse.json({
      success: true,
      inventory,
      items: await fetchInventoryItems(inventory.id),
      histories: histories || [],
    });
  } catch (error: any) {
    console.error("manufacturing inventory GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "製造棚卸し表の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let createdInventoryId: string | null = null;
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => ({}));
    if (body.action === "sync") {
      return await syncLatestInventory(String(body.inventoryId || "").trim());
    }
    if (body.action !== "generate") {
      return NextResponse.json({ success: false, error: "操作が不正です" }, { status: 400 });
    }

    const inventoryDate = normalizeDate(body.inventoryDate) || todayInJapan();
    const fiscalYear = normalizeInventoryFiscalYear(body.fiscalYear)
      || inventoryFiscalYearFromDate(inventoryDate);
    const { data: existing, error: existingError } = await supabase
      .from("manufacturing_inventory_counts")
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

    const [ingredients, materials] = await Promise.all([
      fetchAllMasterRows("ingredients"),
      fetchAllMasterRows("materials"),
    ]);
    const token = await getToken({ req: request as any });
    const { data: inventory, error: inventoryError } = await supabase
      .from("manufacturing_inventory_counts")
      .insert({
        inventory_date: inventoryDate,
        fiscal_year: fiscalYear,
        status: "draft",
        created_by: String(token?.email || ""),
      })
      .select("*")
      .single();
    if (inventoryError) throw inventoryError;
    createdInventoryId = inventory.id;

    const ingredientItems = buildInventoryItems(inventory.id, "ingredient", ingredients, 0);
    const materialItems = buildInventoryItems(inventory.id, "material", materials, ingredientItems.length);
    const items = [...ingredientItems, ...materialItems];

    for (let index = 0; index < items.length; index += 300) {
      const { error } = await supabase.from("manufacturing_inventory_items").insert(items.slice(index, index + 300));
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
      await supabase.from("manufacturing_inventory_counts").delete().eq("id", createdInventoryId);
    }
    console.error("manufacturing inventory POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "製造棚卸し表の作成に失敗しました" }, { status: 500 });
  }
}

function buildInventoryItems(inventoryId: string, itemType: "ingredient" | "material", rows: MasterRow[], offset: number) {
  return rows
    .map((row) => {
      const master = getMasterValues(row, itemType);
      return {
        inventory_id: inventoryId,
        item_type: itemType,
        source_id: row.id,
        item_name: String(row.name || "").trim() || "名称未設定",
        source_unit_text: master.sourceUnitText,
        source_unit_quantity: master.unitQuantity,
        source_tax_included_cost: master.taxIncludedCost,
        base_unit_quantity: master.unitQuantity,
        unit_quantity: master.unitQuantity,
        base_tax_included_cost: master.taxIncludedCost,
        tax_included_cost: master.taxIncludedCost,
        stock_count: null,
        note: "",
        sort_order: 0,
        is_manual: false,
      };
    })
    .sort((a, b) => a.item_name.localeCompare(b.item_name, "ja"))
    .map((item, index) => ({ ...item, sort_order: offset + index + 1 }));
}

async function syncLatestInventory(inventoryId: string) {
  if (!inventoryId) {
    return NextResponse.json({ success: false, error: "棚卸し表IDは必須です" }, { status: 400 });
  }

  const { data: latest, error: latestError } = await supabase
    .from("manufacturing_inventory_counts")
    .select("id")
    .order("fiscal_year", { ascending: false })
    .order("inventory_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latest || latest.id !== inventoryId) {
    return NextResponse.json({ success: false, error: "過去の棚卸し履歴は材料DBと同期できません" }, { status: 409 });
  }

  const [items, ingredients, materials] = await Promise.all([
    fetchInventoryItems(inventoryId),
    fetchAllMasterRows("ingredients"),
    fetchAllMasterRows("materials"),
  ]);
  const ingredientMap = new Map(ingredients.map((row) => [row.id, row]));
  const materialMap = new Map(materials.map((row) => [row.id, row]));
  const changes: Array<{ id: string; updates: Record<string, unknown> }> = [];

  for (const item of items) {
    if (!item.source_id || item.is_manual) continue;
    const itemType = item.item_type === "material" ? "material" : "ingredient";
    const masterRow = itemType === "material"
      ? materialMap.get(item.source_id)
      : ingredientMap.get(item.source_id);
    if (!masterRow) continue;

    const master = getMasterValues(masterRow, itemType);
    const sourceValueChanged = !sameNullableNumber(item.source_unit_quantity, master.unitQuantity)
      || !sameNullableNumber(item.source_tax_included_cost, master.taxIncludedCost);
    const updates: Record<string, unknown> = {};
    const masterName = String(masterRow.name || "").trim() || "名称未設定";
    if (item.item_name !== masterName) updates.item_name = masterName;
    if ((item.source_unit_text || null) !== master.sourceUnitText) updates.source_unit_text = master.sourceUnitText;

    if (sourceValueChanged) {
      updates.source_unit_quantity = master.unitQuantity;
      updates.source_tax_included_cost = master.taxIncludedCost;
      updates.base_unit_quantity = master.unitQuantity;
      updates.unit_quantity = master.unitQuantity;
      updates.base_tax_included_cost = master.taxIncludedCost;
      updates.tax_included_cost = master.taxIncludedCost;
    }
    if (Object.keys(updates).length) changes.push({ id: item.id, updates });
  }

  for (let index = 0; index < changes.length; index += 25) {
    const results = await Promise.all(changes.slice(index, index + 25).map((change) => (
      supabase.from("manufacturing_inventory_items").update(change.updates).eq("id", change.id)
    )));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
  }

  return NextResponse.json({
    success: true,
    updatedCount: changes.length,
    items: await fetchInventoryItems(inventoryId),
  });
}

function getMasterValues(row: MasterRow, itemType: "ingredient" | "material") {
  const taxRate = itemType === "ingredient" ? 0.08 : 0.1;
  const rawPrice = toNullableNumber(row.price);
  return {
    sourceUnitText: row.unit_quantity === null ? null : String(row.unit_quantity).trim() || null,
    unitQuantity: parseUnitQuantity(row.unit_quantity),
    taxIncludedCost: rawPrice === null
      ? null
      : roundCost(row.tax_included === false ? rawPrice * (1 + taxRate) : rawPrice),
  };
}

function sameNullableNumber(left: unknown, right: number | null) {
  const leftNumber = toNullableNumber(left);
  if (leftNumber === null || right === null) return leftNumber === right;
  return Math.abs(leftNumber - right) < 0.0005;
}

async function fetchInventoryItems(inventoryId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("manufacturing_inventory_items")
      .select("*")
      .eq("inventory_id", inventoryId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchAllMasterRows(table: "ingredients" | "materials"): Promise<MasterRow[]> {
  const rows: MasterRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("id,name,unit_quantity,price,tax_included")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as MasterRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function parseUnitQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;

  const normalized = String(value).normalize("NFKC").replace(/,/g, "").trim();
  const numbers = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number).filter((number) => number > 0) || [];
  if (!numbers.length) return null;
  const hasMultiplier = /[x×*]/i.test(normalized);
  const result = hasMultiplier && numbers.length > 1
    ? numbers.reduce((product, number) => product * number, 1)
    : numbers[0];
  return Number.isFinite(result) && result > 0 ? result : null;
}

function roundCost(value: number) {
  return Math.round(value * 1000) / 1000;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
