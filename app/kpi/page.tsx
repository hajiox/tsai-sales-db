// ver.5 — 売上KPIダッシュボード（“各システムの月次合計をそのままコピー”方式）
// 仕様: DB内で各システムが公開する「月次合計の最終ビュー」だけをUNIONし、
//       欠けている月×チャネルは computed_v2 で補完した
//       kpi.kpi_sales_monthly_unified_v1 をソースに採用。UI側では一切再計算しない。
// 期待カラム: (channel_code text in ['SHOKU','STORE','WEB','WHOLESALE'], month date (月初), amount bigint)
// 範囲: 直近13ヶ月（今月まで）。KPIは直近で“月合計>0”の月を採用。

import { Pool } from "pg";
import React from "react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

interface Row { channel_code: string; fiscal_month: string; amount: number }
const jpy = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: 0 }));
const ym = (isoDate: string) => isoDate.slice(0, 7);

async function fetchData(): Promise<Row[]> {
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
  return rows.map((r: any) => ({
    channel_code: String(r.channel_code ?? ""),
    fiscal_month: new Date(r.fiscal_month).toISOString().slice(0, 10),
    amount: Number(r.amount),
  }));
}

function computePivot(rows: Row[]) {
  const map = new Map<string, number>(); // key: channel|YYYY-MM
  const monthsSet = new Set<string>();

  for (const r of rows) {
    const m = ym(r.fiscal_month);
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

  return { months, channels, map, monthTotals, latestTotal, momDelta, momPct, yoyDelta, yoyPct, perChannel, latestIdx };
}

export default async function Page() {
  const rows = await fetchData();
  const { months, channels, map, monthTotals, latestTotal, momDelta, momPct, yoyDelta, yoyPct, perChannel, latestIdx } = computePivot(rows);
  const latestLabel = months.length ? months[latestIdx] : "—";

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">売上KPIダッシュボード</h1>
          <p className="text-sm text-muted-foreground">直近13ヶ月（今月まで）/ データソース: kpi.kpi_sales_monthly_unified_v1（final_v1 を優先し、欠けた月は computed_v2 で補完）</p>
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

      {/* ピボット表 */}
      <section className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white/80 backdrop-blur border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground">部門 / Channel</th>
              {months.map((m) => (
                <th key={m} className="border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">{m}</th>
              ))}
              <th className="border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">合計</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c, i) => {
              const rowTotal = months.reduce((s, m) => s + (map.get(`${c}|${m}`) || 0), 0);
              return (
                <tr key={c} className={i % 2 ? "bg-muted/20" : "bg-white"}>
                  <td className="sticky left-0 z-10 bg-inherit border-b px-3 py-2 text-sm font-medium">{CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL]}</td>
                  {months.map((m) => (
                    <td key={m} className="border-b px-3 py-2 text-right tabular-nums">¥{jpy(map.get(`${c}|${m}`) || 0)}</td>
                  ))}
                  <td className="border-b px-3 py-2 text-right font-semibold tabular-nums">¥{jpy(rowTotal)}</td>
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 z-10 bg-white border-t px-3 py-2 text-sm font-semibold">月合計</td>
              {monthTotals.map((v, idx) => (
                <td key={idx} className="border-t px-3 py-2 text-right font-semibold tabular-nums">¥{jpy(v)}</td>
              ))}
              <td className="border-t px-3 py-2 text-right font-semibold tabular-nums">¥{jpy(monthTotals.reduce((a, b) => a + b, 0))}</td>
            </tr>
          </tbody>
        </table>
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
