// app/api/general-ledger/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ===== 年月パース（和暦・「月」付き対応）=====
const ERA_BASE: Record<string, number> = {
  "令和": 2018, // R1 = 2019
  "平成": 1988, // H1 = 1989
  "昭和": 1925, // S1 = 1926
  "大正": 1911, // T1 = 1912
  "明治": 1867, // M1 = 1868
};
function parseYearLoose(raw: any): number | null {
  const s = String(raw ?? "").trim();
  // 4桁西暦があれば最優先
  const y4 = s.match(/\d{4}/);
  if (y4) return Number(y4[0]);

  // 和暦「令和6年」「平成31」など
  const m = s.replace(/\s/g, "").match(/(令和|平成|昭和|大正|明治)\s*(\d+)/);
  if (m) {
    const era = m[1];
    const n = Number(m[2]);
    if (!Number.isNaN(n) && n > 0) return ERA_BASE[era] + n;
  }
  return null;
}
function parseMonthLoose(raw: any): number | null {
  const m = String(raw ?? "").match(/\d{1,2}/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1 && n <= 12 ? n : null;
}
// ===========================================

function detectEncoding(buf: Buffer): "utf-8" | "shift_jis" {
  const asUtf8 = buf.toString("utf-8");
  const bad = (asUtf8.match(/\uFFFD/g) || []).length;
  return bad > 3 ? "shift_jis" : "utf-8";
}

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
    const yearRaw = form.get("year");
    const monthRaw = form.get("month");

    const yearNum = parseYearLoose(yearRaw);
    const monthNum = parseMonthLoose(monthRaw);

    if (!file) {
      return NextResponse.json(
        { ok: false, stage: "receive", error: "NO_FILE" },
        { status: 400 }
      );
    }
    if (!yearNum || !monthNum) {
      return NextResponse.json(
        {
          ok: false,
          stage: "validate",
          error: "INVALID_PERIOD",
          detail: { yearRaw, monthRaw, parsed: { yearNum, monthNum } },
        },
        { status: 400 }
      );
    }

    const yyyymm = `${yearNum}${String(monthNum).padStart(2, "0")}`;

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    const encoding =
      detectEncoding(buf) === "shift_jis" ? "shift_jis" : "utf-8";
    const text = iconv.decode(buf, encoding === "shift_jis" ? "Shift_JIS" : "UTF-8");

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
      records = [];
    }

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
