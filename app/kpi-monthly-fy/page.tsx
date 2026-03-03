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

type TargetRow = {
  month: string | Date | null;
  target_amount: string | number | null;
  last_year_amount: string | number | null;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const fmtNum = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 0,
  }).format(value ?? 0);

const fmtPct = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;

const monthLabel = (iso: string) => {
  const m = iso.slice(5, 7);
  return `${parseInt(m)}月`;
};

async function fetchLatestMonth(): Promise<string | null> {
  const sql = `
    SELECT max(month) AS latest_month
    FROM kpi.kpi_sales_monthly_unified_v1
    WHERE COALESCE(amount, 0) > 0
  `;
  const { rows } = await pool.query<{ latest_month: string | Date | null }>(sql);
  const raw = rows[0]?.latest_month;
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "string" && raw.length >= 10) return raw.slice(0, 10);
  return null;
}

function normalizeMonth(value: RawRow["month"]): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return null;
}

function normalizeAmount(value: RawRow["amount"]): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
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

  if (wholesaleMonths.length === 0) return normalized;

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

async function fetchTargets(fy: number, months: string[]): Promise<Map<string, { target: number; lastYear: number }>> {
  const sql = `
    SELECT month, SUM(target_amount) as target_amount, SUM(last_year_amount) as last_year_amount
    FROM kpi.kpi_targets_fy_v1
    WHERE fy = $1
    GROUP BY month
    ORDER BY month
  `;
  const { rows } = await pool.query<TargetRow>(sql, [fy]);

  const map = new Map<string, { target: number; lastYear: number }>();
  for (const row of rows) {
    const m = normalizeMonth(row.month);
    if (m) {
      const key = `${m.slice(0, 7)}-01`;
      map.set(key, {
        target: normalizeAmount(row.target_amount),
        lastYear: normalizeAmount(row.last_year_amount),
      });
    }
  }
  return map;
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

// チャネル表示名
const CHANNEL_LABEL: Record<string, string> = {
  WEB: "WEB（EC）",
  STORE: "直売所",
  SHOKU: "食の蔵",
  WHOLESALE: "卸・OEM",
};

export default async function Page() {
  let latestMonth = null;
  try {
    latestMonth = await fetchLatestMonth();
  } catch (error: unknown) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPIダッシュボード</h1>
        <p className="mt-4 text-sm text-red-600">最新月の取得に失敗しました。</p>
        <pre className="mt-2 whitespace-pre-wrap text-xs rounded border bg-neutral-50 p-3">{String(error)}</pre>
      </main>
    );
  }

  if (!latestMonth) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPIダッシュボード</h1>
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
        <h1 className="text-2xl font-semibold">売上KPIダッシュボード</h1>
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
        <h1 className="text-2xl font-semibold">売上KPIダッシュボード</h1>
        <p className="mt-4 text-sm text-red-600">データ取得に失敗しました。</p>
        <pre className="mt-2 whitespace-pre-wrap text-xs rounded border bg-neutral-50 p-3">{String(error)}</pre>
      </main>
    );
  }

  const shaped = shapeMonthly(rows, fiscal.months);

  try {
    assertChannelSums(shaped);
  } catch {
    // ignore assertion errors for display
  }

  // 目標・前年データ取得
  const targetMap = await fetchTargets(fiscal.fiscalStartYear, fiscal.months);

  const matrix = buildChannelMatrix(shaped);
  const monthlyTotals = shaped.map((row) => row.monthTotal);
  const grandTotal = sum(monthlyTotals);

  // 目標・前年の月別データ
  const monthlyTargets = fiscal.months.map((m) => targetMap.get(m)?.target ?? 0);
  const monthlyLastYear = fiscal.months.map((m) => targetMap.get(m)?.lastYear ?? 0);

  // 月別達成率 (実績/目標)
  const monthlyAchievement = fiscal.months.map((_, i) => {
    if (monthlyTargets[i] === 0) return null;
    if (monthlyTotals[i] === 0) return null;
    return (monthlyTotals[i] / monthlyTargets[i]) * 100;
  });

  // 月別前年同月比 (実績/前年)
  const monthlyYoY = fiscal.months.map((_, i) => {
    if (monthlyLastYear[i] === 0) return null;
    if (monthlyTotals[i] === 0) return null;
    return (monthlyTotals[i] / monthlyLastYear[i]) * 100;
  });

  // 年間合計
  const grandTarget = sum(monthlyTargets);
  const grandLastYear = sum(monthlyLastYear);
  const grandAchievement = grandTarget > 0 && grandTotal > 0 ? (grandTotal / grandTarget) * 100 : null;
  const grandYoY = grandLastYear > 0 && grandTotal > 0 ? (grandTotal / grandLastYear) * 100 : null;

  // 月が実績あり（0でない）か判定
  const hasActual = (idx: number) => monthlyTotals[idx] > 0;

  return (
    <main className="p-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">売上KPIダッシュボード</h1>
        <p className="text-xs text-neutral-500">
          {fiscal.fiscalLabel}（{fiscal.start.slice(0, 7)} 〜 {fiscal.end.slice(0, 7)}）
        </p>
      </header>

      {/* ===== メインテーブル ===== */}
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full table-fixed text-[11px]">
          <colgroup>
            <col style={{ width: "9%" }} />
            {fiscal.months.map((m) => (
              <col key={m} style={{ width: `${91 / 13}%` }} />
            ))}
            <col style={{ width: `${91 / 13}%` }} />
          </colgroup>

          {/* ===== ヘッダー ===== */}
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-2 py-2 text-left font-semibold text-[11px]"></th>
              {fiscal.months.map((month) => (
                <th key={month} className="px-1 py-2 text-right font-semibold text-[11px]">
                  {monthLabel(month)}
                </th>
              ))}
              <th className="px-1 py-2 text-right font-semibold text-[11px] bg-slate-800">
                年間
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ===== チャネル別行 ===== */}
            {matrix.map((row) => (
              <tr key={row.channel} className="border-t border-neutral-100 hover:bg-neutral-50">
                <th className="px-2 py-1.5 text-left font-medium text-neutral-700 text-[11px] whitespace-nowrap">
                  {CHANNEL_LABEL[row.channel] ?? row.channel}
                </th>
                {row.monthly.map((value, idx) => (
                  <td
                    key={`${row.channel}-${idx}`}
                    className={`px-1 py-1.5 text-right tabular-nums ${hasActual(idx) ? "text-neutral-900" : "text-neutral-300"
                      }`}
                  >
                    {fmtNum(value)}
                  </td>
                ))}
                <td className="px-1 py-1.5 text-right tabular-nums font-medium bg-neutral-50">
                  {fmtNum(row.total)}
                </td>
              </tr>
            ))}

            {/* ===== 実績合計行（目立つ色） ===== */}
            <tr className="border-t-2 border-blue-300 bg-blue-50">
              <th className="px-2 py-2 text-left font-bold text-blue-900 text-[11px]">
                ★ 実績合計
              </th>
              {monthlyTotals.map((value, idx) => (
                <td
                  key={`actual-${idx}`}
                  className={`px-1 py-2 text-right tabular-nums font-bold ${hasActual(idx) ? "text-blue-900" : "text-blue-200"
                    }`}
                >
                  {fmtNum(value)}
                </td>
              ))}
              <td className="px-1 py-2 text-right tabular-nums font-bold text-blue-900 bg-blue-100">
                {fmtNum(grandTotal)}
              </td>
            </tr>

            {/* ===== 目標行 ===== */}
            <tr className="border-t border-neutral-200 bg-amber-50/50">
              <th className="px-2 py-1.5 text-left font-medium text-amber-800 text-[11px]">
                目標
              </th>
              {monthlyTargets.map((value, idx) => (
                <td
                  key={`target-${idx}`}
                  className="px-1 py-1.5 text-right tabular-nums text-amber-700"
                >
                  {fmtNum(value)}
                </td>
              ))}
              <td className="px-1 py-1.5 text-right tabular-nums font-medium text-amber-800 bg-amber-50">
                {fmtNum(grandTarget)}
              </td>
            </tr>

            {/* ===== 達成率行 ===== */}
            <tr className="border-t border-neutral-100">
              <th className="px-2 py-1.5 text-left font-medium text-neutral-600 text-[11px]">
                達成率
              </th>
              {monthlyAchievement.map((value, idx) => {
                let color = "text-neutral-300";
                if (value !== null) {
                  color = value >= 100 ? "text-emerald-600 font-bold" : value >= 80 ? "text-amber-600 font-semibold" : "text-red-600 font-semibold";
                }
                return (
                  <td key={`ach-${idx}`} className={`px-1 py-1.5 text-right tabular-nums ${color}`}>
                    {fmtPct(value)}
                  </td>
                );
              })}
              <td className={`px-1 py-1.5 text-right tabular-nums font-bold bg-neutral-50 ${grandAchievement !== null
                  ? grandAchievement >= 100 ? "text-emerald-600" : grandAchievement >= 80 ? "text-amber-600" : "text-red-600"
                  : "text-neutral-300"
                }`}>
                {fmtPct(grandAchievement)}
              </td>
            </tr>

            {/* ===== 前年実績行 ===== */}
            <tr className="border-t border-neutral-200 bg-purple-50/30">
              <th className="px-2 py-1.5 text-left font-medium text-purple-700 text-[11px]">
                前年実績
              </th>
              {monthlyLastYear.map((value, idx) => (
                <td
                  key={`ly-${idx}`}
                  className="px-1 py-1.5 text-right tabular-nums text-purple-600"
                >
                  {fmtNum(value)}
                </td>
              ))}
              <td className="px-1 py-1.5 text-right tabular-nums font-medium text-purple-700 bg-purple-50">
                {fmtNum(grandLastYear)}
              </td>
            </tr>

            {/* ===== 前年同月比行 ===== */}
            <tr className="border-t border-neutral-100">
              <th className="px-2 py-1.5 text-left font-medium text-neutral-600 text-[11px]">
                前年同月比
              </th>
              {monthlyYoY.map((value, idx) => {
                let color = "text-neutral-300";
                if (value !== null) {
                  color = value >= 100 ? "text-emerald-600 font-bold" : "text-red-600 font-semibold";
                }
                return (
                  <td key={`yoy-${idx}`} className={`px-1 py-1.5 text-right tabular-nums ${color}`}>
                    {fmtPct(value)}
                  </td>
                );
              })}
              <td className={`px-1 py-1.5 text-right tabular-nums font-bold bg-neutral-50 ${grandYoY !== null
                  ? grandYoY >= 100 ? "text-emerald-600" : "text-red-600"
                  : "text-neutral-300"
                }`}>
                {fmtPct(grandYoY)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>
          実績
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-300"></span>
          目標
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-purple-50 border border-purple-300"></span>
          前年
        </span>
        <span className="ml-auto">
          達成率: <span className="text-emerald-600 font-bold">≥100%</span> /
          <span className="text-amber-600 font-semibold">80-99%</span> /
          <span className="text-red-600 font-semibold">&lt;80%</span>
        </span>
      </div>
    </main>
  );
}
