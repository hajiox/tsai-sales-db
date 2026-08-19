"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  EC_PRICE_TARGETS,
  getEcPriceTargetLabel,
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

interface EcPriceSyncControlsProps {
  recipeId: string;
  recipeName: string;
  ecProductName?: string | null;
  sellingPriceInclTax: number;
  expectedRecipeSnapshot: Record<string, unknown>;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
}

export default function EcPriceSyncControls({
  recipeId,
  recipeName,
  ecProductName,
  sellingPriceInclTax,
  expectedRecipeSnapshot,
  hasUnsavedChanges,
  isSaving,
}: EcPriceSyncControlsProps) {
  const [submitting, setSubmitting] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<EcPriceDispatchMode>("immediate");
  const [job, setJob] = useState<EcPriceJobView | null>(null);
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueAction, setQueueAction] = useState(false);
  const notifiedJobId = useRef<string | null>(null);
  const hasPrice = Number.isFinite(sellingPriceInclTax) && sellingPriceInclTax > 0;
  const jobIsActive = Boolean(job && ACTIVE_STATUSES.has(job.status));
  const disabled = hasUnsavedChanges || isSaving || submitting || jobIsActive || !hasPrice;

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
    void refreshReservations();
    const timer = setInterval(() => void refreshReservations(true), 15000);
    return () => clearInterval(timer);
  }, [refreshReservations]);

  useEffect(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/recipe/${recipeId}/ec-price-jobs?jobId=${encodeURIComponent(job.id)}`, {
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
  }, [job?.id, job?.status, recipeId]);

  useEffect(() => {
    if (!job || !FINAL_STATUSES.has(job.status) || notifiedJobId.current === job.id) return;
    notifiedJobId.current = job.id;
    if (job.status === "completed") toast.success(job.summary || "EC価格変更が完了しました");
    else if (job.status === "waiting_for_user" || job.status === "needs_review") {
      toast.warning(job.summary || "価格変更結果の確認が必要です");
    } else toast.error(job.errorMessage || job.summary || "EC価格変更に失敗しました");
  }, [job]);

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
          "",
          "「予約分をまとめて実行」を押すまでECサイトは変更しません。予約しますか？",
        ].join("\n")
        : [
          `${targetLabel}の販売価格を変更します。`,
          "",
          `商品: ${productName}`,
          `新価格（税込）: ¥${sellingPriceInclTax.toLocaleString("ja-JP")}`,
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

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">EC価格反映</h3>
        <p className="mt-1 text-xs text-slate-500">
          保存済みの税込価格を、事務所PCのCodexが価格改定Skillで反映します。
        </p>
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
      </div>

      <button
        type="button"
        onClick={() => enqueue(allTargets)}
        disabled={disabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {dispatchMode === "reserved" ? "全サイトを予約" : "全て反映"}
      </button>

      {hasUnsavedChanges ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          価格を含む変更を先に保存すると、反映・予約ボタンが有効になります。
        </p>
      ) : !hasPrice ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          販売価格を登録・保存すると利用できます。
        </p>
      ) : job ? (
        <div className={`mt-3 rounded-md px-3 py-2 text-xs ${job.status === "completed" ? "bg-emerald-50 text-emerald-700" : job.status === "failed" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
          <div className="flex items-center gap-2 font-bold">
            {job.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : job.status === "failed" ? <AlertTriangle className="h-4 w-4" /> : <Loader2 className={`h-4 w-4 ${jobIsActive ? "animate-spin" : ""}`} />}
            {job.currentStep}（{job.progress}%）
          </div>
          {(job.summary || job.errorMessage) && <p className="mt-1 leading-relaxed">{job.summary || job.errorMessage}</p>}
          {job.sites.length > 0 && (
            <ul className="mt-2 space-y-1">
              {job.sites.map((site) => (
                <li key={site.site}>{getEcPriceTargetLabel([site.site])}: {site.message}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          対象商品を一意に確定できない場合やログイン確認が必要な場合、Codexは変更せず停止します。
        </p>
      )}

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
