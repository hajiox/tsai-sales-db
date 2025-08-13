// app/api/general-ledger/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

// --- Next.js Route Handler settings ---
export const runtime = "nodejs";         // Edge禁止（iconv等を使うため）
export const dynamic = "force-dynamic";  // キャッシュ無効
export const maxDuration = 60;           // 実行上限

// --- Supabase (server) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // サーバー側鍵
);

// --- helpers ---
function detectEncoding(buf: Buffer): "utf-8" | "shift_jis" {
  // 超簡易：UTF-8で置換文字が多ければSJIS扱い
  const asUtf8 = buf.toString("utf-8");
  const bad = (asUtf8.match(/\uFFFD/g) || []).length;
  return bad > 3 ? "shift_jis" : "utf-8";
}

// CORS プリフライトが来る環境向け（同一オリジンなら実質スルー）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const year = String(form.get("year") ?? "");
    const month = String(form.get("month") ?? "");

    if (!file) {
      return NextResponse.json(
        { ok: false, stage: "receive", error: "NO_FILE" },
        { status: 400 }
      );
    }
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
      return NextResponse.json(
        { ok: false, stage: "validate", error: "INVALID_PERIOD", detail: { year, month } },
        { status: 400 }
      );
    }
    const yyyymm = `${year}${String(Number(month)).padStart(2, "0")}`;

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    const encoding = detectEncoding(buf);
    const text = iconv.decode(buf, encoding === "shift_jis" ? "Shift_JIS" : "UTF-8");

    // 原本保存（監査・再処理用）
    const { error: insertErr } = await supabase.from("gl_raw_uploads").insert({
      yyyymm,
      file_name: file.name ?? "unknown",
      encoding,
      size: buf.length,
      content: text,
    });
    if (insertErr) {
      return NextResponse.json(
        { ok: false, stage: "store_raw", error: "SAVE_RAW_FAILED", detail: insertErr.message },
        { status: 500 }
      );
    }

    // 解析プレビュー（区切り自動判定）
    const delimiter = text.includes("\t") ? "\t" : ",";
    let records: any[] = [];
    try {
      records = parse(text, {
        columns: true,
        delimiter,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        bom: true,
      });
    } catch {
      // ヘッダ無し/固定幅は後続TODO。ここでは失敗してもOK
      records = [];
    }

    // TODO: records を本番テーブルへマッピング→挿入
    // TODO: await supabase.rpc("update_monthly_balance", { p_yyyymm: yyyymm });

    return NextResponse.json({
      ok: true,
      yyyymm,
      fileName: file.name ?? "unknown",
      encoding,
      bytes: buf.length,
      parsedPreview: {
        delimiter,
        headerKeys: records.length ? Object.keys(records[0]) : [],
        count: records.length,
      },
      message: records.length
        ? "RAW保存 OK / 解析プレビュー取得 OK"
        : "RAW保存 OK / 解析プレビューは未取得（後続で対応）",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stage: "unknown", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
