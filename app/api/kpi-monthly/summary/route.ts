import { NextResponse } from 'next/server';

import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RowAgg = {
  channel_code: string | null;
  ytd_amount: string | number | null;
  curr_amount: string | number | null;
  prev_amount: string | number | null;
};

type ChannelSummary = {
  channel_code: string;
  prev_amount: number;
  curr_amount: number;
  diff_amount: number;
  diff_pct: number | null;
  ytd_amount: number;
};

type Totals = {
  prev_amount: number;
  curr_amount: number;
  diff_amount: number;
  diff_pct: number | null;
  ytd_amount: number;
};

const CHANNEL_ORDER = ['WEB', 'WHOLESALE', 'STORE', 'SHOKU'];

const SQL = `
  SELECT
    channel_code,
    SUM(amount) FILTER (WHERE month >= $1 AND month < $4) AS ytd_amount,
    SUM(amount) FILTER (WHERE month >= $2 AND month < $4) AS curr_amount,
    SUM(amount) FILTER (WHERE month >= $3 AND month < $2) AS prev_amount
  FROM kpi.kpi_sales_monthly_unified_v1
  WHERE COALESCE(amount, 0) <> 0
  GROUP BY channel_code
`;

function channelRank(code: string) {
  const idx = CHANNEL_ORDER.indexOf(code);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rangesUTC() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const curr = new Date(Date.UTC(year, month, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const fyStartYear = month + 1 >= 8 ? year : year - 1;
  const fyStart = new Date(Date.UTC(fyStartYear, 7, 1));

  return {
    fyStartISO: fyStart.toISOString().slice(0, 10),
    currISO: curr.toISOString().slice(0, 10),
    prevISO: prev.toISOString().slice(0, 10),
    nextISO: next.toISOString().slice(0, 10),
    fyLabel: `FY${fyStartYear + 1 - 2000}`,
    currLabel: curr.toISOString().slice(0, 7),
    prevLabel: prev.toISOString().slice(0, 7),
  };
}

async function fetchRows() {
  const range = rangesUTC();
  const { rows } = await pool.query<RowAgg>(SQL, [
    range.fyStartISO,
    range.currISO,
    range.prevISO,
    range.nextISO,
  ]);
  return { rows, range };
}

function buildChannelSummaries(rows: RowAgg[]): { summaries: ChannelSummary[]; totals: Totals } {
  const summaries = rows
    .map((row) => {
      const channel = String(row.channel_code ?? '').toUpperCase();
      const prev = toNumber(row.prev_amount);
      const curr = toNumber(row.curr_amount);
      const ytd = toNumber(row.ytd_amount);
      const diff = curr - prev;
      const pct = prev === 0 ? null : (diff / prev) * 100;

      return {
        channel_code: channel,
        prev_amount: prev,
        curr_amount: curr,
        diff_amount: diff,
        diff_pct: pct,
        ytd_amount: ytd,
      } satisfies ChannelSummary;
    })
    .sort((a, b) => {
      const rankDiff = channelRank(a.channel_code) - channelRank(b.channel_code);
      return rankDiff !== 0 ? rankDiff : a.channel_code.localeCompare(b.channel_code);
    });

  const totals = summaries.reduce<Totals>(
    (acc, summary) => {
      acc.prev_amount += summary.prev_amount;
      acc.curr_amount += summary.curr_amount;
      acc.ytd_amount += summary.ytd_amount;
      return acc;
    },
    { prev_amount: 0, curr_amount: 0, diff_amount: 0, diff_pct: null, ytd_amount: 0 }
  );

  totals.diff_amount = totals.curr_amount - totals.prev_amount;
  totals.diff_pct = totals.prev_amount === 0 ? null : (totals.diff_amount / totals.prev_amount) * 100;

  return { summaries, totals };
}

export async function GET() {
  try {
    const { rows, range } = await fetchRows();
    const { summaries, totals } = buildChannelSummaries(rows);

    return NextResponse.json(
      {
        ok: true,
        meta: range,
        channels: summaries,
        total: totals,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[api/kpi-monthly/summary] error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  }
}
