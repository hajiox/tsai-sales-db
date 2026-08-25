"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Clock3, History, Play, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  EC_PRODUCT_NAME_TARGETS,
  ecProductNameMapsEqual,
  getEcProductNameTargetLabel,
  normalizeEcProductNamesBySite,
  type EcProductNamesBySite,
  type EcProductNameHistoryEntry,
  type EcProductNameJobView,
  type EcProductNameTarget,
} from "@/lib/ec-product-name-codex";

type ReservationView = {
  id: string;
  recipeId: string;
  recipeName: string;
  newProductName: string;
  targets: EcProductNameTarget[];
  createdAt: string;
};

type Props = {
  recipeId: string;
  recipeName: string;
  ecProductName: string | null;
  ecProductNamesBySite: EcProductNamesBySite | null | undefined;
  expectedRecipeSnapshot: Record<string, unknown>;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
};

const FINAL_STATUSES = new Set(["waiting_for_user", "needs_review", "completed", "failed", "cancelled"]);
const SITE_COLORS: Record<EcProductNameTarget, string> = {
  amazon: "bg-orange-500 hover:bg-orange-600",
  rakuten: "bg-red-500 hover:bg-red-600",
  yahoo: "bg-violet-600 hover:bg-violet-700",
  mercari: "bg-sky-500 hover:bg-sky-600",
  base: "bg-emerald-600 hover:bg-emerald-700",
  qoo10: "bg-pink-500 hover:bg-pink-600",
  tiktok: "bg-teal-500 hover:bg-teal-600",
};

function statusLabel(status: EcProductNameJobView["status"]) {
  return ({
    queued: "待機中", running: "実行中", waiting_for_user: "操作待ち", needs_review: "確認待ち",
    completed: "完了", failed: "失敗", cancelled: "取消済み",
  } as const)[status];
}

function siteStatusLabel(status: string) {
  return ({ updated: "変更済み", submitted_pending: "反映確認待ち", not_found: "対象なし", blocked: "未完了" } as Record<string, string>)[status] || status;
}

