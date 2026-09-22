"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
type Batch={id:string;created_at:string;entries:{recipeId:string;name:string;state:string;message:string}[]};
export default function ReviewBatch(){
 const [batch,setBatch]=useState<Batch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [loaded,setLoaded]=useState(false);const submitting=useRef(false);
 const refresh=useCallback(async()=>{const r=await fetch("/api/recipe/reviews/batch",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);setBatch(d.batch);setLoaded(true);setError("");},[]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));const timer=setInterval(()=>void refresh().catch(e=>setError(e.message)),15000);return()=>clearInterval(timer)},[refresh]);
 const active=batch?.entries.filter(e=>e.state==="active").length||0;
 const completed=batch?.entries.filter(e=>e.state==="completed").length||0;
 const attention=batch?.entries.filter(e=>e.state==="attention"||e.state==="unmapped").length||0;
 async function start(){if(submitting.current)return;submitting.current=true;setBusy(true);setError("");try{const r=await fetch("/api/recipe/reviews/batch",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error);await refresh();}catch(e){setError(e instanceof Error?e.message:"登録できませんでした");}finally{submitting.current=false;setBusy(false)}}
 return <section aria-label="全商品のレビュー巡回" className="my-5 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 md:p-6">
  <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-900">全商品のレビューをまとめて収集</h2><p className="mt-1 text-sm leading-6 text-slate-600">ネット専用の全商品が対象です。紐付け済みのAmazon・楽天・Yahoo・BASEを巡回し、保存から傾向分析まで順次実行します。</p></div>
  <button disabled={busy||active>0||!loaded} onClick={()=>void start()} className="shrink-0 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">{busy?"全商品を登録中…":active?"全商品レビュー巡回中":"全商品のレビューを自動巡回"}</button></div>
  <p className="mt-3 text-xs leading-5 text-slate-500">登録後は画面を閉じても続行します。事務所PCとログイン済みChromeが必要です。ログイン・許可待ちは自動では解除されません。取得範囲は既存の巡回仕様（各商品・EC最大200件）に従います。</p>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {batch&&<div className="mt-5 border-t border-blue-100 pt-4"><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><strong>{active?"巡回・分析を実行中":"今回の処理は終了"}</strong><span>対象 {batch.entries.length}商品</span><span className="font-semibold text-emerald-700">完了 {completed}</span><span className="font-semibold text-blue-700">処理中・待機 {active}</span><span className="font-semibold text-amber-800">未設定・要確認 {attention}</span><span className="text-xs text-slate-500">開始 {new Date(batch.created_at).toLocaleString("ja-JP")}</span></div>
   <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{width:`${batch.entries.length?(completed+attention)/batch.entries.length*100:0}%`}}/></div>
   <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-blue-800">商品ごとの進捗・未取得を確認</summary><ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">{batch.entries.map(e=><li key={e.recipeId} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-100 bg-white p-3 text-sm"><Link className="font-medium text-blue-800 hover:underline" href={`/recipe/${e.recipeId}?fromTab=ネット専用&detailTab=reviews`}>{e.name}</Link><span className={e.state==="completed"?"text-emerald-700":e.state==="active"?"text-blue-700":"text-amber-800"}>{e.message}</span></li>)}</ul></details>
  </div>}
 </section>;
}
