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

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">売上KPI（月次・会計年度表示）</h1>
        <p className="text-sm text-neutral-600">
          表示対象: {fiscal.fiscalLabel}（{monthLabel(fiscal.start)} 〜 {monthLabel(fiscal.end)}）
        </p>
        <p className="text-xs text-neutral-500">
          Source: <code>kpi.kpi_sales_monthly_unified_v1</code>（完了済み会計年度・月次）
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-[12%]" />
            {fiscal.months.map((month) => (
              <col key={month} className="w-[7.33%]" />
            ))}
          </colgroup>
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">チャネル</th>
              {fiscal.months.map((month) => (
                <th key={month} className="px-2 py-3 text-right font-medium">
                  {monthLabel(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.channel} className="border-t">
                <th className="px-4 py-2 text-left font-medium">{row.channel}</th>
                {row.monthly.map((value, idx) => (
                  <td key={`${row.channel}-${idx}`} className="px-2 py-2 text-right">
                    {fmtJPY(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-neutral-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">月合計</th>
              {monthlyTotals.map((value, idx) => (
                <td key={`total-${idx}`} className="px-2 py-2 text-right font-semibold">
                  {fmtJPY(value)}
                </td>
              ))}
            </tr>
            <tr>
              <th className="px-4 py-2 text-left font-semibold">年間合計</th>
              <td className="px-2 py-2 text-right font-semibold" colSpan={fiscal.months.length}>
                {fmtJPY(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
