// app/api/kpi/sales/monthly/route.ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('sslmode=disable')
    ? { rejectUnauthorized: false }
    : undefined,
});

const SQL = `
WITH acts AS (
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
  GROUP BY date_trunc('month', u.fiscal_month)::date
),
web AS (
  SELECT date_trunc('month', COALESCE(
           (web_sales.report_month)::timestamp,
           (web_sales.report_date)::timestamp,
           web_sales.created_at
         ))::date AS month,
         SUM(COALESCE(web_sales.total_sales::numeric, 0))::bigint AS sum_amt
  FROM public.web_sales
  GROUP BY date_trunc('month', COALESCE(
           (web_sales.report_month)::timestamp,
           (web_sales.report_date)::timestamp,
           web_sales.created_at
         ))::date
),
months AS (
  SELECT month FROM acts
  UNION SELECT month FROM ui
  UNION SELECT month FROM web
),
acts_web AS (
  SELECT month, amt FROM acts WHERE channel_code='WEB'
),
web_final AS (
  SELECT m.month,
         CASE WHEN COALESCE(w.sum_amt,0)>0 THEN w.sum_amt
              ELSE COALESCE(aw.amt,0)
         END AS amount
  FROM months m
  LEFT JOIN web w     ON w.month   = m.month
  LEFT JOIN acts_web aw ON aw.month = m.month
),
wholesale_final AS (
  SELECT COALESCE(u.month, a.month) AS month,
         COALESCE(u.amt,   a.amt)   AS amount
  FROM ui u
  FULL JOIN (SELECT month, amt FROM acts WHERE channel_code='WHOLESALE') a
    ON a.month = u.month
),
store_final AS (
  SELECT month, amt AS amount FROM acts WHERE channel_code='STORE'
),
shoku_final AS (
  SELECT month, amt AS amount FROM acts WHERE channel_code='SHOKU'
)
SELECT 'WEB' AS channel_code, month, amount FROM web_final
UNION ALL
SELECT 'STORE' AS channel_code, month, amount FROM store_final
UNION ALL
SELECT 'SHOKU' AS channel_code, month, amount FROM shoku_final
UNION ALL
SELECT 'WHOLESALE' AS channel_code, month, amount FROM wholesale_final
ORDER BY 1,2;
`;

export async function GET() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(SQL);
    const data = rows.map((r: any) => ({
      ym: String(r.month).slice(0, 7),
      channel_code: r.channel_code as 'WEB'|'STORE'|'SHOKU'|'WHOLESALE',
      amount: Number(r.amount ?? 0),
    }));
    return NextResponse.json(
      { rows: data, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    );
  } finally {
    client.release();
  }
}
