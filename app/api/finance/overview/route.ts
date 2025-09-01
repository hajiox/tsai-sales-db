// app/api/finance/overview/route.ts
import { NextRequest } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

type GlobalWithPool = typeof globalThis & { __pgPool?: Pool };
const g = globalThis as GlobalWithPool;
const pool =
  g.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Vercelのpooler推奨: port=6543, sslmode=require を環境変数側で設定
    max: 5,
    idleTimeoutMillis: 30_000,
  });
g.__pgPool = pool;

async function getLatestMonthStart(client: any): Promise<string> {
  const { rows } = await client.query(
    `SELECT month_start FROM public.v_trial_balance_final_latest LIMIT 1;`
  );
  return rows[0]?.month_start ?? new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date"); // 例: 2025-04-01
    const monthStart =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : await getLatestMonthStart(client);

    const { rows } = await client.query(
      `SELECT * FROM public.financial_overview_final_v1($1::date);`,
      [monthStart]
    );
    const r = rows[0];

    const bs_diff = Number(r.bs_diff ?? 0);
    const pl_diff = Number(r.pl_diff ?? 0);
    const is_balanced = bs_diff === 0 && pl_diff === 0;

    return new Response(
      JSON.stringify(
        {
          month_start: monthStart,
          bs: {
            assets_total: Number(r.assets_total ?? 0),
            liabilities_total: Number(r.liabilities_total ?? 0),
            equity_total: Number(r.equity_total ?? 0),
            diff: bs_diff,
          },
          pl: {
            revenues_total: Number(r.revenues_total ?? 0),
            expenses_total: Number(r.expenses_total ?? 0),
            net_income_signed: Number(r.net_income_signed ?? 0),
            diff: pl_diff,
          },
          is_balanced,
        },
        null,
        2
      ),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "internal error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  } finally {
    client.release();
  }
}
