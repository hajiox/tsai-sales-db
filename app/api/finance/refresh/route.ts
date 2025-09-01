// app/api/finance/refresh/route.ts
import { Pool } from "pg";

export const runtime = "nodejs";

type G = typeof globalThis & { __pgPool?: Pool };
const g = globalThis as G;
const pool =
  g.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
g.__pgPool = pool;

export async function POST() {
  const client = await pool.connect();
  try {
    // マテビュー最終版を更新
    await client.query(`select public.refresh_financial_mviews_final_v1();`);
    // 健康チェックを返す
    const { rows } = await client.query(
      `select month_start, bs_diff, pl_diff, is_balanced
         from public.v_trial_balance_final_latest
         limit 1;`
    );
    return new Response(JSON.stringify({ ok: true, latest: rows[0] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  } finally {
    client.release();
  }
}
