import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { parseInventoryExcel } from "@/lib/food-store-inventory-import";
import { recalculateInventory, validateInventoryWorkbook } from "@/lib/food-store-inventory";
import { normalizeInventoryFiscalYear } from "@/lib/inventory-fiscal";

export const dynamic = "force-dynamic";
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const failure = (error: unknown, status = 400) => NextResponse.json({ success: false, error: error instanceof Error ? error.message : "棚卸しの処理に失敗しました" }, { status });
async function authorized(request: Request) {
  const token = await getToken({ req: request as Parameters<typeof getToken>[0]["req"] });
  return token?.email === "aizubrandhall@gmail.com" ? token.email : null;
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  if (!await authorized(request)) return failure(new Error("Unauthorized"), 401);
  try {
    const client = db();
    const { data: histories, error } = await client.from("food_store_closing_inventories")
      .select("id,fiscal_year,inventory_date,status,revision,source_filename,updated_at").order("fiscal_year", { ascending: false });
    if (error) throw new Error(error.message);
    const id = new URL(request.url).searchParams.get("id") || histories?.[0]?.id;
    if (!id) return NextResponse.json({ success: true, histories, inventory: null });
    const { data: inventory, error: readError } = await client.from("food_store_closing_inventories").select("id,fiscal_year,inventory_date,status,revision,source_filename,workbook,updated_at").eq("id", id).single();
    if (readError) throw new Error(readError.message);
    return NextResponse.json({ success: true, histories, inventory: { ...inventory, workbook: recalculateInventory(inventory.workbook, true) } });
  } catch (error) { return failure(error, 500); }
}

export async function POST(request: Request) {
  const email = await authorized(request);
  if (!email) return failure(new Error("Unauthorized"), 401);
  try {
    const client = db();
    let workbook, filename, hash, year, date;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error("5MB以内のxlsxファイルを指定してください");
      year = normalizeInventoryFiscalYear(form.get("fiscalYear"));
      date = form.get("inventoryDate");
      const buffer = Buffer.from(await file.arrayBuffer());
      workbook = parseInventoryExcel(buffer);
      filename = file.name;
      hash = createHash("sha256").update(buffer).digest("hex");
    } else {
      const body = await request.json();
      if (body.action !== "copy" || !body.sourceId) throw new Error("操作が不正です");
      year = normalizeInventoryFiscalYear(body.fiscalYear);
      date = body.inventoryDate;
      const { data: source, error } = await client.from("food_store_closing_inventories").select("workbook,source_filename,source_sha256").eq("id", body.sourceId).single();
      if (error || !source) throw new Error("複製元の棚卸しがありません");
      workbook = source.workbook;
      filename = source.source_filename;
      hash = source.source_sha256;
    }
    if (!year || !validDate(date)) throw new Error("年度と棚卸日を指定してください");
    validateInventoryWorkbook(workbook);
    const { data, error } = await client.from("food_store_closing_inventories").insert({ fiscal_year: year, inventory_date: date, source_filename: filename, source_sha256: hash, original_workbook: workbook, workbook, created_by: email, updated_by: email }).select("id").single();
    if (error?.code === "23505") return failure(new Error("この年度は保存済みです。年度一覧から開いてください"), 409);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, id: data!.id });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  const email = await authorized(request);
  if (!email) return failure(new Error("Unauthorized"), 401);
  try {
    const body = await request.json();
    if (!body.id || !Number.isInteger(body.revision)) throw new Error("更新対象が不正です");
    const client = db();
    const { data: current, error } = await client.from("food_store_closing_inventories").select("*").eq("id", body.id).single();
    if (error || !current) throw new Error("棚卸しがありません");
    if (current.revision !== body.revision) return failure(new Error("別の画面で更新されています。再読み込みして変更内容を確認してください"), 409);
    const updates: Record<string, unknown> = { updated_by: email };
    if (body.action === "save") {
      if (current.status !== "draft") throw new Error("確定済みです。編集に戻してから変更してください");
      if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 1000) throw new Error("変更セルが不正です");
      const workbook = structuredClone(current.workbook);
      for (const change of body.changes) {
        const sheet = workbook.sheets.find((s: { name: string }) => s.name === change.sheet);
        if (!sheet || typeof change.address !== "string" || !/^[A-Z][1-9]\d*$/.test(change.address)) throw new Error("変更先が不正です");
        const format = sheet.cells[change.address]?.format;
        sheet.cells[change.address] = { value: change.value, ...(change.formula ? { formula: change.formula } : {}), ...(format ? { format } : {}) };
      }
      updates.workbook = recalculateInventory(workbook, true);
    } else if (body.action === "complete") updates.status = "completed";
    else if (body.action === "reopen") updates.status = "draft";
    else throw new Error("操作が不正です");
    const { data, error: updateError } = await client.from("food_store_closing_inventories").update(updates).eq("id", body.id).eq("revision", body.revision).select("id,revision,status,workbook,updated_at").maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!data) return failure(new Error("同時更新がありました。再読み込みしてください"), 409);
    return NextResponse.json({ success: true, inventory: { ...data, workbook: recalculateInventory(data.workbook, true) } });
  } catch (error) { return failure(error); }
}
