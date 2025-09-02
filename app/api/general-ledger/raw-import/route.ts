// app/api/general-ledger/raw-import/route.ts
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { createHash } from "crypto";

export const runtime = "nodejs";

type G = typeof globalThis & { __pgPool?: Pool };
const g = globalThis as G;
const pool =
  g.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
g.__pgPool = pool;

function isISODate(d?: string) {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const month_start = String(form.get("month_start") || "");
  const encoding = (String(form.get("encoding") || "UTF-8") || "UTF-8").toUpperCase();
  const file = form.get("file") as File | null;
  const uploaded_by = String(form.get("uploaded_by") || "web");

  if (!isISODate(month_start)) {
    return Response.json({ ok: false, error: "month_start(YYYY-MM-DD)が必須" }, { status: 400 });
  }
  if (!file) {
    return Response.json({ ok: false, error: "fileが必須" }, { status: 400 });
  }
  // 10MB制限（必要に応じ調整）
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ ok: false, error: "ファイルサイズ上限(10MB)超過" }, { status: 413 });
  }
  // ※ 簡易版：UTF-8前提（Shift_JIS等は後続ステップで対応）
  if (encoding !== "UTF-8") {
    return Response.json({ ok: false, error: "現段階はUTF-8のみ対応（次のステップで追加）" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const src_md5 = createHash("md5").update(buf).digest("hex");
  const content = buf.toString("utf8"); // UTF-8想定
  const src_filename = file.name;

  const client = await pool.connect();
  try {
    const q = `
      insert into public.general_ledger_raw_v1
        (month_start, src_filename, src_md5, encoding, content, uploaded_by)
      values ($1::date, $2, $3, $4, $5, $6)
      returning id, month_start, src_filename, src_md5, uploaded_at
    `;
    const { rows } = await client.query(q, [
      month_start,
      src_filename,
      src_md5,
      encoding,
      content,
      uploaded_by,
    ]);

    return Response.json({ ok: true, saved: rows[0] }, { status: 200 });
  } catch (e: any) {
    // 一意制約（同月×同MD5）重複
    if (e?.code === "23505") {
      return Response.json(
        { ok: false, error: "duplicate", detail: "同一内容のファイルが既に登録されています", md5: src_md5 },
        { status: 409 }
      );
    }
    return Response.json({ ok: false, error: e?.message ?? "internal error" }, { status: 500 });
  } finally {
    client.release();
  }
}
