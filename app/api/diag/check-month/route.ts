import { NextResponse } from 'next/server';

import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RawRow = {
  channel_code: string | null;
  month: string | null;
  unified_amount: string | number | null;
  actuals_amount: string | number | null;
  final_amount: string | number | null;
  computed_amount: string | number | null;
  unified_source: string | null;
  diff_vs_source: string | number | null;
};

type ParsedRow = {
  channel_code: string | null;
  month: string | null;
  unified_amount: number;
  actuals_amount: number;
  final_amount: number;
  computed_amount: number;
  unified_source: string;
  diff_vs_source: number;
};

const SQL = `
WITH params AS (
  SELECT ($1::date) AS m
),
a AS (
  SELECT UPPER(BTRIM(dc.channel_code)) AS channel_code,
         date_trunc('month', s.fiscal_month)::date AS month,
         SUM(COALESCE(s.actual_amount_yen,0))::numeric AS amount
  FROM kpi.sales_actuals_monthly s
  JOIN kpi.dim_channel dc ON dc.channel_id = s.channel_id
  JOIN params p ON TRUE
  WHERE s.fiscal_month >= p.m AND s.fiscal_month < (p.m + INTERVAL '1 month')
  GROUP BY 1,2
),
f AS (
  SELECT UPPER(BTRIM(channel_code)) AS channel_code,
         fiscal_month::date AS month,
         SUM(COALESCE(actual_amount_yen,0))::numeric AS amount
  FROM kpi.kpi_sales_monthly_final_v1_canon
  JOIN params p ON TRUE
  WHERE fiscal_month >= p.m AND fiscal_month < (p.m + INTERVAL '1 month')
  GROUP BY 1,2
),
c AS (
  SELECT UPPER(BTRIM(channel_code)) AS channel_code,
         date_trunc('month', fiscal_month)::date AS month,
         SUM(COALESCE(actual_amount_yen,0))::numeric AS amount
  FROM kpi.kpi_sales_monthly_computed_v2
  JOIN params p ON TRUE
  WHERE fiscal_month >= p.m AND fiscal_month < (p.m + INTERVAL '1 month')
  GROUP BY 1,2
),
u AS (
  SELECT UPPER(BTRIM(channel_code)) AS channel_code,
         month,
         amount
  FROM kpi.kpi_sales_monthly_unified_v1
  JOIN params p ON TRUE
  WHERE month = p.m
)
SELECT
  COALESCE(u.channel_code, a.channel_code, f.channel_code, c.channel_code) AS channel_code,
  COALESCE(u.month, a.month, f.month, c.month) AS month,
  COALESCE(u.amount, 0)        AS unified_amount,
  COALESCE(a.amount, 0)        AS actuals_amount,
  COALESCE(f.amount, 0)        AS final_amount,
  COALESCE(c.amount, 0)        AS computed_amount,
  CASE
    WHEN a.channel_code IS NOT NULL THEN 'actuals'
    WHEN f.channel_code IS NOT NULL THEN 'final'
    WHEN c.channel_code IS NOT NULL THEN 'computed'
    ELSE 'none'
  END AS unified_source,
  COALESCE(u.amount,0) - COALESCE(
     CASE
       WHEN a.channel_code IS NOT NULL THEN a.amount
       WHEN f.channel_code IS NOT NULL THEN f.amount
       WHEN c.channel_code IS NOT NULL THEN c.amount
       ELSE 0
     END, 0
  ) AS diff_vs_source
FROM u
FULL OUTER JOIN a ON a.channel_code = u.channel_code AND a.month = u.month
FULL OUTER JOIN f ON f.channel_code = COALESCE(u.channel_code, a.channel_code)
                 AND f.month       = COALESCE(u.month, a.month)
FULL OUTER JOIN c ON c.channel_code = COALESCE(u.channel_code, a.channel_code, f.channel_code)
                 AND c.month       = COALESCE(u.month, a.month, f.month)
ORDER BY 1;
`;

function ensureMonthIso(m?: string | null): string {
  const now = new Date();
  if (m == null || m.trim() === '') {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return monthStart.toISOString().slice(0, 10);
  }

  const normalized = m.trim();
  const match = /^([0-9]{4})-([0-9]{2})(?:-([0-9]{2}))?$/.exec(normalized);
  if (!match) {
    throw new Error('Invalid month parameter');
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const dayPart = match[3];
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error('Invalid month parameter');
  }
  if (dayPart && dayPart !== '01') {
    throw new Error('Invalid month parameter');
  }

  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  return monthStart.toISOString().slice(0, 10);
}

function formatMonth(value: string | null): string | null {
  if (value == null) return null;
  return String(value).slice(0, 10);
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseRows(rows: RawRow[]): ParsedRow[] {
  return rows.map((row) => {
    return {
      channel_code: row.channel_code,
      month: formatMonth(row.month),
      unified_amount: toNumber(row.unified_amount),
      actuals_amount: toNumber(row.actuals_amount),
      final_amount: toNumber(row.final_amount),
      computed_amount: toNumber(row.computed_amount),
      unified_source: row.unified_source ?? 'none',
      diff_vs_source: toNumber(row.diff_vs_source),
    } satisfies ParsedRow;
  });
}

function filterRows(rows: ParsedRow[], onlyDiffs: boolean): ParsedRow[] {
  if (!onlyDiffs) return rows;
  return rows.filter((row) => row.diff_vs_source !== 0);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('m');
    const onlyDiffs = searchParams.get('onlyDiffs') === 'true';

    const monthISO = ensureMonthIso(monthParam);
    const { rows } = await pool.query<RawRow>(SQL, [monthISO]);

    const parsed = parseRows(rows);
    const filtered = filterRows(parsed, onlyDiffs);

    return NextResponse.json(
      {
        ok: true,
        month: monthISO,
        onlyDiffs,
        rows: filtered,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Invalid month parameter' ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      {
        status,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  }
}
