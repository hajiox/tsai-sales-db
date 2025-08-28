// app/api/finance/refresh/route.ts
// POST /api/finance/refresh → mv を CONCURRENTLY でリフレッシュ
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

export async function POST(_req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "missing_DATABASE_URL" }, { status: 500 });
  }
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT public.refresh_financial_mviews_final_v1()");
      return Response.json({ ok: true, refreshedAt: new Date().toISOString() }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "db_error", message: err?.message ?? String(err) }, { status: 500 });
  }
}

// 便利用: GETでも叩けるようにしておく（任意）
export async function GET(req: NextRequest) {
  return POST(req);
}
