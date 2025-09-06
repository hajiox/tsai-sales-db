// /app/api/kpi/manual/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';

export const runtime = 'nodejs';

// GET /api/kpi/manual?year=2025&metric=TARGET&channel=WEB(任意)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const metric = searchParams.get('metric');
  const channel = searchParams.get('channel');

  const params: any[] = [year];
  let where = `EXTRACT(YEAR FROM month) = $1`;
  if (metric)  { params.push(metric);  where += ` AND metric = $${params.length}`; }
  if (channel) { params.push(channel); where += ` AND channel_code = $${params.length}`; }

  const sql = `
    SELECT metric, channel_code, month::date, amount::bigint, COALESCE(note,'') AS note, updated_at
    FROM kpi.kpi_manual_monthly
    WHERE ${where}
    ORDER BY month ASC, channel_code ASC, metric ASC;
  `;
  const { rows } = await query(sql, params);
  return NextResponse.json(rows);
}

// POST: { metric, channel_code, month:'YYYY-MM|YYYY-MM-01', amount, note? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const metric = String(body.metric || '');
  const channel = String(body.channel_code || '');
  const rawMonth = String(body.month || '');
  const monthIso = rawMonth.length === 7 ? `${rawMonth}-01` : rawMonth;
  const m = new Date(monthIso);
  const amount = Number(body.amount || 0);
  const note = String(body.note || '');

  if (!['TARGET','BUDGET','ADJUSTMENT'].includes(metric))  return NextResponse.json({ error:'invalid metric' },  { status:400 });
  if (!['SHOKU','STORE','WEB','WHOLESALE','TOTAL'].includes(channel)) return NextResponse.json({ error:'invalid channel' }, { status:400 });
  if (!monthIso || Number.isNaN(m.getTime())) return NextResponse.json({ error:'invalid month' },   { status:400 });
  if (amount < 0)                               return NextResponse.json({ error:'invalid amount' }, { status:400 });

  const monthFirst = new Date(m.getFullYear(), m.getMonth(), 1);
  const sql = `
    INSERT INTO kpi.kpi_manual_monthly (metric, channel_code, month, amount, note)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (metric, channel_code, month)
    DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, updated_at = now()
    RETURNING metric, channel_code, month::date, amount::bigint, COALESCE(note,'') AS note, updated_at;
  `;
  const { rows } = await query(sql, [metric, channel, monthFirst, amount, note]);
  return NextResponse.json(rows[0] ?? null);
}

// DELETE: { metric, channel_code, month:'YYYY-MM|YYYY-MM-01' }
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const metric = String(body.metric || '');
  const channel = String(body.channel_code || '');
  const rawMonth = String(body.month || '');
  const monthIso = rawMonth.length === 7 ? `${rawMonth}-01` : rawMonth;
  const m = new Date(monthIso);

  if (!['TARGET','BUDGET','ADJUSTMENT'].includes(metric))  return NextResponse.json({ error:'invalid metric' },  { status:400 });
  if (!['SHOKU','STORE','WEB','WHOLESALE','TOTAL'].includes(channel)) return NextResponse.json({ error:'invalid channel' }, { status:400 });
  if (!monthIso || Number.isNaN(m.getTime())) return NextResponse.json({ error:'invalid month' },   { status:400 });

  const monthFirst = new Date(m.getFullYear(), m.getMonth(), 1);
  const sql = `
    DELETE FROM kpi.kpi_manual_monthly
    WHERE metric=$1 AND channel_code=$2 AND month=$3
    RETURNING metric, channel_code, month::date;
  `;
  const { rows } = await query(sql, [metric, channel, monthFirst]);
  return NextResponse.json(rows[0] ?? null);
}
