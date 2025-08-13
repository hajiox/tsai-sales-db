/**
 * TSA 財務分析システム - 総勘定元帳インポート API
 * ver.41 (2025-08-13 JST)
 * - year/month のキー名ゆれ対応（year, targetYear, selectedYear, y, yyyy, period, yyyymm）
 * - month も同様（month, targetMonth, selectedMonth, m, mm, MM）
 * - 全角数字→半角、和暦/「月」付きOK、両方未指定ならファイル名から (例: "令和６年７月分")
 * - それでも失敗時は受信FormDataのキー一覧とサンプル値を detail に返す
 * - その他は ver.40 と同等
 */
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

// ---------- utils: normalize / parse ----------
const ERA_BASE: Record<string, number> = {
  "令和": 2018, // R1=2019
  "平成": 1988, // H1=1989
  "昭和": 1925,
  "大正": 1911,
  "明治": 1867,
};
const ERA_PAT = /(令和|平成|昭和|大正|明治)\s*([0-9０-９]+)/;

function toHalfWidthDigits(s: string) {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
  );
}
function norm(s: any) {
  return toHalfWidthDigits(String(s ?? "")).replace(/\s+/g, "");
}
function parseYearLoose(raw: any, fileName?: string): number | null {
  const cands = [norm(raw), norm(fileName)];
  for (const s of cands) {
    if (!s) continue;
    const y4 = s.match(/(19|20)\d{2}/); // 1900-2099
    if (y4) return Number(y4[0]);
    const m = s.match(ERA_PAT);
    if (m) {
      const era = m[1]; const n = Number(toHalfWidthDigits(m[2]));
      if (n > 0) return ERA_BASE[era] + n;
    }
    // yyyymm / yy-mm / yyyy/mm 等からの抽出
    const yyyymm = s.match(/(19|20)\d{2}[-/_.]?(0[1-9]|1[0-2])/);
    if (yyyymm) return Number(yyyymm[1] + yyyymm[2]); // 例外だが後段で分解するのでOK
  }
  return null;
}
function parseMonthLoose(raw: any, fileName?: string): number | null {
  const cands = [norm(raw), norm(fileName)];
  for (const s of cands) {
    if (!s) continue;
    // 「7月」「07月」優先
    const mj = s.match(/([0-9]{1,2})月/);
    if (mj) {
      const n = Number(mj[1]); if (n >= 1 && n <= 12) return n;
    }
    // 連番から抽出（yyyymm含む）
    const mm = s.match(/(?:^|[^0-9])([01]?[0-9])(?:[^0-9]|$)/);
    if (mm) {
      const n = Number(mm[1]); if (n >= 1 && n <= 12) return n;
    }
    const yyyymm = s.match(/(19|20)\d{2}[-/_.]?(0[1-9]|1[0-2])/);
    if (yyyymm) return Number(yyyymm[2]);
  }
  return null;
}

function detectEncoding(buf: Buffer): "utf-8" | "shift_jis" {
  const asUtf8 = buf.toString("utf-8");
  const bad = (asUtf8.match(/\uFFFD/g) || []).length;
  return bad > 3 ? "shift_jis" : "utf-8";
}
// ---------------------------------------------

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

    // いろんなキー名を許容
    const yearRaw =
      form.get("year") ??
      form.get("targetYear") ??
      form.get("selectedYear") ??
      form.get("y") ??
      form.get("yyyy") ??
      form.get("period") ??
      form.get("yyyymm");

    const monthRaw =
      form.get("month") ??
      form.get("targetMonth") ??
      form.get("selectedMonth") ??
      form.get("m") ??
      form.get("mm") ??
      form.get("MM");

    if (!file) {
      return NextResponse.json(
        { ok: false, stage: "receive", error: "NO_FILE" },
        { status: 400 }
      );
    }

    const fileName = (file as any)?.name ?? "";
    let yearNum = parseYearLoose(yearRaw, fileName);
    let monthNum = parseMonthLoose(monthRaw, fileName);

    // period/yyyymm 単独で来た場合の救済（202407 等）
    if ((!yearNum || !monthNum) && yearRaw) {
      const s = norm(yearRaw);
      const m = s.match(/(19|20)\d{2}[-/_.]?(0[1-9]|1[0-2])/);
      if (m) {
        yearNum = Number(m[1]);
        monthNum = Number(m[2]);
      }
    }

    if (!yearNum || !monthNum) {
      // 何が届いたか見えるように返す（デバッグ用）
      const keys: Record<string, any> = {};
      form.forEach((v, k) => {
        if (k === "file") return;
        keys[k] = String(v).slice(0, 50);
      });
      return NextResponse.json(
        {
          ok: false,
          stage: "validate",
          error: "INVALID_PERIOD",
          detail: {
            receivedKeys: keys,
            fileName: fileName || null,
            parsed: { yearNum, monthNum },
          },
        },
        { status: 400 }
      );
    }

    const yyyymm = `${yearNum}${String(monthNum).padStart(2, "0")}`;

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const enc = detectEncoding(buf);
    const text = iconv.decode(buf, enc === "shift_jis" ? "Shift_JIS" : "UTF-8");

    // 原本保存
    const { error: insertErr } = await supabase.from("gl_raw_uploads").insert({
      yyyymm,
      file_name: fileName || "unknown",
      encoding: enc,
      size: buf.length,
      content: text,
    });
    if (insertErr) {
      return NextResponse.json(
        { ok: false, stage: "store_raw", error: "SAVE_RAW_FAILED", detail: insertErr.message },
        { status: 500 }
      );
    }

    // 解析プレビュー
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
    } catch { records = []; }

    // TODO(ver.42): 本テーブル投入＆ update_monthly_balance 呼び出し

    return NextResponse.json({
      ok: true,
      yyyymm,
      fileName,
      encoding: enc,
      bytes: buf.length,
      parsedPreview: {
        delimiter,
        headerKeys: records.length ? Object.keys(records[0]) : [],
        count: records.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stage: "unknown", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
