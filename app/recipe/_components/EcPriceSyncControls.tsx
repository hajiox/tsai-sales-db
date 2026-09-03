"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  CircleStop,
  Clock3,
  History,
  Link2,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  EC_PRICE_TARGETS,
  getEcPriceRetryTargets,
  getEcPriceTargetLabel,
  type EcPriceHistoryEntry,
  type EcPriceJobView,
  type EcPriceTarget,
} from "@/lib/ec-price-codex";
import type { EcPriceDispatchMode } from "@/lib/ec-price-reservations";

const TARGET_STYLES: Record<EcPriceTarget, string> = {
  amazon: "bg-orange-500 hover:bg-orange-600",
  rakuten: "bg-red-500 hover:bg-red-600",
  yahoo: "bg-purple-600 hover:bg-purple-700",
  mercari: "bg-sky-500 hover:bg-sky-600",
  base: "bg-emerald-600 hover:bg-emerald-700",
  qoo10: "bg-pink-500 hover:bg-pink-600",
  tiktok: "bg-teal-500 hover:bg-teal-600",
};

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const FINAL_STATUSES = new Set(["waiting_for_user", "needs_review", "completed", "failed", "cancelled"]);

type ReservationView = {
  id: string;
  recipeId: string;
  recipeName: string;
  ecProductName: string | null;
  targets: EcPriceTarget[];
  newPriceInclTax: number;
  createdAt: string;
};

type BlockingJobView = {
  id: string;
  recipeId: string;
  productName: string;
  status: string;
  currentStep: string;
};

interface EcPriceSyncControlsProps {
  recipeId: string;
  recipeName: string;
  ecProductName?: string | null;
  productLpUrl?: string | null;
  sellingPriceInclTax: number;
  expectedRecipeSnapshot: Record<string, unknown>;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
}

