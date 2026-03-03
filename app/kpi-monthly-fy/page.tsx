import { Pool } from "pg";

import { fiscalWindowFromLatest } from "@/lib/fiscal";
import {
  CHANNELS,
  assertChannelSums,
  shapeMonthly,
  type MonthlyRow,
} from "@/lib/kpiMonthly";
import { getWholesaleOemOverview } from "@/server/db/kpi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RawRow = {
  month: string | Date | null;
  channel_code: string | null;
  amount: string | number | null;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const fmtJPY = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

const monthLabel = (iso: string) => iso.slice(0, 7);

async function fetchLatestMonth(): Promise<string | null> {
  const sql = `
    SELECT max(month) AS latest_month
    FROM kpi.kpi_sales_monthly_unified_v1
    WHERE COALESCE(amount, 0) > 0
  `;
  const { rows } = await pool.query<{ latest_month: string | Date | null }>(sql);
  const raw = rows[0]?.latest_month;
  if (!raw) return null;
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "string" && raw.length >= 10) {
    return raw.slice(0, 10);
  }
  return null;
}

function normalizeMonth(value: RawRow["month"]): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.slice(0, 10);
  }
  if (typeof value === "string" && value.length >= 10) {
    return value.slice(0, 10);
  }
  return null;
}

function normalizeAmount(value: RawRow["amount"]): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchMonthlyRows(start: string, end: string): Promise<MonthlyRow[]> {
  const sql = `
    SELECT month, channel_code, amount
    FROM kpi.kpi_sales_monthly_unified_v1
    WHERE month >= $1 AND month <= $2
    ORDER BY month ASC, channel_code ASC
  `;
  const { rows } = await pool.query<RawRow>(sql, [start, end]);
  const normalized = rows
    .map((row) => ({
      month: normalizeMonth(row.month),
      channel_code: row.channel_code ?? "",
      amount: normalizeAmount(row.amount),
    }))
    .filter((row): row is MonthlyRow => {
      if (!row.month) return false;
      return CHANNELS.includes(row.channel_code as (typeof CHANNELS)[number]);
    })
    .map((row) => ({
      month: `${row.month.slice(0, 7)}-01`,
      channel_code: row.channel_code as (typeof CHANNELS)[number],
      amount: row.amount,
    }));

  const wholesaleMonths = Array.from(
    new Set(
      normalized
        .filter((row) => row.channel_code === "WHOLESALE")
        .map((row) => row.month)
    )
  );

  if (wholesaleMonths.length === 0) {
    return normalized;
  }

  const totals = await Promise.all(
    wholesaleMonths.map(async (month) => {
      const overview = await getWholesaleOemOverview(month);
      return [month, Number(overview.total_amount ?? 0)] as const;
    })
  );

  const totalMap = new Map(totals);

  return normalized.map((row) =>
    row.channel_code === "WHOLESALE"
      ? { ...row, amount: totalMap.get(row.month) ?? 0 }
      : row
  );
}

