// app/api/finance/bs/totals/route.ts
// GET /api/finance/bs/totals?date=YYYY-MM-DD
// - date 未指定: 最新月のB/Sトータルを返す
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

  try {
    const client = await pool.connect();
    try {
      if (date && !isoDate.test(date)) {
        return Response.json(
          { error: "bad_request", message: "invalid 'date' format (YYYY-MM-DD)" },
          { status: 400 }
        );
      }

      if (date) {
        const { rows } = await client.query(
          "SELECT * FROM public.bs_totals_signed_final_v1($1::date)",
          [date]
        );
        const row = rows[0] ?? null;
        return Response.json(
          { month: date, ...row },
          { status: 200 }
        );
      } else {
        // 最新月は overview ビューからBS部分を抽出
        const { rows } = await client.query(
          "SELECT * FROM public.v_financial_overview_final_latest"
        );
        const latest = rows[0] as any;
        return Response.json(
          {
            month: latest?.month_start ?? null,
            assets_total: latest?.assets_total ?? null,
            liabilities_total: latest?.liabilities_total ?? null,
            equity_total: latest?.equity_total ?? null,
            diff: latest?.bs_diff ?? null
          },
          { status: 200 }
        );
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "db_error", message: err?.message ?? String(err) }, { status: 500 });
  }
}
