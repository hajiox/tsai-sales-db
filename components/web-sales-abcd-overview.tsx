"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AbcdPage from "./web-sales-abcd";
import { TRAFFIC_GUIDANCE, FINANCE_GUIDANCE, TRAFFIC_REASONS, FINANCE_REASONS } from "@/lib/web-sales-abcd/guidance";
import { CHANNELS, METRICS, type ImportInput, type Rank } from "@/lib/web-sales-abcd/model";

import { FINANCE_LABELS, type FinanceRank } from "@/lib/web-sales-abcd/finance";

type Overview = { channel: ImportInput["channel"]; snapshot: null | {
  id: string; period_start: string; period_end: string; created_at: string;
  finance?: { counts: Record<FinanceRank, number>; calculatedAt: string }; financeError?: string;
  item_count: number; metric: ImportInput["metric"]; counts: Record<Rank, number>;
} };
const ranks: Rank[] = ["A", "B", "C", "D", "保留"];
const rankColors = ["bg-emerald-50 text-emerald-800", "bg-amber-50 text-amber-800", "bg-blue-50 text-blue-800", "bg-violet-50 text-violet-800", "bg-slate-100 text-slate-700"];

export default function AbcdOverview() {
  const [revision, setRevision] = useState(0);
  const [channel, setChannel] = useState<ImportInput["channel"] | null>(null);
  const [rows, setRows] = useState<Overview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (channel) return;
    let cancelled = false;
    setLoading(true); setError("");
    fetch("/api/web-sales/abcd?view=overview", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "取得に失敗しました");
      if (!cancelled) setRows(data.channels);
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channel, revision]);

  if (channel) return <>
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-6"><button className="text-blue-700 hover:underline" onClick={() => setChannel(null)}>← 総合ダッシュボードに戻る</button></div>
    <AbcdPage key={channel} initialChannel={channel} />
  </>;
  const ready = rows.filter(row => row.snapshot).length;
  return <main className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto text-slate-900">
    <header><Link className="text-sm text-blue-700" href="/web-sales/dashboard">← WEB販売管理</Link><h1 className="text-2xl font-bold mt-2">ABCD分析 総合ダッシュボード</h1><p className="text-slate-600 mt-2">各ECの最新の分析状況と、商品ごとの改善優先度を確認できます。</p><button className="mt-3 rounded border px-4 py-2 bg-white disabled:opacity-50" disabled={loading} onClick={() => setRevision(v => v + 1)}>最新データで再計算</button></header>
    {error && <p role="alert" className="p-4 rounded bg-red-50 text-red-800">{error}</p>}
    {loading ? <p role="status" className="p-8 rounded-xl border bg-white">分析状況を読み込んでいます…</p> : !error && <>
      <section aria-label="データ取得状況" className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-slate-900 text-white p-5"><p className="text-sm text-slate-300">対象EC</p><p className="text-3xl font-bold mt-2">{rows.length}<span className="text-sm font-normal ml-2">店舗</span></p></div>
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">分析データあり</p><p className="text-3xl font-bold mt-2 text-emerald-700">{ready}<span className="text-sm font-normal ml-2">店舗</span></p></div>
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">データ未取得</p><p className="text-3xl font-bold mt-2 text-amber-700">{rows.length - ready}<span className="text-sm font-normal ml-2">店舗</span></p></div>
      </section>
      <p className="text-sm text-slate-600">各ECの最新保存データを表示しています。対象期間と購入率の定義はECごとに異なる場合があります。分類は各EC内での比較です。</p>
      <section aria-label="EC別の分析" className="grid lg:grid-cols-2 gap-5">{rows.map(row => <article key={row.channel} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-xl">{CHANNELS[row.channel]}</h2><span className={`text-sm rounded-full px-3 py-1 ${row.snapshot ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{row.snapshot ? "分析データあり" : "未取得"}</span></div>
        {row.snapshot ? <>
          <p className="font-medium">{row.snapshot.period_start} 〜 {row.snapshot.period_end}<span className="text-slate-500 ml-3">{row.snapshot.item_count.toLocaleString("ja-JP")}商品</span></p>
          <p className="text-sm font-semibold">アクセス・購入率のABCD</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{ranks.map((rank, index) => <div key={rank} className={`rounded-lg p-3 text-center ${rankColors[index]}`}><div className="text-sm">{rank}</div><div className="text-xl font-bold mt-1">{row.snapshot!.counts[rank].toLocaleString("ja-JP")}</div><p className="mt-2 text-sm leading-relaxed">{TRAFFIC_REASONS[rank]}</p><p className="mt-2 text-base font-bold leading-snug">だから：{TRAFFIC_GUIDANCE[rank]}</p></div>)}</div>
          <div className="border-t pt-3 space-y-2"><p className="text-sm font-semibold">収益を含めた総合評価（推計）</p>{row.snapshot.finance ? <><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{Object.entries(FINANCE_LABELS).map(([rank, label]) => <div key={rank} className={`rounded p-2 text-center ${rank === "赤字" ? "bg-red-50 text-red-800" : "bg-slate-50"}`}><p className="text-xs">{rank.length === 1 ? `収益${rank}` : rank}</p><p className="text-lg font-bold">{row.snapshot!.finance!.counts[rank as FinanceRank]}</p><p className="text-xs">{label}</p><p className="mt-2 text-sm leading-relaxed">{FINANCE_REASONS[rank as FinanceRank]}</p><p className="mt-2 text-base font-bold leading-snug">だから：{FINANCE_GUIDANCE[rank as FinanceRank]}</p></div>)}</div><p className="text-xs text-slate-500">売上・広告費控除後の利益率で評価。費用一部・未取得は保留。詳細で金額と理由を確認できます。</p></> : <p role="alert" className="text-sm text-amber-800">{row.snapshot.financeError || "収益未取得"}</p>}</div>
          <p className="text-sm text-slate-600">{METRICS[row.snapshot.metric]}</p>
          <p className="text-xs text-slate-500">保存日時：{new Date(row.snapshot.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
        </> : <div className="rounded-lg bg-slate-50 p-5 text-slate-600">商品別アクセスデータがまだありません。データを取得・取り込むと、ここに分類状況が表示されます。</div>}
        <button className="w-full rounded-lg bg-slate-900 text-white py-3 hover:bg-slate-800" onClick={() => setChannel(row.channel)}>{CHANNELS[row.channel]}の{row.snapshot ? "詳細分析を見る" : "データ取込へ"} →</button>
      </article>)}</section>
    </>}
  </main>;
}
