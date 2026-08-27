"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { IngredientLabelAiResult, IngredientLabelJobView } from "@/lib/ingredient-label-codex";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const TERMINAL_ERROR_STATUSES = new Set(["waiting_for_user", "needs_review", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 2_500;

type IngredientLabelAiControlsProps = {
  recipeId: string;
  hasLabel: boolean;
  onGenerated: (result: IngredientLabelAiResult) => void;
};

export default function IngredientLabelAiControls({
  recipeId,
  hasLabel,
  onGenerated,
}: IngredientLabelAiControlsProps) {
  const [job, setJob] = useState<IngredientLabelJobView | null>(null);
  const [starting, setStarting] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const appliedJobId = useRef<string | null>(null);
  const startedJobId = useRef<string | null>(null);

  const applyServerJob = useCallback((nextJob: IngredientLabelJobView) => {
    setJob(nextJob);
    setSyncWarning(null);
    if (nextJob.status !== "completed") return;
    if (!nextJob.result) {
      setSyncWarning("完了結果を読み込めません。進捗を再確認しています");
      return;
    }
    if (appliedJobId.current === nextJob.id) return;
    appliedJobId.current = nextJob.id;
    onGenerated(nextJob.result);
    if (startedJobId.current === nextJob.id) {
      startedJobId.current = null;
      toast.success(nextJob.result.adoption_blocked
        ? "表示案を生成しました。不足情報を確認してください"
        : "原材料表示の確認用候補を生成しました");
    }
  }, [onGenerated]);

  const loadJob = useCallback(async (jobId?: string) => {
    const query = new URLSearchParams({ recipeId });
    if (jobId) query.set("jobId", jobId);
    const response = await fetch(`/api/recipe/generate-label?${query.toString()}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload.error || "原材料表示生成の進捗を確認できません"));
    }
    const nextJob = (payload.job || null) as IngredientLabelJobView | null;
    if (jobId && !nextJob) throw new Error("原材料表示生成タスクが見つかりません");
    return nextJob;
  }, [recipeId]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    async function restore() {
      try {
        const latest = await loadJob();
        if (cancelled) return;
        setSyncWarning(null);
        if (latest) applyServerJob(latest);
      } catch {
        if (!cancelled) {
          setSyncWarning("前回の生成状況を再確認しています");
          retryTimer = window.setTimeout(restore, POLL_INTERVAL_MS);
        }
      }
    }
    void restore();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [applyServerJob, loadJob]);

  const activeJobId = job && ACTIVE_STATUSES.has(job.status) ? job.id : null;

  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const latest = await loadJob(activeJobId || undefined);
        if (!cancelled && latest) applyServerJob(latest);
      } catch {
        if (!cancelled) setSyncWarning("通信を再接続し、確定済みの進捗を再確認しています");
      } finally {
        if (!cancelled) timer = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeJobId, applyServerJob, loadJob]);

  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      void loadJob(activeJobId || undefined)
        .then((latest) => {
          setSyncWarning(null);
          if (latest) applyServerJob(latest);
        })
        .catch(() => setSyncWarning("画面復帰後の進捗を再確認しています"));
    };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [activeJobId, applyServerJob, loadJob]);

  async function generate() {
    if (starting || activeJobId) return;
    setStarting(true);
    setSyncWarning(null);
    try {
      const response = await fetch("/api/recipe/generate-label", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || "原材料表示生成を開始できません"));
      const nextJob = (payload.job || null) as IngredientLabelJobView | null;
      if (!nextJob?.id) throw new Error("原材料表示生成タスクを登録できません");
      startedJobId.current = nextJob.id;
      applyServerJob(nextJob);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "原材料表示を生成できませんでした");
    } finally {
      setStarting(false);
    }
  }

  const isActive = starting || Boolean(activeJobId);
  const displayedProgress = starting ? 0 : job?.progress || 0;
  const displayedStep = starting
    ? "事務所PCのBridgeへ登録しています"
    : syncWarning || job?.currentStep || "事務所PCのBridgeへ登録しています";

  return (
    <div className="flex min-w-0 flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={isActive}
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
      >
        {isActive
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          : <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />}
        {isActive ? `生成中 ${displayedProgress}%` : hasLabel ? "Sol / Ultraで再生成" : "Sol / Ultraで生成"}
      </button>
      {isActive && (
        <div className="w-full min-w-[15rem] max-w-sm" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full bg-emerald-600 transition-[width] duration-500"
              style={{ width: `${Math.max(2, displayedProgress)}%` }}
            />
          </div>
          <p className={`mt-1 truncate text-right text-[10px] ${syncWarning ? "text-amber-700" : "text-emerald-700"}`}>
            {displayedStep}
          </p>
        </div>
      )}
      {!isActive && syncWarning && (
        <p className="max-w-sm text-right text-[10px] text-amber-700">{syncWarning}</p>
      )}
      {!isActive && job && TERMINAL_ERROR_STATUSES.has(job.status) && (
        <p className="max-w-sm text-right text-[10px] text-red-600">{job.errorMessage || job.currentStep}</p>
      )}
      <p className="text-[10px] text-gray-400">Codex Bridge / GPT-5.6 Sol / Ultra / 人による最終確認必須</p>
    </div>
  );
}
