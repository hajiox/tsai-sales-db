// ver.5 — 売上KPIダッシュボード（“各システムの月次合計をそのままコピー”方式）
// 仕様: DB内で各システムが公開する「月次合計の最終ビュー」だけをUNIONし、
//       欠けている月×チャネルは computed_v2 で補完した
//       kpi.kpi_sales_monthly_unified_v1 をソースに採用。UI側では一切再計算しない。
// 期待カラム: (channel_code text in ['SHOKU','STORE','WEB','WHOLESALE'], month date (月初), amount bigint)
// 範囲: 直近13ヶ月（今月まで）。KPIは直近で“月合計>0”の月を採用。

import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { Pool } from "pg";
import React from "react";

import { getWholesaleOemOverview } from "@/server/db/kpi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALL_CHANNELS = ["SHOKU", "STORE", "WEB", "WHOLESALE"] as const;
const CHANNEL_LABEL: Record<(typeof ALL_CHANNELS)[number], string> = {
  SHOKU: "食のブランド館（道の駅）",
  STORE: "会津ブランド館（店舗）",
  WEB: "会津ブランド館（ネット販売）",
  WHOLESALE: "外販・OEM（本社）",
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
});

interface UnifiedRow { channel_code: string; fiscal_month: string; amount: number }
const jpy = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: 0 }));
const ym = (isoDate: string) => isoDate.slice(0, 7);

async function fetchData(): Promise<UnifiedRow[]> {
  if (!process.env.DATABASE_URL) throw new Error("環境変数 DATABASE_URL が未設定です。Postgres接続文字列を設定してください。");
  // final_v1 を優先し、欠けている月×チャネルだけ computed_v2 で補完した
  // “確定値” ビューのみ参照
  const sql = `
    WITH range AS (
      SELECT date_trunc('month', current_date - interval '12 months') AS from_m,
             date_trunc('month', current_date)                         AS to_m
    )
    SELECT channel_code,
           (month)::date AS fiscal_month,
           amount::bigint AS amount
    FROM kpi.kpi_sales_monthly_unified_v1, range
    WHERE month BETWEEN from_m AND to_m
    ORDER BY fiscal_month ASC, channel_code ASC;
  `;
  const { rows } = await pool.query(sql);
  const mapped = rows.map((r: any) => ({
    channel_code: String(r.channel_code ?? ""),
    fiscal_month: new Date(r.fiscal_month).toISOString().slice(0, 10),
    amount: Number(r.amount),
  }));

  const wholesaleMonths = Array.from(
    new Set(
      mapped
        .filter((row) => row.channel_code === "WHOLESALE")
        .map((row) => row.fiscal_month)
    )
  );

  if (wholesaleMonths.length === 0) {
    return mapped;
  }

  const totals = await Promise.all(
    wholesaleMonths.map(async (month) => {
      const overview = await getWholesaleOemOverview(month);
      return [month, Number(overview.total_amount ?? 0)] as const;
    })
  );

  const totalMap = new Map(totals);

  return mapped.map((row) =>
    row.channel_code === "WHOLESALE"
      ? { ...row, amount: totalMap.get(row.fiscal_month) ?? 0 }
      : row
  );
}

function computePivot(rows: UnifiedRow[]) {
  const map = new Map<string, number>(); // key: channel|YYYY-MM-01
  const monthsSet = new Set<string>();

  for (const r of rows) {
    const monthStart = startOfMonth(parseISO(r.fiscal_month));
    const m = format(monthStart, "yyyy-MM-01");
    monthsSet.add(m);
    const key = `${r.channel_code}|${m}`;
    map.set(key, (map.get(key) || 0) + r.amount);
  }

  const months = Array.from(monthsSet).sort();
  const channels = [...ALL_CHANNELS];

  const monthTotals = months.map((m) => channels.reduce((sum, c) => sum + (map.get(`${c}|${m}`) || 0), 0));

  // 直近で合計>0の月を採用（なければ末尾）
  const lastIdx = months.length - 1;
  let latestIdx = lastIdx;
  for (let i = lastIdx; i >= 0; i--) {
    if ((monthTotals[i] || 0) > 0) { latestIdx = i; break; }
  }
  const prevIdx = latestIdx - 1;
  const yoyIdx  = latestIdx - 12;

  const latestTotal = latestIdx >= 0 ? monthTotals[latestIdx] : null;
  const prevTotal   = prevIdx   >= 0 ? monthTotals[prevIdx]   : null;
  const yoyTotal    = yoyIdx    >= 0 ? monthTotals[yoyIdx]    : null;

  const safePct = (num: number | null, den: number | null) => (num != null && den != null && den !== 0 ? (num / den - 1) * 100 : null);
  const momDelta = latestTotal != null && prevTotal != null ? latestTotal - prevTotal : null;
  const momPct   = safePct(latestTotal, prevTotal);
  const yoyDelta = latestTotal != null && yoyTotal != null ? latestTotal - yoyTotal : null;
  const yoyPct   = safePct(latestTotal, yoyTotal);

  type ChannelKPI = { channel: (typeof ALL_CHANNELS)[number]; latest: number | null; yoyDelta: number | null; yoyPct: number | null };
  const perChannel: ChannelKPI[] = channels.map((c) => {
    const latestVal = latestIdx >= 0 ? (map.get(`${c}|${months[latestIdx]}`) || 0) : null;
    const yoyVal    = yoyIdx    >= 0 ? (map.get(`${c}|${months[yoyIdx]}`)    || 0) : null;
    const d = latestVal != null && yoyVal != null ? latestVal - yoyVal : null;
    const p = safePct(latestVal, yoyVal);
    return { channel: c, latest: latestVal, yoyDelta: d, yoyPct: p };
  });

  const latestMonthISO = latestIdx >= 0 ? months[latestIdx] : null;

  return { months, channels, map, monthTotals, latestTotal, momDelta, momPct, yoyDelta, yoyPct, perChannel, latestIdx, latestMonthISO };
}

