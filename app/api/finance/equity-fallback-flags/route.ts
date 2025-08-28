// app/api/finance/equity-fallback-flags/route.ts
// GET /api/finance/equity-fallback-flags
// - v_equity_fallback_flags を返す（最新→過去順）
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

export async function GET(_req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "missing_DATABASE_URL" }, { status: 500 });
  }
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        "SELECT * FROM public.v_equity_fallback_flags ORDER BY month_start DESC"
      );
      return Response.json({ rows }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "db_error", message: err?.message ?? String(err) }, { status: 500 });
  }
}
