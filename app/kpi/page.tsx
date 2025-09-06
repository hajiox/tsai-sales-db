// ver.1 — 売上KPIダッシュボード（SSR, 1ファイル版）
// 目的: kpi.kpi_sales_monthly_computed_v2 を参照し、直近13ヶ月の売上をKPIカード+ピボット表で表示
// 前提: 環境変数 DATABASE_URL（Postgres接続, pooler:6543 + ?sslmode=require 推奨）
// 依存: pg（サーバーのみ） — 未導入なら: `pnpm add pg`
// ルート: /kpi

import { Pool } from "pg";
import React from "react";

export const runtime = "nodejs"; // Node ランタイム固定
export const dynamic = "force-dynamic"; // 常に最新を取得

// 単一Pool（Lambda再利用でも安全なようにmodule scopeで保持）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=")
    ? undefined
    : { rejectUnauthorized: false },
});

// 型
interface Row {
  channel_code: string;
  fiscal_month: string; // ISO (YYYY-MM-01)
  amount: number;
}

// 通貨フォーマッタ
const jpy = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

// 月ラベル（YYYY-MM）
const ym = (isoDate: string) => isoDate.slice(0, 7);

async function fetchData(): Promise<Row[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "環境変数 DATABASE_URL が未設定です。Postgres接続文字列を設定してください。"
    );
  }

  const sql = `
    SELECT
      channel_code,
      (fiscal_month)::date AS fiscal_month,
      actual_amount_yen::bigint AS amount
    FROM kpi.kpi_sales_monthly_computed_v2
    WHERE fiscal_month >= date_trunc('month', (current_date - interval '12 months'))
    ORDER BY fiscal_month ASC, channel_code ASC;
  `;

  const { rows } = await pool.query(sql);
  // fiscal_monthをISO文字列に統一（タイムゾーン影響排除）
  return rows.map((r: any) => ({
    channel_code: r.channel_code as string,
    fiscal_month: new Date(r.fiscal_month).toISOString().slice(0, 10),
    amount: Number(r.amount),
  }));
}

function computePivot(rows: Row[]) {
  const monthsSet = new Set<string>();
  const channelsSet = new Set<string>();
  const map = new Map<string, number>(); // key: channel|month(YYYY-MM)

  for (const r of rows) {
    const m = ym(r.fiscal_month);
    monthsSet.add(m);
    channelsSet.add(r.channel_code);
    map.set(`${r.channel_code}|${m}`, (map.get(`${r.channel_code}|${m}`) || 0) + r.amount);
  }

  const months = Array.from(monthsSet).sort();
  const channels = Array.from(channelsSet).sort();

  // 月別合計
  const monthTotals = months.map((m) =>
    channels.reduce((sum, c) => sum + (map.get(`${c}|${m}`) || 0), 0)
  );

  // 最新月/前月/前年比
  const latestIdx = months.length - 1;
  const prevIdx = latestIdx - 1;
  const yoyIdx = latestIdx - 12;

  const latestTotal = latestIdx >= 0 ? monthTotals[latestIdx] : null;
  const prevTotal = prevIdx >= 0 ? monthTotals[prevIdx] : null;
  const yoyTotal = yoyIdx >= 0 ? monthTotals[yoyIdx] : null;

  const momDelta =
    latestTotal != null && prevTotal != null ? latestTotal - prevTotal : null;
  const momPct =
    latestTotal != null && prevTotal ? (latestTotal / prevTotal - 1) * 100 : null;

  const yoyDelta =
    latestTotal != null && yoyTotal != null ? latestTotal - yoyTotal : null;
  const yoyPct =
    latestTotal != null && yoyTotal ? (latestTotal / yoyTotal - 1) * 100 : null;

  return { months, channels, map, monthTotals, latestTotal, momDelta, momPct, yoyDelta, yoyPct };
}

export default async function Page() {
  const rows = await fetchData();
  const { months, channels, map, monthTotals, latestTotal, momDelta, momPct, yoyDelta, yoyPct } =
    computePivot(rows);

  const latestLabel = months.length ? months[months.length - 1] : "—";

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">売上KPIダッシュボード</h1>
          <p className="text-sm text-muted-foreground">直近13ヶ月 / ソース: kpi.kpi_sales_monthly_computed_v2</p>
        </div>
        <div className="text-sm text-muted-foreground">最新月: {latestLabel}</div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title={`{${latestLabel}} 売上合計`} value={`¥${jpy(latestTotal ?? 0)}`} sub={"（税抜/税込はデータ定義に依存）"} />
        <KpiCard
          title="前月比 (MoM)"
          value={momDelta == null ? "—" : `${momDelta >= 0 ? "+" : ""}¥${jpy(momDelta)}`}
          sub={momPct == null ? "—" : `${momPct >= 0 ? "+" : ""}${momPct.toFixed(1)}%`}
        />
        <KpiCard
          title="前年比 (YoY)"
          value={yoyDelta == null ? "—" : `${yoyDelta >= 0 ? "+" : ""}¥${jpy(yoyDelta)}`}
          sub={yoyPct == null ? "—" : `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}%`}
        />
      </section>

      {/* ピボット表 */}
      <section className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white/80 backdrop-blur border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground">Channel</th>
              {months.map((m) => (
                <th key={m} className="border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  {m}
                </th>
              ))}
              <th className="border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">合計</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c, i) => {
              const rowTotal = months.reduce((s, m) => s + (map.get(`${c}|${m}`) || 0), 0);
              return (
                <tr key={c} className={i % 2 ? "bg-muted/20" : "bg-white"}>
                  <td className="sticky left-0 z-10 bg-inherit border-b px-3 py-2 text-sm font-medium">{c}</td>
                  {months.map((m) => (
                    <td key={m} className="border-b px-3 py-2 text-right tabular-nums">¥{jpy(map.get(`${c}|${m}`) || 0)}</td>
                  ))}
                  <td className="border-b px-3 py-2 text-right font-semibold tabular-nums">¥{jpy(rowTotal)}</td>
                </tr>
              );
            })}
            {/* 月合計行 */}
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

      <footer className="text-xs text-muted-foreground">
        次ステップ（ver.2）予定: ①月次スタック棒グラフ（Recharts）②チャネルフィルタ/年度切替 ③CSVエクスポート
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
