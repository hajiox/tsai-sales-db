// app/api/finance/series/route.ts
// GET /api/finance/series?from=YYYY-MM-DD&to=YYYY-MM-DD
// - マテビュー mv_financial_overview_final_series を参照（高速）
// - from/to は任意。無指定なら全期間を返す
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
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from && !isoDate.test(from)) {
    return Response.json({ error: "bad_request", message: "invalid 'from' (YYYY-MM-DD)" }, { status: 400 });
  }
  if (to && !isoDate.test(to)) {
    return Response.json({ error: "bad_request", message: "invalid 'to' (YYYY-MM-DD)" }, { status: 400 });
  }

  let sql = "SELECT * FROM public.mv_financial_overview_final_series";
  const params: any[] = [];
  const where: string[] = [];

  if (from) {
    params.push(from);
    where.push(`month_start >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`month_start <= $${params.length}`);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY month_start";

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(sql, params);
      return Response.json({ from: from ?? null, to: to ?? null, rows }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "db_error", message: err?.message ?? String(err) }, { status: 500 });
  }
}
