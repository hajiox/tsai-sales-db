/* app/api/kpi/manual/route.ts
   集計API。常に取り直し。DBは DATABASE_URL(Postgres) を使用。
*/
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// ---- DB プール（関数間で再利用） ----
const globalForPg = global as unknown as { __pool?: Pool };
const pool =
  globalForPg.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase/Managed PG を想定
    max: 10,
  });
globalForPg.__pool = pool;

// ---- SQL（WEB=web_sales、OEM=ui or acts fallback、STORE/SHOKU=acts） ----
const SQL = `
WITH acts_src AS (
  SELECT d.channel_code,
         date_trunc('month', a.fiscal_month)::date AS month,
         SUM(a.actual_amount_yen)::bigint AS amt
  FROM kpi.kpi_sales_actuals_monthly_v1 a
  JOIN kpi.channel_dim_v1 d ON d.channel_id = a.channel_id
  WHERE a.fiscal_month IS NOT NULL
  GROUP BY d.channel_code, date_trunc('month', a.fiscal_month)::date
),
ui AS (
  SELECT 'WHOLESALE'::text AS channel_code,
         date_trunc('month', u.fiscal_month)::date AS month,
         SUM(u.actual_amount_yen)::bigint AS amt
  FROM kpi.ui_totals_monthly_v1 u
  WHERE u.source_system <> 'backfill_zero' AND u.actual_amount_yen IS NOT NULL
  GROUP BY 1, 2
),
-- WEB は web_sales に「レコードが存在する月のみ」金額を採用。なければ 0。
web AS (
  SELECT date_trunc('month', COALESCE(
           web_sales.created_at::timestamp,
           web_sales.report_date::timestamp,
           web_sales.report_month::timestamp
         ))::date AS month,
         COUNT(*)::int AS row_count,
         SUM(COALESCE(web_sales.total_sales::numeric, 0))::bigint AS amt
  FROM public.web_sales
  GROUP BY 1
),
wholesale AS (
  SELECT COALESCE(u.month, a.month) AS month,
         COALESCE(u.amt, a.amt)       AS amount
  FROM ui u
  FULL JOIN (
    SELECT month, amt FROM acts_src WHERE channel_code = 'WHOLESALE'
  ) a ON a.month = u.month
),
store_final AS (
  SELECT month, amt AS amount
  FROM acts_src
  WHERE channel_code = 'STORE'
),
shoku_final AS (
  SELECT month, amt AS amount
  FROM acts_src
  WHERE channel_code = 'SHOKU'
),
web_months AS (
  SELECT month FROM acts_src WHERE channel_code = 'WEB'
  UNION
  SELECT month FROM web
),
web_final AS (
  SELECT m.month,
         CASE WHEN COALESCE(w.row_count,0) > 0 THEN w.amt ELSE 0::bigint END AS amount
  FROM web_months m
  LEFT JOIN web w ON w.month = m.month
)
SELECT 'WHOLESALE'::text AS channel_code, month, amount FROM wholesale
UNION ALL
SELECT 'WEB'::text       AS channel_code, month, amount FROM web_final
UNION ALL
SELECT 'STORE'::text     AS channel_code, month, amount FROM store_final
UNION ALL
SELECT 'SHOKU'::text     AS channel_code, month, amount FROM shoku_final
ORDER BY month, channel_code;
`;

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL が未設定です。");
    }

    const { rows } = await pool.query(SQL);

    // 画面用に YYYY-MM の配列や月合計も作って返す
    const ymSet = new Set<string>();
    for (const r of rows) ymSet.add(String(r.month).slice(0, 7));
    const months = Array.from(ymSet).sort();

    const byMonthTotal = months.map((ym) => {
      const total = rows
        .filter((r) => String(r.month).startsWith(ym))
        .reduce((s, r) => s + Number(r.amount || 0), 0);
      return { ym, total };
    });

    return NextResponse.json(
      {
        ok: true as const,
        rows,
        months,
        byMonthTotal,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    console.error("[/api/kpi/manual] Error:", err);
    return NextResponse.json(
      {
        ok: false as const,
        error: err?.message ?? "unknown error",
        updatedAt: new Date().toISOString(),
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
