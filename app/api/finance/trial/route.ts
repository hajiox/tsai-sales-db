// app/api/finance/trial/route.ts
// GET /api/finance/trial           → 最新月の貸借一致ヘルス
// GET /api/finance/trial?scope=all → 全期間のヘルス一覧
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

  const scope = (new URL(req.url).searchParams.get("scope") || "latest").toLowerCase();

  try {
    const client = await pool.connect();
    try {
      if (scope === "all") {
        const { rows } = await client.query(
          "SELECT * FROM public.v_trial_balance_final_all ORDER BY month_start DESC"
        );
        return Response.json({ rows }, { status: 200 });
      } else {
        const { rows } = await client.query(
          "SELECT * FROM public.v_trial_balance_final_latest"
        );
        return Response.json(rows[0] ?? null, { status: 200 });
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json(
      { error: "db_error", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