function buildChannelMatrix(shaped: ReturnType<typeof shapeMonthly>) {
  return CHANNELS.map((channel, idx) => ({
    channel,
    monthly: shaped.map((row) => row.byChannel[idx]),
    total: shaped.reduce((sum, row) => sum + row.byChannel[idx], 0),
  }));
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

async function fetchTargets(fy: number) {
  const sql = `
    SELECT month, SUM(target_amount) as target_amount, SUM(last_year_amount) as last_year_amount
    FROM kpi.kpi_targets_fy_v1
    WHERE fy = $1
    GROUP BY month
  `;
  const { rows } = await pool.query(sql, [fy]);
  const map = new Map<string, { target: number; lastYear: number }>();
  for (const row of rows) {
    let m = null;
    if (row.month instanceof Date) m = row.month.toISOString().slice(0, 10);
    else if (typeof row.month === "string" && row.month.length >= 10) m = row.month.slice(0, 10);
    if (m) {
      const key = `${m.slice(0, 7)}-01`;
      map.set(key, {
        target: Number(row.target_amount) || 0,
        lastYear: Number(row.last_year_amount) || 0,
      });
    }
  }
  return map;
}

export default async function Page() {
  let latestMonth = null;
  try {
    latestMonth = await fetchLatestMonth();
  } catch (error: unknown) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPI（月次・会計年度表示）</h1>
        <p className="mt-4 text-sm text-red-600">最新月の取得に失敗しました。</p>
        <pre className="mt-2 whitespace-pre-wrap text-xs rounded border bg-neutral-50 p-3">{String(error)}</pre>
      </main>
    );
  }

  if (!latestMonth) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPI（月次・会計年度表示）</h1>
        <p className="mt-4 text-sm text-neutral-600">表示可能なデータがありません。</p>
      </main>
    );
  }

  let fiscal;
  try {
    fiscal = fiscalWindowFromLatest(latestMonth);
  } catch (error: unknown) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPI（月次・会計年度表示）</h1>
        <p className="mt-4 text-sm text-red-600">会計年度の算出に失敗しました。</p>
        <pre className="mt-2 whitespace-pre-wrap text-xs rounded border bg-neutral-50 p-3">{String(error)}</pre>
      </main>
    );
  }

  let rows: MonthlyRow[] = [];
  try {
    rows = await fetchMonthlyRows(fiscal.start, fiscal.end);
  } catch (error: unknown) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPI（月次・会計年度表示）</h1>
        <p className="mt-4 text-sm text-red-600">データ取得に失敗しました。</p>
        <pre className="mt-2 whitespace-pre-wrap text-xs rounded border bg-neutral-50 p-3">{String(error)}</pre>
      </main>
    );
  }

  const shaped = shapeMonthly(rows, fiscal.months);

  try {
    assertChannelSums(shaped);
  } catch (error: unknown) {
    return (
      <main className="p-6 space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">売上KPI（月次・会計年度表示）</h1>
          <p className="text-sm text-neutral-600">表示対象: {fiscal.fiscalLabel}（{monthLabel(fiscal.start)} 〜 {monthLabel(fiscal.end)})</p>
        </header>
        <div className="rounded border border-red-400 bg-red-50 p-4 text-sm text-red-800">
          月別のチャネル合計が月合計と一致していません。詳細はサーバーログを確認してください。
        </div>
        <pre className="whitespace-pre-wrap text-xs rounded border bg-neutral-50 p-3">{String(error)}</pre>
      </main>
    );
  }

  const matrix = buildChannelMatrix(shaped);
  const monthlyTotals = shaped.map((row) => row.monthTotal);
  const grandTotal = sum(monthlyTotals);

  const targetMap = await fetchTargets(fiscal.fiscalStartYear);
  const monthlyLastYear = fiscal.months.map((m) => targetMap.get(m)?.lastYear ?? 0);

  const calcYoY = (actual: number, lastYear: number) => {
    if (lastYear === 0) return null;
    if (actual === 0) return null;
    return (actual / lastYear) * 100;
  };

  const fmtPct = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;

  return (
    <main className="p-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">売上KPI（月次・会計年度表示）</h1>
        <p className="text-sm text-neutral-600">
          表示対象: {fiscal.fiscalLabel}（{monthLabel(fiscal.start)} 〜 {monthLabel(fiscal.end)}）
        </p>
        <p className="text-xs text-neutral-500">
          Source: <code>kpi.kpi_sales_monthly_unified_v1</code>（完了済み会計年度・月次）
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full table-fixed text-[11px]">
          <colgroup>
            <col className="w-[10%]" />
            {fiscal.months.map((month) => (
              <col key={month} className="w-[7.5%]" />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-2 py-1.5 text-left font-semibold">チャネル</th>
              {fiscal.months.map((month) => (
                <th key={month} className="px-2 py-1.5 text-right font-semibold">
                  {monthLabel(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.channel} className="border-t hover:bg-neutral-50">
                <th className="px-2 py-1.5 text-left font-medium text-neutral-700 whitespace-nowrap">{row.channel}</th>
                {row.monthly.map((value, idx) => (
                  <td key={`${row.channel}-${idx}`} className="px-2 py-1.5 text-right tabular-nums text-neutral-800">
                    {value === 0 ? <span className="text-neutral-300">0</span> : fmtJPY(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-blue-200">
            <tr className="bg-blue-50">
              <th className="px-2 py-2 text-left font-bold text-blue-900 whitespace-nowrap">★ 実績合計</th>
              {monthlyTotals.map((value, idx) => (
                <td key={`total-${idx}`} className="px-2 py-2 text-right font-bold text-blue-900 tabular-nums">
                  {value === 0 ? "" : fmtJPY(value)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-blue-100 bg-blue-50/50">
              <th className="px-2 py-1.5 text-left font-medium text-blue-800 whitespace-nowrap">前年実績</th>
              {monthlyLastYear.map((value, idx) => (
                <td key={`ly-${idx}`} className="px-2 py-1.5 text-right font-medium text-blue-700 tabular-nums">
                  {value === 0 ? "" : fmtJPY(value)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-blue-100 bg-blue-50/30">
              <th className="px-2 py-1.5 text-left font-medium text-blue-800 whitespace-nowrap">前年同月比(%)</th>
              {fiscal.months.map((_, idx) => {
                const yoy = calcYoY(monthlyTotals[idx], monthlyLastYear[idx]);
                let color = "text-blue-300";
                if (yoy !== null) {
                  color = yoy >= 100 ? "text-emerald-600 font-bold" : "text-red-500 font-medium";
                }
                return (
                  <td key={`yoy-${idx}`} className={`px-2 py-1.5 text-right tabular-nums ${color}`}>
                    {fmtPct(yoy)}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t-2 border-neutral-200 bg-neutral-100">
              <th className="px-2 py-2 text-left font-bold text-neutral-800 whitespace-nowrap">★ 年間累計額</th>
              <td className="px-2 py-2 text-right font-bold text-neutral-800 tabular-nums" colSpan={fiscal.months.length}>
                {fmtJPY(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