export default function EcProductNameSyncControls({
  recipeId,
  recipeName,
  ecProductName,
  ecProductNamesBySite,
  expectedRecipeSnapshot,
  hasUnsavedChanges,
  isSaving,
}: Props) {
  const [dispatchMode, setDispatchMode] = useState<"immediate" | "reserved">("immediate");
  const [job, setJob] = useState<EcProductNameJobView | null>(null);
  const [history, setHistory] = useState<EcProductNameHistoryEntry[]>([]);
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [queueAction, setQueueAction] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReservations, setShowReservations] = useState(false);
  const notified = useRef<string | null>(null);
  const targetName = (ecProductName || "").trim();
  const targetNames = useMemo(
    () => normalizeEcProductNamesBySite(ecProductNamesBySite, targetName),
    [ecProductNamesBySite, targetName],
  );
  const summaryName = targetName || targetNames.amazon || Object.values(targetNames)[0] || "";
  const disabled = isSaving || hasUnsavedChanges || submitting;
  const activeJobId = job?.id || null;
  const activeJobStatus = job?.status || null;

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/recipe/${recipeId}/ec-product-name-jobs`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setJob(payload.activeJob || payload.latestJob || null);
    setHistory(payload.history || []);
  }, [recipeId]);

  const refreshReservations = useCallback(async () => {
    const response = await fetch("/api/recipe/ec-product-name-reservations", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setReservations(payload.reservations || []);
  }, []);

  useEffect(() => { void refresh(); void refreshReservations(); }, [refresh, refreshReservations]);
  useEffect(() => {
    if (!activeJobId || !activeJobStatus || FINAL_STATUSES.has(activeJobStatus)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/recipe/${recipeId}/ec-product-name-jobs?jobId=${activeJobId}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setJob(payload.job || null);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus, recipeId]);

  useEffect(() => {
    if (!job || !FINAL_STATUSES.has(job.status) || notified.current === job.id) return;
    notified.current = job.id;
    if (job.status === "completed") toast.success(job.summary || "EC用商品名の変更が完了しました");
    else if (job.status === "waiting_for_user" || job.status === "needs_review") toast.warning(job.summary || "商品名変更結果の確認が必要です");
    else toast.error(job.errorMessage || job.summary || "EC用商品名の変更に失敗しました");
    void refresh();
  }, [job, refresh]);

  const unfinishedTargets = useMemo(() => {
    if (!job) return [];
    return job.targets.filter((target) => {
      const site = job.sites.find((entry) => entry.site === target);
      return !site || site.status === "blocked" || site.status === "submitted_pending";
    });
  }, [job]);
  const canRetry = Boolean(job
    && FINAL_STATUSES.has(job.status)
    && unfinishedTargets.length > 0
    && ecProductNameMapsEqual(targetNames, job.newProductNames, summaryName));
  const elapsedSeconds = job?.startedAt ? Math.max(0, (Date.now() - new Date(job.startedAt).getTime()) / 1000) : 0;
  const etaMinutes = job && job.progress > 2 && job.progress < 100
    ? Math.max(1, Math.ceil((elapsedSeconds * (100 - job.progress) / job.progress) / 60))
    : null;

  async function enqueue(targets: EcProductNameTarget[]) {
    if (disabled || targets.some((target) => !targetNames[target])) return;
    const reserved = dispatchMode === "reserved";
    if (!window.confirm([
      `${getEcProductNameTargetLabel(targets)}のEC用商品名を${reserved ? "一括実行予約へ追加" : "変更"}します。`,
      "", `商品: ${recipeName}`,
      ...targets.map((target) => `${getEcProductNameTargetLabel([target])}: ${targetNames[target]}`), "",
      reserved ? "予約分をまとめて実行するまで外部サイトは変更しません。" : "商品名以外の価格・説明・画像・在庫は変更しません。",
      "実行しますか？",
    ].join("\n"))) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-product-name-jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targets,
          dispatchMode,
          expectedProductName: summaryName,
          expectedProductNames: targetNames,
          expectedRecipeSnapshot,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "商品名変更を登録できません");
      if (payload.reserved) {
        await refreshReservations();
        setShowReservations(true);
        toast.success("商品名変更を一括実行予約へ追加しました");
      } else {
        setJob(payload.job);
        notified.current = null;
        toast.success("事務所PCのCodexへ商品名変更を登録しました");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品名変更を登録できません");
    } finally { setSubmitting(false); }
  }

  async function retryUnfinished() {
    if (!job || !canRetry || disabled) return;
    if (!window.confirm(`未完了の${getEcProductNameTargetLabel(unfinishedTargets)}だけを再実行しますか？`)) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-product-name-jobs`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          retryUnfinishedFromJobId: job.id,
          dispatchMode: "immediate",
          expectedProductName: summaryName,
          expectedProductNames: targetNames,
          expectedRecipeSnapshot,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "未完了ECを再実行できません");
      setDispatchMode("immediate");
      setJob(payload.job);
      notified.current = null;
      toast.success("未完了ECだけを再実行します");
    } catch (error) { toast.error(error instanceof Error ? error.message : "再実行できません"); }
    finally { setSubmitting(false); }
  }

  async function executeReservations() {
    if (!reservations.length || queueAction) return;
    if (!window.confirm(`予約済み${reservations.length}件を順番に実行しますか？\nTSGへの報告は全件完了後に1投稿へまとめます。`)) return;
    setQueueAction(true);
    try {
      const response = await fetch("/api/recipe/ec-product-name-reservations", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "execute_all" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "予約分を実行できません");
      await refreshReservations();
      toast.success(`予約${payload.released}件を実行待ちへ移しました`);
      if (payload.stale) toast.warning(`${payload.stale}件は保存内容が変わったため停止しました`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "予約分を実行できません"); }
    finally { setQueueAction(false); }
  }

  async function cancelReservation(reservation: ReservationView) {
    if (queueAction || !window.confirm(`「${reservation.recipeName}」の商品名変更予約を取り消しますか？`)) return;
    setQueueAction(true);
    try {
      const response = await fetch("/api/recipe/ec-product-name-reservations", {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: reservation.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "予約を取り消せません");
      await refreshReservations();
      toast.success("予約を取り消しました");
    } catch (error) { toast.error(error instanceof Error ? error.message : "予約を取り消せません"); }
    finally { setQueueAction(false); }
  }

  return (
    <div className="mt-3 border-t border-blue-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-gray-800">EC用商品名を反映</p>
          <p className="text-[11px] text-gray-500">保存済みの商品名だけを、各ECへ1件ずつ変更します。</p>
        </div>
        <div className="inline-flex rounded-md bg-gray-100 p-1 text-xs">
          <button type="button" className={`rounded px-3 py-1.5 ${dispatchMode === "immediate" ? "bg-white font-bold shadow-sm" : "text-gray-500"}`} onClick={() => setDispatchMode("immediate")}>今すぐ</button>
          <button type="button" className={`rounded px-3 py-1.5 ${dispatchMode === "reserved" ? "bg-white font-bold shadow-sm" : "text-gray-500"}`} onClick={() => setDispatchMode("reserved")}><CalendarClock className="mr-1 inline h-3.5 w-3.5" />一括予約</button>
        </div>
      </div>

      {hasUnsavedChanges && <p className="mt-2 text-xs font-medium text-amber-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />先にレシピを保存してください。</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {EC_PRODUCT_NAME_TARGETS.map((target) => (
          <button key={target.id} type="button" disabled={disabled || !targetNames[target.id]} onClick={() => void enqueue([target.id])}
            className={`${SITE_COLORS[target.id]} min-h-9 rounded-md px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40`}>
            {target.label}
          </button>
        ))}
        <button type="button" disabled={disabled || EC_PRODUCT_NAME_TARGETS.some(({ id }) => !targetNames[id])} onClick={() => void enqueue(EC_PRODUCT_NAME_TARGETS.map((target) => target.id))}
          className="min-h-9 rounded-md bg-gray-950 px-3 text-xs font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40">
          全EC
        </button>
      </div>

      {(job || reservations.length > 0 || history.length > 0) && <div className="mt-3 space-y-2">
        {job && <div className={`rounded-md border p-3 text-xs ${job.status === "completed" ? "border-emerald-200 bg-emerald-50" : FINAL_STATUSES.has(job.status) ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">{FINAL_STATUSES.has(job.status) ? <CheckCircle2 className="mr-1 inline h-4 w-4" /> : <RefreshCw className="mr-1 inline h-4 w-4 animate-spin" />}{statusLabel(job.status)}</span>
            <span className="text-gray-500">{job.progress}%{etaMinutes ? ` / 残り目安 約${etaMinutes}分` : ""}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-white"><div className="h-full bg-blue-600 transition-all" style={{ width: `${job.progress}%` }} /></div>
          <p className="mt-2 font-medium">{job.currentStep}</p>
          {(job.summary || job.errorMessage) && <p className="mt-1 whitespace-pre-wrap text-gray-600">{job.summary || job.errorMessage}</p>}
          {job.sites.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{job.sites.map((site) => <span key={site.site} className="rounded bg-white px-2 py-1">{site.site}: {siteStatusLabel(site.status)}</span>)}</div>}
          {canRetry && <button type="button" disabled={disabled} onClick={() => void retryUnfinished()} className="mt-3 flex min-h-9 w-full items-center justify-center rounded border border-amber-400 bg-white font-bold text-amber-800"><RefreshCw className="mr-1 h-4 w-4" />未完了だけ再実行</button>}
        </div>}

        <button type="button" onClick={() => setShowReservations((value) => !value)} className="flex w-full items-center justify-between border-t pt-2 text-xs font-bold text-gray-700">
          <span><CalendarClock className="mr-1 inline h-4 w-4" />一括実行予約 {reservations.length}件</span>{showReservations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showReservations && <div className="space-y-2 text-xs">
          {reservations.length === 0 ? <p className="rounded bg-gray-50 p-2 text-gray-500">予約はありません。</p> : <>
            {reservations.map((reservation) => <div key={reservation.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2">
              <div className="min-w-0"><p className="truncate font-bold">{reservation.recipeName}</p><p className="truncate text-gray-500">{reservation.newProductName} / {getEcProductNameTargetLabel(reservation.targets)}</p></div>
              <button type="button" aria-label="予約取消" title="予約取消" onClick={() => void cancelReservation(reservation)} className="shrink-0 rounded p-2 text-red-500 hover:bg-red-50"><X className="h-4 w-4" /></button>
            </div>)}
            <button type="button" disabled={queueAction} onClick={() => void executeReservations()} className="flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 font-bold text-white disabled:opacity-40"><Play className="mr-1 h-4 w-4" />予約分をまとめて実行</button>
          </>}
        </div>}

        <button type="button" onClick={() => setShowHistory((value) => !value)} className="flex w-full items-center justify-between border-t pt-2 text-xs font-bold text-gray-700">
          <span><History className="mr-1 inline h-4 w-4" />EC商品名変更履歴 {history.length}件</span>{showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showHistory && <div className="max-h-64 space-y-2 overflow-y-auto text-[11px]">{history.map((entry) => <div key={entry.id} className="rounded border bg-white p-2">
          <div className="flex justify-between gap-2"><span className="font-bold">{entry.newProductName}</span><span className="shrink-0 text-gray-400"><Clock3 className="mr-1 inline h-3 w-3" />{new Date(entry.createdAt).toLocaleString("ja-JP")}</span></div>
          {entry.sites.map((site) => <p key={site.site} className="mt-1 text-gray-600">{site.site}: {site.previousName || "未確認"} → {site.finalName || site.newName}（{siteStatusLabel(site.status)}）</p>)}
        </div>)}</div>}
      </div>}
    </div>
  );
}
