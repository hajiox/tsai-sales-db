"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { batchCategoryLabels, type BatchCategory, type BatchProgress } from "@/lib/recipe-reviews/batch-status";
type Batch={id:string;created_at:string;entries:BatchProgress[]};
const channels:Record<string,string>={amazon:"Amazon",rakuten:"楽天",yahoo:"Yahoo",base:"BASE"};
const sourceLabels:Record<string,string>={complete:"取得済み",no_reviews:"レビュー0件確認",partial:"一部取得・制限あり",blocked:"未取得・確認が必要"};
export default function ReviewBatch(){
 const [batch,setBatch]=useState<Batch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [filter,setFilter]=useState<BatchCategory|"all">("all");
 const [loaded,setLoaded]=useState(false);const submitting=useRef(false);
 const refresh=useCallback(async()=>{const r=await fetch("/api/recipe/reviews/batch",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);setBatch(d.batch);setLoaded(true);setError("");},[]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));const timer=setInterval(()=>void refresh().catch(e=>setError(e.message)),15000);return()=>clearInterval(timer)},[refresh]);
 const active=batch?.entries.filter(e=>e.state==="active").length||0;
 const completed=batch?.entries.filter(e=>e.category==="completed").length||0;
 const unresolved=(batch?.entries.length||0)-completed-active;
 const counts=Object.keys(batchCategoryLabels).map(key=>({key:key as BatchCategory,count:batch?.entries.filter(e=>e.category===key).length||0}));
 const visible=batch?.entries.filter(e=>filter==="all"||e.category===filter)||[];
 async function start(){if(submitting.current)return;submitting.current=true;setBusy(true);setError("");try{const r=await fetch("/api/recipe/reviews/batch",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error);await refresh();}catch(e){setError(e instanceof Error?e.message:"登録できませんでした");}finally{submitting.current=false;setBusy(false)}}
 return <section aria-label="全商品のレビュー巡回" className="my-5 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 md:p-6">
  <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-900">全商品のレビューをまとめて収集</h2><p className="mt-1 text-sm leading-6 text-slate-600">ネット専用の全商品が対象です。紐付け済みのAmazon・楽天・Yahoo・BASEを巡回し、保存から傾向分析まで順次実行します。</p></div>
  <button disabled={busy||active>0||!loaded} onClick={()=>void start()} className="shrink-0 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">{busy?"全商品を登録中…":active?"全商品レビュー巡回中":"全商品のレビューを自動巡回"}</button></div>
  <p className="mt-3 text-xs leading-5 text-slate-500">登録後は画面を閉じても続行します。事務所PCとログイン済みChromeが必要です。ログイン・許可待ちは自動では解除されません。取得範囲は既存の巡回仕様（各商品・EC最大200件）に従います。</p>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {batch&&<div className="mt-5 border-t border-blue-100 pt-4">
   <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><strong>{active?"巡回・分析を実行中":unresolved?"現在の実行なし・未完了の項目があります":"対象商品の確認が完了しました"}</strong><span>対象 {batch.entries.length}商品</span><span className="text-xs text-slate-500">開始 {new Date(batch.created_at).toLocaleString("ja-JP")}</span></div>
   <div className="mt-3 flex flex-wrap gap-2" aria-label="商品状況で絞り込み">
    <button aria-pressed={filter==="all"} onClick={()=>setFilter("all")} className={`rounded-lg border px-3 py-2 text-sm ${filter==="all"?"border-blue-700 bg-blue-700 text-white":"border-slate-200 bg-white text-slate-700"}`}>すべて {batch.entries.length}</button>
    {counts.filter(c=>c.count>0).map(c=><button key={c.key} aria-pressed={filter===c.key} onClick={()=>setFilter(c.key)} className={`rounded-lg border px-3 py-2 text-sm ${filter===c.key?"border-blue-700 bg-blue-700 text-white":"border-slate-200 bg-white text-slate-700"}`}>{batchCategoryLabels[c.key]} {c.count}</button>)}
   </div>
   <div role="progressbar" aria-label="全対象商品の完了率" aria-valuemin={0} aria-valuemax={batch.entries.length||1} aria-valuenow={completed} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{width:`${batch.entries.length?completed/batch.entries.length*100:0}%`}}/></div>
   <p className="mt-2 text-xs leading-5 text-slate-600">完了 {completed} / {batch.entries.length}商品。分析更新待ちや一部取得の商品にも保存済みレビューがあります。内訳は商品数で、EC別の確認事項は下の一覧に表示します。分析更新待ちは自動実行中ではありません。</p>
   <details className="mt-4" open={filter!=="all"||undefined}><summary className="cursor-pointer text-sm font-semibold text-blue-800">商品ごとの保存状況・残る対応を確認（{visible.length}商品）</summary>
    <ul className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto">{visible.map(e=><li key={e.recipeId} className="rounded-lg border border-slate-100 bg-white p-3 text-sm">
     <div className="flex flex-wrap justify-between gap-2"><Link className="font-medium text-blue-800 hover:underline" href={`/recipe/${e.recipeId}?fromTab=ネット専用&detailTab=reviews`}>{e.name}</Link><strong className={e.category==="completed"?"text-emerald-700":e.state==="active"?"text-blue-700":"text-amber-800"}>{batchCategoryLabels[e.category]}</strong></div>
     <p className="mt-1 break-words text-slate-600">{e.category==="excluded"?"現在はネット専用の対象外です。保存済みレビューと履歴は保持しています。":e.message}</p>
     {e.sources?.length>0&&<details className="mt-2"><summary className="cursor-pointer text-xs text-slate-600">EC別の取得結果と理由（{e.sources.length}件）</summary><ul className="mt-2 space-y-2">{e.sources.map(s=><li key={`${s.channel}:${s.productKey}`} className="border-l-2 border-slate-200 pl-3 text-xs leading-5"><strong>{channels[s.channel]||s.channel} · {s.productKey} · {sourceLabels[s.status]||s.status}</strong><p>今回の収集記録 {s.count}件</p><p className="break-words text-slate-600">{s.message}</p></li>)}</ul></details>}
    </li>)}</ul>
   </details>
  </div>}
 </section>;
}
