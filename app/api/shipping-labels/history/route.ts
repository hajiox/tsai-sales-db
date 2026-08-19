export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const auth = await requireAuthorized(request);
    if (auth.response) return auth.response;

    const { data: imports, error: importError } = await supabase
      .from("shipping_label_imports")
      .select("id, source, source_file_name, source_row_count, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (importError) throw importError;

    const importIds = (imports || []).map((row) => row.id);
    const exportsByImport = new Map<string, any[]>();
    if (importIds.length) {
      const { data: exports, error: exportError } = await supabase
        .from("shipping_label_exports")
        .select("id, import_id, carrier, file_name, row_count, created_at")
        .in("import_id", importIds)
        .order("created_at", { ascending: false });
      if (exportError) throw exportError;
      for (const row of exports || []) {
        const values = exportsByImport.get(row.import_id) || [];
        values.push(toExport(row, false));
        exportsByImport.set(row.import_id, values);
      }
    }

    return NextResponse.json({
      success: true,
      histories: (imports || []).map((row) => ({
        id: row.id,
        source: row.source,
        sourceFileName: row.source_file_name,
        sourceRowCount: row.source_row_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        exports: exportsByImport.get(row.id) || [],
      })),
    });
  } catch (error: any) {
    console.error("shipping label history GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "履歴の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthorized(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const source = body.source === "yahoo" ? "yahoo" : body.source === "amazon" ? "amazon" : null;
    const sourceRows = Array.isArray(body.sourceRows) ? body.sourceRows : null;
    const sourceFileName = String(body.sourceFileName || "").trim();
    if (!source || !sourceRows || !sourceFileName) {
      return NextResponse.json({ success: false, error: "注文元・ファイル名・取込データは必須です" }, { status: 400 });
    }
    if (sourceRows.length > 20000) {
      return NextResponse.json({ success: false, error: "一度に保存できる取込行数は20,000行までです" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("shipping_label_imports")
      .insert({
        source,
        source_file_name: sourceFileName,
        source_row_count: sourceRows.length,
        source_rows: sourceRows,
        sender_settings: isPlainObject(body.settings) ? body.settings : {},
        conversion_snapshot: isPlainObject(body.conversionSnapshot) ? body.conversionSnapshot : {},
        created_by: auth.email,
      })
      .select("id, source, source_file_name, source_row_count, created_at, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      success: true,
      history: {
        id: data.id,
        source: data.source,
        sourceFileName: data.source_file_name,
        sourceRowCount: data.source_row_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        exports: [],
      },
    });
  } catch (error: any) {
    console.error("shipping label history POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "取込履歴の保存に失敗しました" }, { status: 500 });
  }
}

function toExport(row: any, includeContent: boolean) {
  return {
    id: row.id,
    carrier: row.carrier,
    fileName: row.file_name,
    rowCount: row.row_count,
    createdAt: row.created_at,
    ...(includeContent ? { csvContent: row.csv_content } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  const email = String(token?.email || "");
  if (!token || email !== "aizubrandhall@gmail.com") {
    return { email: "", response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { email, response: null };
}