export default async function Page() {
  const unified = await fetchData();
  const { channels, map, latestTotal, momDelta, momPct, yoyDelta, yoyPct, perChannel, latestMonthISO } = computePivot(unified);
  const months = buildLast12Months(latestMonthISO);
  const tableRows = channels.map((c) => ({
    label: CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL],
    values: months.map((m) => map.get(`${c}|${m}`) ?? 0),
  }));
  const latestLabel = latestMonthISO ? ym(latestMonthISO) : "—";

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">売上KPIダッシュボード</h1>
          <p className="text-sm text-muted-foreground">直近12ヶ月（今月まで）/ データソース: kpi.kpi_sales_monthly_unified_v1（actuals → final → computed の優先順位で採用）</p>
        </div>
        <div className="text-sm text-muted-foreground">最新月（検知）: {latestLabel}</div>
      </header>

      {/* トータルKPI */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title={`{${latestLabel}} 売上合計`} value={`¥${jpy(latestTotal ?? 0)}`} sub={"（税抜/税込は各システムの定義に依存）"} />
        <KpiCard title="前月比 (MoM)" value={momDelta == null ? "—" : `${momDelta >= 0 ? "+" : ""}¥${jpy(momDelta)}`} sub={momPct == null ? "—" : `${momPct >= 0 ? "+" : ""}${momPct.toFixed(1)}%`} />
        <KpiCard title="前年比 (YoY)" value={yoyDelta == null ? "—" : `${yoyDelta >= 0 ? "+" : ""}¥${jpy(yoyDelta)}`} sub={yoyPct == null ? "—" : `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}%`} />
      </section>

      {/* チャネル別KPI（今月） */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {perChannel.map((k) => (
          <div key={k.channel} className="rounded-2xl border p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{CHANNEL_LABEL[k.channel as keyof typeof CHANNEL_LABEL]}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">¥{jpy(k.latest ?? 0)}</div>
            <div className="mt-1 text-xs text-muted-foreground">YoY: {k.yoyDelta == null ? "—" : `${k.yoyDelta >= 0 ? "+" : ""}¥${jpy(k.yoyDelta)} (${k.yoyPct == null ? "—" : `${k.yoyPct >= 0 ? "+" : ""}${k.yoyPct.toFixed(1)}%`})`}</div>
          </div>
        ))}
      </section>

      {/* 月次マトリクス */}
      <section className="overflow-x-auto">
        <MonthlyTable months={months} rows={tableRows} />
      </section>

      <footer className="text-xs text-muted-foreground space-y-1">
        <div>※ 本画面は各システムが公開する「月次合計：確定値」に、欠けている月×チャネルのみ computed_v2 で補完したビューを表示（UI側で再計算なし）。</div>
        <div>次ステップ（ver.6）: ①年度セレクタ ②目標JOIN（達成率%） ③CSV ④Recharts</div>
      </footer>
    </div>
  );
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

// 金額フォーマット
const fmtJPY = (v: number | null | undefined) =>
  v == null ? "—" : `¥${jpy(v)}`;

// 直近12ヶ月のラベルを生成（"YYYY-MM-01"）
function buildLast12Months(latestMonthISO: string | null): string[] {
  if (!latestMonthISO) return [];
  const latest = startOfMonth(parseISO(latestMonthISO));
  const start = subMonths(latest, 11);
  return Array.from({ length: 12 }, (_, i) => format(addMonths(start, i), "yyyy-MM-01"));
}

type Row = { label: string; values: (number | null | undefined)[] };

function MonthlyTable({
  months,
  rows,
  showFooterTotal = true,
}: {
  months: string[]; // 長さ12 / ISO日付（月初）
  rows: Row[]; // 各行 values は長さ12
  showFooterTotal?: boolean;
}) {
  const headCell = "px-2 py-1 text-[11px] font-semibold";
  const cell = "px-2 py-1 text-[11px] leading-tight tabular-nums";
  const border = "border-b border-gray-100";

  const totals = months.map((_, i) =>
    rows.reduce<number>((sum, r) => sum + (r.values[i] ?? 0), 0)
  );

  return (
    <div className="w-full">
      <table className="w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          <col className="w-[160px]" />
          {months.map((_, i) => (
            <col key={i} className="w-[88px]" />
          ))}
        </colgroup>

        <thead>
          <tr className="bg-gray-50">
            <th className={`${headCell} text-left sticky left-0 z-10 bg-gray-50 ${border}`}>
              部門 / Channel
            </th>
            {months.map((m) => (
              <th key={m} className={`${headCell} text-right ${border}`}>
                {ym(m)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="odd:bg-white even:bg-gray-50">
              <th
                className={`${cell} text-left sticky left-0 z-10 bg-inherit ${border} font-medium truncate`}
                title={r.label}
              >
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={i} className={`${cell} text-right ${border}`}>
                  {fmtJPY(v ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        {showFooterTotal && (
          <tfoot>
            <tr className="bg-gray-50">
              <th className={`${headCell} text-left sticky left-0 z-10 bg-gray-50 ${border}`}>
                月合計
              </th>
              {totals.map((v, i) => (
                <td
                  key={i}
                  className={`${cell} text-right font-semibold ${border}`}
                >
                  {fmtJPY(v)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
