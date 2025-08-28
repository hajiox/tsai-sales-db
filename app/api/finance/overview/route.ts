// app/api/finance/overview/route.ts
// GET /api/finance/overview?date=YYYY-MM-DD
// - date を付けない: 最新月のサマリを返す
// - NODE ランタイム（Edge不可）。DATABASE_URL が必要。

import { NextRequest } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // Reuse a single Pool in dev/hot-reload
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

const pool =
  global._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // 例: Heroku/Neon等でSSL必須なら、接続文字列に ?sslmode=require を付けてください
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (!global._pgPool) global._pgPool = pool;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "missing_DATABASE_URL" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  let sql: string;
  let params: any[] = [];

  if (date && isoDate.test(date)) {
    sql = "SELECT * FROM public.financial_overview_final_v1($1::date)";
    params = [date];
  } else {
    sql = "SELECT * FROM public.v_financial_overview_final_latest";
  }

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(sql, params);
      // 関数は1行、ビューは1行想定
      const body = rows[0] ?? null;
      return Response.json(body, { status: 200 });
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
