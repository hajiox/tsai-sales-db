// ver.2 — 売上KPIダッシュボード（年間目標数値の並びに合わせ、WEBを必ず表示）
// 目的: kpi.kpi_sales_monthly_computed_v2 を参照し、直近13ヶ月の売上をKPIカード+ピボット表で表示。
//       チャネル順は PDF「年間目標数値」の並びを想定（食のブランド館→会津ブランド館(店舗)→会津ブランド館(ネット)→外販・OEM）。
// 前提: 環境変数 DATABASE_URL（Postgres接続, pooler:6543 + ?sslmode=require 推奨）
// 依存: pg（サーバーのみ） — 未導入なら: `pnpm add pg`
// ルート: /kpi

import { Pool } from "pg";
import React from "react";

export const runtime = "nodejs"; // Node ランタイム固定
export const dynamic = "force-dynamic"; // 常に最新を取得

// チャネルは“必ず”この順で表示（ゼロでも表示）
const ALL_CHANNELS = ["SHOKU", "STORE", "WEB", "WHOLESALE"] as const;
const CHANNEL_LABEL: Record<(typeof ALL_CHANNELS)[number], string> = {
  SHOKU: "食のブランド館（道の駅）",
  STORE: "会津ブランド館（店舗）",
  WEB: "会津ブランド館（ネット販売）",
  WHOLESALE: "外販・OEM（本社）",
};

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
  // 集計Map: key=channel|YYYY-MM
  const map = new Map<string, number>();
  const monthsSet = new Set<string>();

  for (const r of rows) {
    const m = ym(r.fiscal_month);
    monthsSet.add(m);
    const key = `${r.channel_code}|${m}`;
    map.set(key, (map.get(key) || 0) + r.amount);
  }

  const months = Array.from(monthsSet).sort();
  const channels = [...ALL_CHANNELS]; // 表示順は固定

  // 月別合計
  const monthTotals = months.map((m) =>
    channels.reduce((sum, c) => sum + (map.get(`${c}|${m}`) || 0), 0)
  );

  // 最新月/前月/前年比（トータル）
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

  // チャネル別KPI（今月・YoY）
  type ChannelKPI = {
    channel: (typeof ALL_CHANNELS)[number];
    latest: number | null;
    yoyDelta: number | null;
    yoyPct: number | null;
  };
  const perChannel: ChannelKPI[] = channels.map((c) => {
    const latestVal = latestIdx >= 0 ? (map.get(`${c}|${months[latestIdx]}`) || 0) : null;
    const yoyVal = yoyIdx >= 0 ? (map.get(`${c}|${months[yoyIdx]}`) || 0) : null;

    const d = latestVal != null && yoyVal != null ? latestVal - yoyVal : null;
    const p = latestVal != null && yoyVal ? (latestVal / yoyVal - 1) * 100 : null;

    return { channel: c, latest: latestVal, yoyDelta: d, yoyPct: p };
  });

  return {
    months,
    channels,
    map,
    monthTotals,
    latestTotal,
    momDelta,
    momPct,
    yoyDelta,
    yoyPct,
    perChannel,
  };
}

export default async function Page() {
  const rows = await fetchData();
  const {
    months,
    channels,
    map,
    monthTotals,
    latestTotal,
    momDelta,
    momPct,
    yoyDelta,
    yoyPct,
    perChannel,
  } = computePivot(rows);

  const latestLabel = months.length ? months[months.length - 1] : "—";

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">売上KPIダッシュボード</h1>
          <p className="text-sm text-muted-foreground">
            直近13ヶ月 / ソース: kpi.kpi_sales_monthly_computed_v2 / 並び: 食のブランド館→店舗→WEB→外販
          </p>
        </div>
        <div className="text-sm text-muted-foreground">最新月: {latestLabel}</div>
      </header>

      {/* トータルKPI */}
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

      {/* チャネル別KPI（今月） */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {perChannel.map((k) => (
          <div key={k.channel} className="rounded-2xl border p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{CHANNEL_LABEL[k.channel as keyof typeof CHANNEL_LABEL]}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">¥{jpy(k.latest ?? 0)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              YoY: {k.yoyDelta == null ? "—" : `${k.yoyDelta >= 0 ? "+" : ""}¥${jpy(k.yoyDelta)} (${k.yoyPct == null ? "—" : `${k.yoyPct >= 0 ? "+" : ""}${k.yoyPct.toFixed(1)}%`})`}
            </div>
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
                  <td className="sticky left-0 z-10 bg-inherit border-b px-3 py-2 text-sm font-medium">{CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL]}</td>
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

      <footer className="text-xs text-muted-foreground space-y-1">
        <div>※ この画面は PDF「年間目標数値」の構成に準拠したチャネル順で表示しています（WEBはゼロでも必ず表示）。</div>
        <div>次ステップ（ver.3）予定: ①目標金額テーブルのJOIN（達成率%をカードに） ②年度切替 ③CSVエクスポート ④Rechartsグラフ</div>
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
