export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthorized(request);
    if (auth.response) return auth.response;
    const { id } = await context.params;
    const body = await request.json();
    const carrier = body.carrier === "yamato" ? "yamato" : body.carrier === "sagawa" ? "sagawa" : null;
    const fileName = String(body.fileName || "").trim();
    const csvContent = typeof body.csvContent === "string" ? body.csvContent : "";
    const rowCount = Number(body.rowCount);
    if (!carrier || !fileName || !csvContent || !Number.isInteger(rowCount) || rowCount < 0) {
      return NextResponse.json({ success: false, error: "出力データが不正です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("shipping_label_exports")
      .insert({
        import_id: id,
        carrier,
        file_name: fileName,
        row_count: rowCount,
        csv_content: csvContent,
        created_by: auth.email,
      })
      .select("id, carrier, file_name, row_count, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      success: true,
      export: {
        id: data.id,
        carrier: data.carrier,
        fileName: data.file_name,
        rowCount: data.row_count,
        createdAt: data.created_at,
      },
    });
  } catch (error: any) {
    console.error("shipping label export POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "出力履歴の保存に失敗しました" }, { status: 500 });
  }
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  const email = String(token?.email || "");
  if (!token || email !== "aizubrandhall@gmail.com") {
    return { email: "", response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { email, response: null };
}
