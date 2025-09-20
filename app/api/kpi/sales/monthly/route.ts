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

// unified_v1 ensures we always read the finalised monthly totals per channel.
const SQL = `
SELECT channel_code,
       month::date AS month,
       amount::bigint AS amount
FROM kpi.kpi_sales_monthly_unified_v1
ORDER BY 1, 2;
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
