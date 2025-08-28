// app/api/finance/bs/snapshot/route.ts
// GET /api/finance/bs/snapshot?date=YYYY-MM-DD
// - date 未指定: 最新月のB/S明細を返す（差額補正行を含む）
// Node ランタイム（Edge不可）

import { NextRequest } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

const pool =
  global._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (!global._pgPool) global._pgPool = pool;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "missing_DATABASE_URL" }, { status: 500 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  let sql: string;
  let params: any[] = [];

  if (!date) {
    sql = "SELECT * FROM public.v_bs_snapshot_clean_final_latest";
  } else if (isoDate.test(date)) {
    sql = "SELECT * FROM public.bs_snapshot_clean_final_v1($1::date)";
    params = [date];
  } else {
    return Response.json(
      { error: "bad_request", message: "invalid 'date' format (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(sql, params);
      return Response.json({ month: date ?? null, rows }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "db_error", message: err?.message ?? String(err) }, { status: 500 });
  }
}
