// app/api/finance/pl/month-totals/route.ts
// GET /api/finance/pl/month-totals
//    → 全期間の当月P/Lサマリ（v_pl_month_totals_final_series）
// GET /api/finance/pl/month-totals?latest=1
//    → 最新月のみ（v_pl_month_totals_final_latest）
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

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "missing_DATABASE_URL" }, { status: 500 });
  }

  const url = new URL(req.url);
  const latest = url.searchParams.get("latest");

  try {
    const client = await pool.connect();
    try {
      if (latest) {
        const { rows } = await client.query(
          "SELECT * FROM public.v_pl_month_totals_final_latest"
        );
        return Response.json(rows[0] ?? null, { status: 200 });
      } else {
        const { rows } = await client.query(
          "SELECT * FROM public.v_pl_month_totals_final_series ORDER BY month_start"
        );
        return Response.json({ rows }, { status: 200 });
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "db_error", message: err?.message ?? String(err) }, { status: 500 });
  }
}
