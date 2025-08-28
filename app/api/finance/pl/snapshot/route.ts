// app/api/finance/pl/snapshot/route.ts
// GET /api/finance/pl/snapshot?date=YYYY-MM-DD&scope=ytd|month
// - date 未指定: 最新月の FY累計（YTD）明細を返す
// - scope=month: 当月だけのP/L明細（決算整理は当月分のみ）
// - scope=ytd(既定): FY累計のP/L明細
// ランタイムは Node（Edge 不可）

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
  const scope = (url.searchParams.get("scope") || "ytd").toLowerCase(); // 'ytd' | 'month'

  let sql: string;
  let params: any[] = [];
  let resolvedScope = scope;

  if (!date) {
    // 月未指定なら最新月のYTDを返す
    sql = "SELECT * FROM public.v_pl_snapshot_clean_final_latest";
    resolvedScope = "ytd";
  } else if (isoDate.test(date)) {
    if (scope === "month") {
      sql = "SELECT * FROM public.pl_snapshot_month_final_v1($1::date)";
      params = [date];
    } else {
      sql = "SELECT * FROM public.pl_snapshot_clean_final_v1($1::date)";
      params = [date];
      resolvedScope = "ytd";
    }
  } else {
    return Response.json({ error: "bad_request", message: "invalid 'date' format (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(sql, params);
      return Response.json({ month: date ?? null, scope: resolvedScope, rows }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "db_error", message: err?.message ?? String(err) }, { status: 500 });
  }
}
