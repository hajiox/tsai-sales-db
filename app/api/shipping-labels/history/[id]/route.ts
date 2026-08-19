export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;
    const { id } = await context.params;

    const [{ data: history, error: historyError }, { data: exports, error: exportError }] = await Promise.all([
      supabase.from("shipping_label_imports").select("*").eq("id", id).single(),
      supabase.from("shipping_label_exports").select("*").eq("import_id", id).order("created_at", { ascending: false }),
    ]);
    if (historyError) throw historyError;
    if (exportError) throw exportError;

    return NextResponse.json({
      success: true,
      history: {
        id: history.id,
        source: history.source,
        sourceFileName: history.source_file_name,
        sourceRowCount: history.source_row_count,
        sourceRows: history.source_rows || [],
        settings: history.sender_settings || {},
        conversionSnapshot: history.conversion_snapshot || {},
        createdAt: history.created_at,
        updatedAt: history.updated_at,
        exports: (exports || []).map((row) => ({
          id: row.id,
          carrier: row.carrier,
          fileName: row.file_name,
          rowCount: row.row_count,
          csvContent: row.csv_content,
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error: any) {
    console.error("shipping label history detail GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "履歴詳細の取得に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;
    const { id } = await context.params;
    const { error } = await supabase.from("shipping_label_imports").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("shipping label history DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message || "履歴の削除に失敗しました" }, { status: 500 });
  }
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
