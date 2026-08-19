export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

import { parseSukenekoProductMasterCsv } from "@/lib/sukeneko-inventory";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type MasterImport = {
  id: string;
  file_name: string;
  row_count: number;
  set_item_count: number;
  imported_by: string;
  imported_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    return NextResponse.json({
      success: true,
      ...(await fetchMasterStatus()),
    });
  } catch (error: any) {
    console.error("wholesale sukeneko master status error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "セット判定マスターの状態を取得できませんでした" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "助ネコの商品基本情報CSVを選択してください" },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "CSVは10MB以下にしてください" },
        { status: 400 },
      );
    }

    const products = parseSukenekoProductMasterCsv(
      Buffer.from(await file.arrayBuffer()),
    );
    const existingCodes = await fetchExistingCodes();
    ensureFullMaster(products.length, existingCodes.length);

    const now = new Date().toISOString();
    const rows = products.map((product) => ({
      source_code: product.sourceCode,
      product_name: product.productName,
      source_price: product.sellingPrice,
      is_set: product.isSet,
      updated_at: now,
    }));
    for (let index = 0; index < rows.length; index += 300) {
      const { error } = await supabase
        .from("wholesale_sukeneko_product_master")
        .upsert(rows.slice(index, index + 300), { onConflict: "source_code" });
      if (error) throw error;
    }

    const importedCodes = new Set(products.map((product) => product.sourceCode));
    const staleCodes = existingCodes.filter((code) => !importedCodes.has(code));
    for (let index = 0; index < staleCodes.length; index += 300) {
      const { error } = await supabase
        .from("wholesale_sukeneko_product_master")
        .delete()
        .in("source_code", staleCodes.slice(index, index + 300));
      if (error) throw error;
    }

    const token = await getToken({ req: request as any });
    const { data: importRun, error: importError } = await supabase
      .from("wholesale_sukeneko_master_imports")
      .insert({
        file_name: sanitizeFileName(file.name),
        row_count: products.length,
        set_item_count: products.filter((product) => product.isSet).length,
        imported_by: String(token?.email || ""),
      })
      .select("*")
      .single();
    if (importError) throw importError;

    return NextResponse.json({
      success: true,
      lastImport: importRun,
      masterCount: products.length,
      setItemCount: products.filter((product) => product.isSet).length,
      physicalItemCount: products.filter((product) => !product.isSet).length,
      removedCount: staleCodes.length,
    });
  } catch (error: any) {
    console.error("wholesale sukeneko master import error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "商品基本情報CSVの読み込みに失敗しました" },
      { status: 500 },
    );
  }
}

async function fetchMasterStatus() {
  const [{ data: lastImport, error: importError }, counts] = await Promise.all([
    supabase
      .from("wholesale_sukeneko_master_imports")
      .select("id,file_name,row_count,set_item_count,imported_by,imported_at")
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchMasterCounts(),
  ]);
  if (importError) throw importError;
  return {
    lastImport: (lastImport as MasterImport | null) || null,
    ...counts,
  };
}

async function fetchMasterCounts() {
  const [
    { count: masterCount, error: masterError },
    { count: setItemCount, error: setError },
  ] = await Promise.all([
    supabase
      .from("wholesale_sukeneko_product_master")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("wholesale_sukeneko_product_master")
      .select("*", { count: "exact", head: true })
      .eq("is_set", true),
  ]);
  if (masterError) throw masterError;
  if (setError) throw setError;
  return {
    masterCount: masterCount || 0,
    setItemCount: setItemCount || 0,
    physicalItemCount: Math.max(0, (masterCount || 0) - (setItemCount || 0)),
  };
}

async function fetchExistingCodes() {
  const codes: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wholesale_sukeneko_product_master")
      .select("source_code")
      .order("source_code", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    codes.push(...(data || []).map((row) => String(row.source_code)));
    if (!data || data.length < 1000) break;
  }
  return codes;
}

function ensureFullMaster(importedCount: number, existingCount: number) {
  if (importedCount < 10) {
    throw new Error("商品数が少なすぎます。全商品を含む商品基本情報CSVを選択してください");
  }
  if (existingCount > 0 && importedCount < Math.floor(existingCount * 0.7)) {
    throw new Error(
      `商品数が${importedCount.toLocaleString()}件しかありません。`
      + "「セット商品を含める」をONにして全商品をダウンロードしてください",
    );
  }
}

function sanitizeFileName(value: unknown) {
  return String(value || "item_basic.csv")
    .replace(/[^\p{L}\p{N}._()（）\- ]/gu, "_")
    .slice(0, 255);
}

async function requireAuthorized(request: NextRequest) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
