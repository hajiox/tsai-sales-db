// /app/api/food-store/import-sjis/route.ts
// 目的: Shift_JIS(cp932)のCSVを安全にUTF-8化→全列文字列でパース→JAN検証→{ data, reportMonth }を返す
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";

type Row = Record<string, string>;

const toHalf = (s: string) =>
  s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const normHeader = (s: string) =>
  toHalf(String(s || "").trim()).replace(/\s+/g, "").replace(/\uFEFF/g, "");
const digitsOnly = (v: string) => (v ?? "").replace(/\D/g, "");
const hasEPlus = (v: string) => String(v || "").toLowerCase().includes("e+");

const pickBestDecode = (buf: Buffer) => {
  const cands = ["cp932", "Shift_JIS", "utf-8"] as const;
  let best = { enc: "cp932" as (typeof cands)[number], score: -Infinity, text: "" };
  for (const enc of cands) {
    try {
      const text = iconv.decode(buf, enc);
      const rep = (text.match(/\uFFFD/g) || []).length; // replacement char
      const jp = (text.match(/[\u3040-\u30ff\u4e00-\u9faf]/g) || []).length; // JP chars
      const score = jp - rep * 10;
      if (score > best.score) best = { enc, score, text };
    } catch {}
  }
  return best.text;
};

const detectJanCol = (headers: string[]) => {
  const idx = headers.findIndex((h) => /jan|ＪＡＮ/i.test(h));
  return idx >= 0 ? headers[idx] : null;
};

const validateJan = (rows: Row[], janCol: string) => {
  let bad = 0;
  for (const r of rows) {
    const raw = String(r[janCol] ?? "");
    const jan = digitsOnly(raw);
    const len = jan.length;
    // 8〜14桁以外 or E+混入 はNG
    if (len === 0 || len < 8 || len > 14 || hasEPlus(raw)) bad++;
  }
  const total = rows.length;
  const rate = total ? bad / total : 0;
  return { bad, total, rate };
};

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const reportMonth = String(form.get("report_month") ?? ""); // 例: 2025-08-01
    if (!file)  return NextResponse.json({ error: "file is required" }, { status: 400 });
    if (!reportMonth) return NextResponse.json({ error: "report_month is required" }, { status: 400 });

    // 生バイナリ→SJIS/CP932優先で安全デコード
    const buf = Buffer.from(await file.arrayBuffer());
    const text = pickBestDecode(buf);

    // 全列“文字列”でCSVパース（列名は正規化）
    const records: Row[] = parse(text, {
      columns: (h: string[]) => h.map(normHeader),
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      cast: false,
    });
    if (!records.length) {
      return NextResponse.json({ error: "empty csv" }, { status: 400 });
    }

    const headers = Object.keys(records[0]);
    const janCol = detectJanCol(headers);
    if (!janCol) {
      return NextResponse.json({ error: "ＪＡＮ列が見当たりません（ヘッダ名にJAN/ＪＡＮを含めてください）" }, { status: 400 });
    }

    // JANバリデーション（Excel指数表記/桁落ちを弾く）
    const v = validateJan(records, janCol);
    if (v.bad > 0) {
      return NextResponse.json(
        { error: "JAN不正検出（指数表記/桁落ちの可能性）", detail: { jan_col: janCol, invalid_rows: v.bad, total_rows: v.total, invalid_rate: v.rate } },
        { status: 400 }
      );
    }

    // 既存の /api/food-store/import が期待する形に整形して返す
    // ※ ここではDB登録せず、既存ルートへフロントから渡してもらう
    return NextResponse.json({
      ok: true,
      reportMonth,
      data: records, // ← このまま既存の route.ts に { data, reportMonth } でPOSTすれば従来経路で登録される
      stats: {
        rows: records.length,
        uniqueJan: new Set(records.map((r) => digitsOnly(String(r[janCol])))).size,
        jan_col: janCol,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
