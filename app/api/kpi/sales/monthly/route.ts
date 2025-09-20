// app/api/kpi/sales/monthly/route.ts
import { NextResponse } from 'next/server';

import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SQL = `
  SELECT COALESCE(SUM(amount), 0)::bigint AS total
  FROM kpi.kpi_sales_monthly_unified_v1
  WHERE channel_code = $1 AND month = $2::date
`;

const DEFAULT_CHANNEL = 'WEB';

function currentMonthISO(): string {
  const now = new Date();
  const utcMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return utcMonthStart.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel')?.toUpperCase() || DEFAULT_CHANNEL;
  const monthParam = searchParams.get('month');
  const month = monthParam ? new Date(monthParam) : new Date(currentMonthISO());

  if (Number.isNaN(month.getTime())) {
    return NextResponse.json({ error: 'Invalid month format' }, { status: 400 });
  }

  const monthISO = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const { rows } = await pool.query<{ total: string | number }>(SQL, [channel, monthISO]);
  const total = rows?.[0]?.total ?? 0;

  return NextResponse.json(
    { channel, month: monthISO, total: Number(total) },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
}
