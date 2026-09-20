"use client";

import { useMemo, useState } from "react";
import { FINANCE_LABELS, type FinanceAnalysis } from "@/lib/web-sales-abcd/finance";
import type { ResultItem } from "@/lib/web-sales-abcd/model";

const money = (n: number | null) => n == null ? "未取得" : n.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
const rate = (n: number | null) => n == null ? "—" : `${n.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}%`;
export default function AbcdFinance({ finance, items, error }: { finance?: FinanceAnalysis; items: ResultItem[]; error?: string }) {
  const [filter, setFilter] = useState("全て");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("sales");
  const source = useMemo(() => new Map(items.map(i => [i.key, i])), [items]);
  const rows = useMemo(() => (finance?.items ?? []).filter(i => (filter === "全て" || i.rank === filter)
    && `${i.key} ${source.get(i.key)?.name ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === "loss" ? (a.profit ?? Infinity) - (b.profit ?? Infinity)
      : sort === "margin" ? (b.margin ?? -Infinity) - (a.margin ?? -Infinity)
        : (b.sales ?? -Infinity) - (a.sales ?? -Infinity)), [finance, filter, search, sort, source]);
  if (!finance) return <section className="rounded-xl border p-5 bg-amber-50"><h2 className="font-bold">収益を含めた総合評価</h2><p role="alert" className="mt-2">{error || "収益データを取得できませんでした。再読み込みしてください。"}</p><p className="text-sm mt-2">アクセス・購入率のABCD分析は引き続き確認できます。</p></section>;
  return <section aria-label="収益を含めた総合評価" className="rounded-xl border bg-white p-4 md:p-5 space-y-4">
    <div><h2 className="text-xl font-bold">収益を含めた総合評価</h2><p className="text-sm text-slate-600 mt-2">売上金額と広告費控除後の利益率で収益A〜Dを判定し、アクセスABCDと合わせて対応候補を表示します。</p></div>
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">{Object.entries(FINANCE_LABELS).map(([rank, label]) => <button key={rank} onClick={() => setFilter(rank)} aria-pressed={filter === rank} className={`rounded-lg border p-3 text-left ${rank === "赤字" ? "bg-red-50 text-red-800" : rank === "保留" ? "bg-slate-50" : "bg-blue-50 text-blue-950"} ${filter === rank ? "ring-2 ring-blue-600" : ""}`}><p className="font-bold">{rank.length === 1 ? `収益${rank}` : rank}：{finance.counts[rank as keyof typeof FINANCE_LABELS]}商品</p><p className="text-xs mt-1">{label}</p></button>)}</div>
    <p className="text-sm">基準：売上 {money(finance.salesThreshold)}円 ／ 利益率 {rate(finance.marginThreshold)}。赤字は売上規模にかかわらず別表示します。</p>
    <p className="text-sm text-slate-600">計算：売上 − 保存原価 − EC費用 − 広告費。すべて商品別費用を配分した推計です。「費用一部」の利益は取得済み費用だけを控除した参考額で、判定は保留です。</p>
    <details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">計算・配分方法と判定基準</summary><ul className="mt-3 space-y-2 list-disc pl-5">{finance.notes.map(note => <li key={note}>{note}</li>)}</ul><p className="mt-3">収益A：売上高・利益率高 ／ B：売上高・利益率低 ／ C：売上低・利益率高 ／ D：売上低・利益率低。実績から算出する相対評価です。会社全体の営業利益・純利益ではありません。</p><p className="mt-2 text-slate-500">更新：{new Date(finance.calculatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} ／ {finance.rule}</p></details>
    <div className="flex flex-wrap gap-3"><label className="text-sm">収益評価<select className="block border rounded px-3 py-2" value={filter} onChange={e => setFilter(e.target.value)}>{["全て", ...Object.keys(FINANCE_LABELS)].map(v => <option key={v}>{v}</option>)}</select></label><label className="text-sm">収益の商品検索<input className="block border rounded px-3 py-2" value={search} onChange={e => setSearch(e.target.value)} placeholder="商品名・ID" /></label><label className="text-sm">並び順<select className="block border rounded px-3 py-2" value={sort} onChange={e => setSort(e.target.value)}><option value="sales">売上が多い順</option><option value="loss">利益が少ない順</option><option value="margin">利益率が高い順</option></select></label></div>
    <div className="overflow-auto border rounded-lg max-h-[550px]"><table className="min-w-[1400px] w-full text-sm"><thead className="bg-slate-100 sticky top-0"><tr>{["商品", "収益評価", "アクセスABCD", "月次売上（円）", "保存原価（円）", "配分EC費用（円）", "配分広告費（円）", "控除後利益（円）", "控除後利益率", "計算状態", "対応候補・保留理由"].map(v => <th key={v} className="p-3 text-left whitespace-nowrap">{v}</th>)}</tr></thead><tbody>{rows.map(i => <tr key={i.key} className={`border-t ${i.rank === "赤字" ? "bg-red-50" : ""}`}><td className="p-3 min-w-64 max-w-80">{source.get(i.key)?.name || i.key}<p className="text-xs text-slate-500">{i.key}</p></td><td className="p-3 font-bold">{i.rank}<p className="text-xs font-normal whitespace-nowrap">{FINANCE_LABELS[i.rank]}</p></td><td className="p-3">{source.get(i.key)?.rank || "—"}</td><td className="p-3">{money(i.sales)}</td><td className="p-3">{money(i.productCost)}</td><td className="p-3">{money(i.ecCosts)}</td><td className="p-3">{money(i.adCost)}</td><td className={`p-3 font-medium ${i.profit != null && i.profit < 0 ? "text-red-700" : ""}`}>{money(i.profit)}</td><td className="p-3">{rate(i.margin)}</td><td className="p-3 whitespace-nowrap">{i.quality}</td><td className="p-3 min-w-64">{i.reason || i.action}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5">該当する商品はありません。</p>}</div>
    <p className="text-xs text-slate-500">表示金額は円単位に丸め、判定は丸め前の値を使用。既存の分析履歴は保持し、収益は再読み込み時の最新保存値で再計算します。Excelには同じ計算結果と更新日時を出力します。</p>
  </section>;
}
