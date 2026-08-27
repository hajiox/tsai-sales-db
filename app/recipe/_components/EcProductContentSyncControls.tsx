"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, History, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  EC_PRODUCT_CONTENT_MAX_CHARACTERS,
  EC_PRODUCT_CONTENT_TARGETS,
  buildEcProductContents,
  ecProductContentCharacterCount,
  getEcProductContentTargetLabel,
  type EcProductContentJobView,
  type EcProductContentTarget,
} from "@/lib/ec-product-content-codex";

type Props = {
  recipeId: string;
  recipeName: string;
  productPoints: string;
  webDescription: string;
  expectedRecipeSnapshot: Record<string, unknown>;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
};

const FINAL_STATUSES = new Set(["waiting_for_user", "needs_review", "completed", "failed", "cancelled"]);
const SITE_COLORS: Record<EcProductContentTarget, string> = {
  amazon: "bg-orange-500 hover:bg-orange-600",
  rakuten: "bg-red-500 hover:bg-red-600",
  yahoo: "bg-violet-600 hover:bg-violet-700",
  mercari: "bg-sky-500 hover:bg-sky-600",
  base: "bg-emerald-600 hover:bg-emerald-700",
  qoo10: "bg-pink-500 hover:bg-pink-600",
  tiktok: "bg-teal-500 hover:bg-teal-600",
};

function statusLabel(status: EcProductContentJobView["status"]) {
  return ({ queued: "待機中", running: "実行中", waiting_for_user: "操作待ち", needs_review: "確認待ち", completed: "完了", failed: "失敗", cancelled: "取消済み" } as const)[status];
}

function siteStatusLabel(status: string) {
  return ({ updated: "反映済み", submitted_pending: "反映確認待ち", not_found: "対象なし", blocked: "未完了" } as Record<string, string>)[status] || status;
}