export default function EcPriceSyncControls({
  recipeId,
  recipeName,
  ecProductName,
  productLpUrl,
  sellingPriceInclTax,
  expectedRecipeSnapshot,
  hasUnsavedChanges,
  isSaving,
}: EcPriceSyncControlsProps) {
  const [submitting, setSubmitting] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<EcPriceDispatchMode>("immediate");
  const [job, setJob] = useState<EcPriceJobView | null>(null);
  const [blockingJob, setBlockingJob] = useState<BlockingJobView | null>(null);
  const [priceHistory, setPriceHistory] = useState<EcPriceHistoryEntry[]>([]);
  const [priceHistoryExpanded, setPriceHistoryExpanded] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueAction, setQueueAction] = useState(false);
  const notifiedJobId = useRef<string | null>(null);
  const hasHydratedJobHistory = useRef(false);
  const hasPrice = Number.isFinite(sellingPriceInclTax) && sellingPriceInclTax > 0;
  const hasProductLp = Boolean(productLpUrl?.trim());
  const jobIsActive = Boolean(job && ACTIVE_STATUSES.has(job.status));
  const blockedByAnotherJob = dispatchMode === "immediate" && Boolean(blockingJob);
  const unfinishedTargets = job
    ? getEcPriceRetryTargets(job.targets, job.sites, job.planValidated)
    : [];
  const unfinishedLp = Boolean(job?.lp?.required && job.lp.status !== "updated");
  const jobCanRetry = Boolean(job && !jobIsActive && (unfinishedTargets.length > 0 || unfinishedLp));
  const disabled = hasUnsavedChanges || isSaving || submitting || jobIsActive || blockedByAnotherJob || !hasPrice;

  const refreshPriceHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-price-jobs`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "価格変更履歴を取得できません");
      const nextJob = (payload.activeJob || payload.latestJob || null) as EcPriceJobView | null;
      if (!hasHydratedJobHistory.current) {
        if (nextJob && FINAL_STATUSES.has(nextJob.status)) notifiedJobId.current = nextJob.id;
        hasHydratedJobHistory.current = true;
      }
      setPriceHistory(Array.isArray(payload.history) ? payload.history : []);
      setJob(nextJob);
      setBlockingJob((payload.blockingJob || null) as BlockingJobView | null);
    } catch (error) {
      console.error("EC price history fetch error:", error);
    }
  }, [recipeId]);

  const refreshReservations = useCallback(async (quiet = false) => {
    if (!quiet) setQueueLoading(true);
    try {
      const response = await fetch("/api/recipe/ec-price-reservations", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "価格変更予約を取得できません");
      setReservations(Array.isArray(payload.reservations) ? payload.reservations : []);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "価格変更予約を取得できません");
    } finally {
      if (!quiet) setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPriceHistory();
  }, [refreshPriceHistory]);

  useEffect(() => {
    if (!jobIsActive) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [jobIsActive]);

  useEffect(() => {
    void refreshReservations();
    const timer = setInterval(() => {
      void refreshReservations(true);
      void refreshPriceHistory();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshPriceHistory, refreshReservations]);

  const activeJobId = job?.id;
  const activeJobStatus = job?.status;
  useEffect(() => {
    if (!activeJobId || !activeJobStatus || !ACTIVE_STATUSES.has(activeJobStatus)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/recipe/${recipeId}/ec-price-jobs?jobId=${encodeURIComponent(activeJobId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "価格変更状況を取得できません");
        if (cancelled) return;
        const nextJob = payload.job as EcPriceJobView;
        setJob(nextJob);
        if (ACTIVE_STATUSES.has(nextJob.status)) timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 5000);
      }
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId, activeJobStatus, recipeId]);

  useEffect(() => {
    if (!job || !FINAL_STATUSES.has(job.status) || notifiedJobId.current === job.id) return;
    notifiedJobId.current = job.id;
    if (job.status === "completed") toast.success(job.summary || "EC価格変更が完了しました");
    else if (job.status === "waiting_for_user" || job.status === "needs_review") {
      toast.warning(job.summary || "価格変更結果の確認が必要です");
    } else toast.error(job.errorMessage || job.summary || "EC価格変更に失敗しました");
    void refreshPriceHistory();
  }, [job, refreshPriceHistory]);

  const enqueue = async (targets: EcPriceTarget[]) => {
    if (disabled) return;
    const targetLabel = getEcPriceTargetLabel(targets);
    const productName = ecProductName || recipeName;
    const isReservation = dispatchMode === "reserved";
    const confirmed = window.confirm(
      isReservation
        ? [
          `${targetLabel}の価格変更を一括実行予約へ追加します。`,
          "",
          `商品: ${productName}`,
          `予約価格（税込）: ¥${sellingPriceInclTax.toLocaleString("ja-JP")}`,
          ...(hasProductLp ? ["", `商品LPも必須更新: ${productLpUrl}`] : []),
          "",
          "「予約分をまとめて実行」を押すまでECサイトは変更しません。予約しますか？",
        ].join("\n")
        : [
          `${targetLabel}の販売価格を変更します。`,
          "",
          `商品: ${productName}`,
          `新価格（税込）: ¥${sellingPriceInclTax.toLocaleString("ja-JP")}`,
          ...(hasProductLp ? ["", `商品LPも必須更新: ${productLpUrl}`] : []),
          "",
          "事務所PCのCodexがログイン済みEC管理画面を操作します。実行しますか？",
        ].join("\n"),
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-price-jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targets,
          dispatchMode,
          expectedPriceInclTax: sellingPriceInclTax,
          expectedRecipeSnapshot,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || (isReservation ? "価格変更を予約できません" : "価格変更を開始できません"));
      if (payload.reserved) {
        await refreshReservations(true);
        toast.success(payload.reused ? "同じ価格変更は予約済みです" : "価格変更を一括実行予約へ追加しました");
      } else {
        setJob(payload.job as EcPriceJobView);
        notifiedJobId.current = null;
        await refreshReservations(true);
        toast.success(payload.promoted
          ? "予約を今すぐ実行へ切り替えました"
          : payload.reused
            ? "実行中の価格変更を表示します"
            : "事務所PCのCodexへ価格変更を登録しました");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isReservation ? "価格変更を予約できません" : "価格変更を開始できません"));
    } finally {
      setSubmitting(false);
    }
  };

  const retryUnfinished = async () => {
    if (!job || disabled || !jobCanRetry) return;
    const labels = [
      ...(unfinishedTargets.length > 0 ? [getEcPriceTargetLabel(unfinishedTargets)] : []),
      ...(unfinishedLp ? ["商品LP"] : []),
    ];
    if (!window.confirm([
      "未完了の工程だけを再実行します。",
      "",
      `対象: ${labels.join("・")}`,
      `商品: ${ecProductName || recipeName}`,
      `価格（税込）: ¥${sellingPriceInclTax.toLocaleString("ja-JP")}`,
      "",
      "反映済み・対象商品なしの工程は再実行しません。実行しますか？",
    ].join("\n"))) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-price-jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          retryUnfinishedFromJobId: job.id,
          dispatchMode: "immediate",
          expectedPriceInclTax: sellingPriceInclTax,
          expectedRecipeSnapshot,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "未完了工程を再実行できません");
      setDispatchMode("immediate");
      setJob(payload.job as EcPriceJobView);
      notifiedJobId.current = null;
      toast.success("未完了工程だけを事務所PCのCodexへ登録しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "未完了工程を再実行できません");
    } finally {
      setSubmitting(false);
    }
  };

  const executeAllReservations = async () => {
    if (reservations.length === 0 || queueAction) return;
    if (!window.confirm(`予約済み${reservations.length}件をまとめて実行します。\n事務所PCのCodexが順番にEC価格を変更します。実行しますか？`)) return;
    setQueueAction(true);
    try {
      const response = await fetch("/api/recipe/ec-price-reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "execute_all" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "予約分を一括実行できません");
      await refreshReservations(true);
      if (payload.released > 0) toast.success(`予約${payload.released}件を実行待ちへ移しました`);
      if (payload.stale > 0) toast.warning(`${payload.stale}件は価格・商品情報が変わったため実行せず停止しました`);
      if (payload.released === 0 && payload.stale === 0) toast.info("実行対象の予約はありませんでした");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "予約分を一括実行できません");
    } finally {
      setQueueAction(false);
    }
  };

  const cancelReservation = async (reservation: ReservationView) => {
    if (queueAction) return;
    if (!window.confirm(`「${reservation.ecProductName || reservation.recipeName}」の価格変更予約を取り消しますか？`)) return;
    setQueueAction(true);
    try {
      const response = await fetch("/api/recipe/ec-price-reservations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: reservation.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "予約を取り消せません");
      await refreshReservations(true);
      toast.success("価格変更予約を取り消しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "予約を取り消せません");
    } finally {
      setQueueAction(false);
    }
  };

  const allTargets = EC_PRICE_TARGETS.map((target) => target.id);
  const activeProgress = clampProgress(job?.progress);
  const heartbeatAt = job?.heartbeatAt ? Date.parse(job.heartbeatAt) : Number.NaN;
  const startedAt = job?.startedAt ? Date.parse(job.startedAt) : Date.parse(job?.createdAt || "");
  const heartbeatAgeSeconds = Number.isFinite(heartbeatAt) ? Math.max(0, Math.floor((clockNow - heartbeatAt) / 1000)) : null;
  const elapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((clockNow - startedAt) / 1000)) : 0;
  const completionEstimate = jobIsActive && job
    ? estimateCompletion(job.status, activeProgress, elapsedSeconds, job.targets.length + (hasProductLp ? 1 : 0), clockNow)
    : null;
  const heartbeatStale = jobIsActive && heartbeatAgeSeconds !== null && heartbeatAgeSeconds >= 70;
  const executionPhase = job?.status === "queued"
    ? "開始待ち"
    : "1件ずつ順次実行中";
  const jobStatusLabel = jobIsActive
    ? executionPhase
    : job?.status === "completed"
      ? "完了"
      : job?.status === "waiting_for_user"
        ? "操作待ち"
        : job?.status === "needs_review"
          ? "確認待ち"
          : job?.status === "failed"
            ? "失敗"
            : job?.status === "cancelled"
              ? "停止済み"
              : "実行履歴なし";
  const jobStatusStyle = job?.status === "completed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : job?.status === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : job?.status === "cancelled"
        ? "border-slate-200 bg-slate-50 text-slate-600"
    : job?.status === "waiting_for_user" || job?.status === "needs_review" || heartbeatStale
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-700";
  const previousSitePrices = EC_PRICE_TARGETS.flatMap((target) => {
    for (const entry of priceHistory) {
      const site = entry.sites.find((candidate) =>
        candidate.site === target.id
        && (candidate.status === "updated" || candidate.status === "submitted_pending")
        && candidate.previousPrice !== candidate.newPrice,
      );
      if (site) return [{ ...site, changedAt: entry.completedAt || entry.createdAt }];
    }
    return [];
  });

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">EC価格反映</h3>
        <p className="mt-1 text-xs text-slate-500">
          保存済みの税込価格を、事務所PCのCodexが価格改定Skillで反映します。商品LP登録時は公開確認まで必須です。
        </p>
        {hasProductLp && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-blue-50 px-2.5 py-2 text-[11px] font-bold text-blue-700">
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-all">必須更新する商品LP: {productLpUrl}</span>
          </p>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setDispatchMode("immediate")}
          className={`rounded-md px-3 py-2 transition-colors ${dispatchMode === "immediate" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          今すぐ実行
        </button>
        <button
          type="button"
          onClick={() => setDispatchMode("reserved")}
          className={`flex items-center justify-center gap-1 rounded-md px-3 py-2 transition-colors ${dispatchMode === "reserved" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          一括実行へ予約
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {EC_PRICE_TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => enqueue([target.id])}
            disabled={disabled}
            title={hasUnsavedChanges
              ? "先にレシピを保存してください"
              : dispatchMode === "reserved"
                ? `${target.label}を一括実行へ予約`
                : `${target.label}へ反映`}
            className={`rounded px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 ${TARGET_STYLES[target.id]}`}
          >
            {target.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => enqueue(allTargets)}
          disabled={disabled}
          className="inline-flex items-center rounded bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          {submitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          全EC
        </button>
      </div>

      {blockingJob && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            現在「{blockingJob.productName}」の価格変更を実行中です。今すぐ実行は完了まで利用できません。
            一括実行への予約は追加できます。
          </span>
        </p>
      )}

      {hasUnsavedChanges ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          価格を含む変更を先に保存すると、反映・予約ボタンが有効になります。
        </p>
      ) : !hasPrice ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          販売価格を登録・保存すると利用できます。
        </p>
      ) : job ? (
        <div className={`mt-3 rounded-md border px-3 py-3 text-xs ${jobStatusStyle}`}>
          <p className="mb-2 text-[10px] font-bold uppercase text-current/70">直近の実行状況</p>
          <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
            <div className="flex items-center gap-2">
              {job.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : job.status === "failed" ? <AlertTriangle className="h-4 w-4" /> : job.status === "cancelled" ? <CircleStop className="h-4 w-4" /> : <Loader2 className={`h-4 w-4 ${jobIsActive ? "animate-spin" : ""}`} />}
              <span>{jobStatusLabel}</span>
            </div>
            {jobIsActive ? (
              <span className="tabular-nums" aria-label={`進捗 ${activeProgress}パーセント`}>{activeProgress}%</span>
            ) : (
              <time className="text-[10px] font-medium opacity-70" dateTime={job.completedAt || job.updatedAt || job.createdAt}>
                {new Date(job.completedAt || job.updatedAt || job.createdAt).toLocaleString("ja-JP")}
              </time>
            )}
          </div>
          {jobIsActive && (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-inset ring-current/10">
                <div
                  role="progressbar"
                  aria-label="EC価格変更の進捗"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={activeProgress}
                  className="h-full rounded-full bg-current transition-[width] duration-500"
                  style={{ width: `${Math.max(3, activeProgress)}%` }}
                />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 rounded bg-white/70 px-2.5 py-2 text-[11px] sm:grid-cols-4">
                <div className="col-span-2 min-w-0 sm:col-span-4">
                  <dt className="text-[10px] font-bold opacity-60">現在のステップ</dt>
                  <dd className="mt-0.5 break-words font-bold">{job.currentStep || executionPhase}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-[10px] font-bold opacity-60">
                    <Clock3 className="h-3 w-3" aria-hidden="true" />
                    経過時間
                  </dt>
                  <dd className="mt-0.5 font-bold tabular-nums">{formatDuration(elapsedSeconds)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold opacity-60">Bridge最終応答</dt>
                  <dd className="mt-0.5 font-bold tabular-nums">
                    {heartbeatAgeSeconds === null ? "応答待ち" : formatAge(heartbeatAgeSeconds)}
                  </dd>
                </div>
                {completionEstimate && (
                  <div className="col-span-2 min-w-0">
                    <dt className="flex items-center gap-1 text-[10px] font-bold opacity-60">
                      <CalendarClock className="h-3 w-3" aria-hidden="true" />
                      完了目安
                    </dt>
                    <dd className="mt-0.5 font-bold tabular-nums">{completionEstimate}</dd>
                  </div>
                )}
              </dl>
              {/変更前価格|事前確認|編集元/.test(job.currentStep || "") && (
                <p className="mt-2 rounded bg-white/70 px-2 py-1.5 text-[11px] font-bold">
                  現在の対象だけを確認中です。この工程ではまだ外部へ書き込みません。
                </p>
              )}
              {heartbeatStale && (
                <p className="mt-2 flex items-start gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  事務所PCのBridgeから70秒以上ハートビートがありません。Bridge自体の停止を確認してください。
                </p>
              )}
            </>
          )}
          {!jobIsActive && job.currentStep && <p className="mt-2 font-bold">{job.currentStep}</p>}
          {(job.summary || job.errorMessage) && <p className="mt-1 leading-relaxed">{job.summary || job.errorMessage}</p>}
          {job.sites.length > 0 && job.status !== "cancelled" && (
            <ul className="mt-2 space-y-1">
              {job.sites.map((site) => (
                <li key={site.site} className="grid gap-1 rounded bg-white/70 px-2 py-1.5 sm:grid-cols-[5rem_6.5rem_1fr] sm:items-start">
                  <strong>{getEcPriceTargetLabel([site.site])}</strong>
                  <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-bold ${site.status === "updated" ? "bg-emerald-100 text-emerald-700" : site.status === "not_found" ? "bg-slate-100 text-slate-600" : site.status === "submitted_pending" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>
                    {site.status === "updated" ? "反映確認済み" : site.status === "not_found" ? "対象商品なし" : site.status === "submitted_pending" ? "反映待ち" : "未完了"}
                  </span>
                  <span className="leading-relaxed">{site.message}</span>
                </li>
              ))}
            </ul>
          )}
          {job.lp && job.status !== "cancelled" && (
            <p className="mt-2 flex items-start gap-1.5 font-medium">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>商品LP: {job.lp.message || (job.lp.status === "updated" ? "公開反映確認済み" : "対象外")}</span>
            </p>
          )}
          {jobCanRetry && (
            <button
              type="button"
              onClick={retryUnfinished}
              disabled={disabled}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-current/20 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              未完了だけ再実行
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          <p className="text-[10px] font-bold uppercase text-slate-400">直近の実行状況</p>
          <p className="mt-1 font-bold text-slate-600">実行履歴はまだありません</p>
          <p className="mt-1 text-[11px] leading-relaxed">実行すると、この場所に進捗と事務所PCからの最終応答を表示します。</p>
        </div>
      )}

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <History className="h-4 w-4" />
              EC価格変更履歴
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px]">{priceHistory.length}件</span>
            </h4>
            {previousSitePrices.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="font-bold text-slate-600">前回変更前価格</span>
                {previousSitePrices.map((site) => (
                  <span key={site.site} title={`変更日時: ${new Date(site.changedAt).toLocaleString("ja-JP")}`}>
                    {getEcPriceTargetLabel([site.site])} <strong className="text-slate-800">¥{site.previousPrice.toLocaleString("ja-JP")}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">EC価格を変更すると、サイトごとの変更前価格がここに残ります。</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPriceHistoryExpanded((current) => !current)}
            disabled={priceHistory.length === 0}
            aria-expanded={priceHistoryExpanded}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            {priceHistoryExpanded ? "履歴を閉じる" : "履歴を見る"}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${priceHistoryExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        {priceHistoryExpanded && priceHistory.length > 0 && (
          <div className="mt-3 max-h-80 overflow-y-auto border-y border-slate-200">
            {priceHistory.map((entry) => (
              <div key={entry.id} className="border-b border-slate-200 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px]">
                  <time className="font-medium text-slate-500" dateTime={entry.completedAt || entry.createdAt}>
                    {new Date(entry.completedAt || entry.createdAt).toLocaleString("ja-JP")}
                  </time>
                  <span className={`rounded px-2 py-0.5 font-bold ${entry.status === "completed" ? "bg-emerald-50 text-emerald-700" : entry.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                    {entry.status === "completed" ? "完了" : entry.status === "failed" ? "失敗" : "確認あり"}
                  </span>
                </div>
                <div className="mt-2 divide-y divide-slate-100">
                  {entry.sites.map((site) => (
                    <div key={site.site} className="grid gap-1 px-1 py-2 text-xs sm:grid-cols-[7rem_1fr] sm:items-center">
                      <span className="font-bold text-slate-700">{getEcPriceTargetLabel([site.site])}</span>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:justify-end">
                        <span className="font-bold text-slate-600">¥{site.previousPrice.toLocaleString("ja-JP")}</span>
                        <span className="text-slate-300">→</span>
                        <span className="font-bold text-slate-900">¥{site.newPrice.toLocaleString("ja-JP")}</span>
                        <span className="text-[10px] text-slate-400">
                          {site.status === "updated" ? "反映確認済み" : site.status === "submitted_pending" ? "送信済み・反映待ち" : site.status === "not_found" ? "対象なし" : "未反映"}
                        </span>
                        {site.productIdentifier && (
                          <span className="max-w-full truncate text-[10px] text-slate-400" title={site.productIdentifier}>
                            ID: {site.productIdentifier}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {entry.lp?.required && (
                    <div className="grid gap-1 px-1 py-2 text-xs sm:grid-cols-[7rem_1fr] sm:items-center">
                      <span className="font-bold text-slate-700">商品LP</span>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:justify-end">
                        <span className="font-bold text-slate-900">
                          {entry.lp.final_prices.length > 0
                            ? entry.lp.final_prices.map((price) => `¥${price.toLocaleString("ja-JP")}`).join("・")
                            : "価格未確認"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {entry.lp.status === "updated" ? "公開反映確認済み" : "未反映"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <CalendarClock className="h-4 w-4" />
              一括実行予約
              {!queueLoading && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px]">{reservations.length}件</span>}
            </h4>
            <p className="mt-1 text-[11px] text-slate-400">予約した商品は下のボタンで順番に実行します。</p>
          </div>
          <button
            type="button"
            onClick={executeAllReservations}
            disabled={queueLoading || queueAction || reservations.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {queueAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            予約分をまとめて実行
          </button>
        </div>

        {queueLoading ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />予約を確認中...
          </div>
        ) : reservations.length > 0 ? (
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {reservations.map((reservation) => (
              <li key={reservation.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0 text-xs">
                  <p className="truncate font-bold text-slate-700">{reservation.ecProductName || reservation.recipeName}</p>
                  <p className="mt-0.5 text-slate-500">
                    税込 ¥{reservation.newPriceInclTax.toLocaleString("ja-JP")} ・ {getEcPriceTargetLabel(reservation.targets)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cancelReservation(reservation)}
                  disabled={queueAction}
                  aria-label={`${reservation.ecProductName || reservation.recipeName}の予約を取消`}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-400">現在、実行待ちの予約はありません。</p>
        )}
      </div>
    </section>
  );
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}分${remainder}秒` : `${remainder}秒`;
}

function formatAge(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return seconds < 60 ? `${seconds}秒前` : `${Math.floor(seconds / 60)}分前`;
}

function clampProgress(progress: number | null | undefined) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress as number)));
}

function estimateCompletion(
  status: EcPriceJobView["status"],
  progress: number,
  elapsedSeconds: number,
  targetCount: number,
  now: number,
) {
  const safeTargetCount = Math.max(1, Math.min(EC_PRICE_TARGETS.length + 1, Math.floor(targetCount) || 1));
  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const remainingFraction = Math.max(0.01, (100 - Math.min(progress, 99)) / 100);

  // Browser work varies by site and login state, so keep the estimate deliberately broad.
  const baselineLow = safeTargetCount * 4 * 60 * remainingFraction;
  const baselineHigh = safeTargetCount * 12 * 60 * remainingFraction;
  let lowSeconds = baselineLow;
  let highSeconds = baselineHigh;

  if (status === "running" && safeElapsed >= 30) {
    const effectiveProgress = Math.max(5, Math.min(progress, 99));
    const paceRemaining = safeElapsed * (100 - progress) / effectiveProgress;
    if (Number.isFinite(paceRemaining) && paceRemaining >= 0) {
      lowSeconds = Math.min(lowSeconds, paceRemaining * 0.7);
      highSeconds = Math.max(highSeconds, paceRemaining * 1.5);
    }
  }

  const [roundedLow, roundedHigh] = normalizeEstimateRange(lowSeconds, highSeconds);
  const durationRange = `${formatEstimateDuration(roundedLow)}〜${formatEstimateDuration(roundedHigh)}`;
  if (status === "queued") return `開始後 約${durationRange}`;

  const completionRange = formatCompletionClockRange(now, roundedLow, roundedHigh);
  return `${completionRange}頃（残り 約${durationRange}）`;
}

function normalizeEstimateRange(lowSeconds: number, highSeconds: number): [number, number] {
  const maxSeconds = 8 * 60 * 60;
  const safeLow = Number.isFinite(lowSeconds) ? Math.max(60, Math.min(maxSeconds - 60, lowSeconds)) : 60;
  const safeHigh = Number.isFinite(highSeconds) ? Math.max(safeLow + 60, Math.min(maxSeconds, highSeconds)) : safeLow + 60;
  const lowStep = safeLow >= 10 * 60 ? 5 * 60 : 60;
  const highStep = safeHigh >= 10 * 60 ? 5 * 60 : 60;
  const roundedLow = Math.max(lowStep, Math.floor(safeLow / lowStep) * lowStep);
  const roundedHigh = Math.max(roundedLow + highStep, Math.ceil(safeHigh / highStep) * highStep);
  return [roundedLow, Math.min(maxSeconds, roundedHigh)];
}

function formatEstimateDuration(totalSeconds: number) {
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分`;
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
}

function formatCompletionClockRange(now: number, lowSeconds: number, highSeconds: number) {
  const fiveMinutes = 5 * 60 * 1000;
  const roundUp = (timestamp: number) => Math.ceil(timestamp / fiveMinutes) * fiveMinutes;
  const low = new Date(roundUp(now + lowSeconds * 1000));
  const high = new Date(roundUp(now + highSeconds * 1000));
  const sameDay = low.getFullYear() === high.getFullYear()
    && low.getMonth() === high.getMonth()
    && low.getDate() === high.getDate();
  const format = (date: Date, includeDate: boolean) => date.toLocaleString("ja-JP", {
    ...(includeDate ? { month: "numeric", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${format(low, !sameDay)}〜${format(high, !sameDay)}`;
}