export default function EcProductContentSyncControls({
  recipeId,
  recipeName,
  productPoints,
  webDescription,
  expectedRecipeSnapshot,
  hasUnsavedChanges,
  isSaving,
}: Props) {
  const [job, setJob] = useState<EcProductContentJobView | null>(null);
  const [history, setHistory] = useState<EcProductContentJobView[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const notified = useRef<string | null>(null);
  const totalCharacters = ecProductContentCharacterCount(productPoints, webDescription);
  const targetContents = useMemo(() => buildEcProductContents(
    EC_PRODUCT_CONTENT_TARGETS.map(({ id }) => id),
    productPoints,
    webDescription,
  ), [productPoints, webDescription]);
  const invalid = (!productPoints.trim() && !webDescription.trim()) || totalCharacters > EC_PRODUCT_CONTENT_MAX_CHARACTERS;
  const disabled = isSaving || hasUnsavedChanges || invalid || submitting;

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/recipe/${recipeId}/ec-product-content-jobs`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setJob(payload.activeJob || payload.latestJob || null);
    setHistory(payload.history || []);
  }, [recipeId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!job || FINAL_STATUSES.has(job.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/recipe/${recipeId}/ec-product-content-jobs?jobId=${encodeURIComponent(job.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setJob(payload.job || null);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [job, recipeId]);

  useEffect(() => {
    if (!job || !FINAL_STATUSES.has(job.status) || notified.current === job.id) return;
    notified.current = job.id;
    if (job.status === "completed") toast.success(job.summary || "EC商品文章の反映が完了しました");
    else if (job.status === "waiting_for_user" || job.status === "needs_review") toast.warning(job.summary || "未完了ECがあります");
    else toast.error(job.errorMessage || job.summary || "EC商品文章を反映できませんでした");
    void refresh();
  }, [job, refresh]);

  const unfinishedTargets = useMemo(() => job?.targets.filter((target) => {
    const site = job.sites.find((entry) => entry.site === target);
    return !site || site.status === "blocked" || site.status === "submitted_pending";
  }) || [], [job]);
  const canRetry = Boolean(job && FINAL_STATUSES.has(job.status) && unfinishedTargets.length > 0);

  async function enqueue(targets: EcProductContentTarget[], retryFromJobId?: string) {
    if (disabled || targets.length === 0) return;
    if (!window.confirm([
      `${getEcProductContentTargetLabel(targets)}へ商品ポイント・商品説明を反映します。`,
      "",
      `商品: ${recipeName}`,
      `合計: ${totalCharacters}文字`,
      targets.includes("amazon") ? "Amazonは商品ポイントと商品説明を別欄へ登録します。" : "",
      targets.some((target) => target === "rakuten" || target === "yahoo") ? "楽天・Yahooは■版、その他は✅️版を使用します。" : "",
      "商品名・価格・在庫・画像は変更しません。実行しますか？",
    ].filter(Boolean).join("\n"))) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-product-content-jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targets,
          retryUnfinishedFromJobId: retryFromJobId || null,
          expectedRecipeSnapshot,
          expectedTargetContents: targetContents,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "商品文章反映を登録できません");
      setJob(payload.job);
      notified.current = null;
      toast.success("事務所PCのCodexへ商品文章反映を登録しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品文章反映を登録できません");
    } finally { setSubmitting(false); }
  }

  return <div className="mt-4 border-t border-blue-100 pt-4">
    <div>
      <p className="text-sm font-bold text-gray-800">商品ポイント・商品説明をECへ反映</p>
      <p className="mt-1 text-[11px] text-gray-500">Amazonは別欄、その他は商品ポイントを上・説明を下に連結します。楽天・Yahooだけ■版です。</p>
    </div>
    {hasUnsavedChanges && <p className="mt-2 text-xs font-medium text-amber-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />先にレシピを保存してください。</p>}
    {totalCharacters > EC_PRODUCT_CONTENT_MAX_CHARACTERS && <p className="mt-2 text-xs font-medium text-red-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />合計500文字以内へ調整して保存してください。</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {EC_PRODUCT_CONTENT_TARGETS.map((target) => <button
        key={target.id}
        type="button"
        disabled={disabled}
        onClick={() => void enqueue([target.id])}
        className={`${SITE_COLORS[target.id]} min-h-9 rounded-md px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40`}
      >{target.label}</button>)}
      <button type="button" disabled={disabled} onClick={() => void enqueue(EC_PRODUCT_CONTENT_TARGETS.map(({ id }) => id))} className="min-h-9 rounded-md bg-gray-950 px-3 text-xs font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40">全EC</button>
    </div>

    {job && <div className={`mt-3 rounded-md border p-3 text-xs ${job.status === "completed" ? "border-emerald-200 bg-emerald-50" : FINAL_STATUSES.has(job.status) ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
      <div className="flex items-center justify-between gap-2"><span className="font-bold">{FINAL_STATUSES.has(job.status) ? <CheckCircle2 className="mr-1 inline h-4 w-4" /> : <RefreshCw className="mr-1 inline h-4 w-4 animate-spin" />}{statusLabel(job.status)}</span><span>{job.progress}%</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-white"><div className="h-full bg-blue-600 transition-all" style={{ width: `${job.progress}%` }} /></div>
      <p className="mt-2 font-medium">{job.currentStep}</p>
      {(job.summary || job.errorMessage) && <p className="mt-1 whitespace-pre-wrap text-gray-600">{job.summary || job.errorMessage}</p>}
      {job.sites.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{job.sites.map((site) => <span key={site.site} className="rounded bg-white px-2 py-1">{getEcProductContentTargetLabel([site.site])}: {siteStatusLabel(site.status)}</span>)}</div>}
      {canRetry && <button type="button" disabled={disabled} onClick={() => void enqueue(unfinishedTargets, job.id)} className="mt-3 flex min-h-9 w-full items-center justify-center rounded border border-amber-400 bg-white font-bold text-amber-800"><RefreshCw className="mr-1 h-4 w-4" />未完了だけ再実行</button>}
    </div>}

    {history.length > 0 && <div className="mt-3">
      <button type="button" onClick={() => setShowHistory((value) => !value)} className="flex w-full items-center justify-between border-t pt-2 text-xs font-bold text-gray-700"><span><History className="mr-1 inline h-4 w-4" />EC商品文章反映履歴 {history.length}件</span>{showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
      {showHistory && <div className="mt-2 max-h-64 space-y-2 overflow-y-auto text-[11px]">{history.map((entry) => <div key={entry.id} className="rounded border bg-white p-2"><div className="flex justify-between gap-2"><span className="font-bold">{entry.summary || statusLabel(entry.status)}</span><span className="shrink-0 text-gray-400">{new Date(entry.createdAt).toLocaleString("ja-JP")}</span></div>{entry.sites.map((site) => <p key={site.site} className="mt-1 text-gray-600">{getEcProductContentTargetLabel([site.site])}: {siteStatusLabel(site.status)} {site.message}</p>)}</div>)}</div>}
    </div>}
  </div>;
}
