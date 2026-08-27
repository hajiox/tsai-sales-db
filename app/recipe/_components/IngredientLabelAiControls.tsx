"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { IngredientLabelAiResult, IngredientLabelJobView } from "@/lib/ingredient-label-codex";

const TERMINAL_ERROR_STATUSES = new Set(["waiting_for_user", "needs_review", "failed", "cancelled"]);

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
  const [generating, setGenerating] = useState(false);
  const pollingJob = useRef<string | null>(null);

  const finish = useCallback((completed: IngredientLabelJobView) => {
    setJob(completed);
    setGenerating(false);
    if (!completed.result) throw new Error("原材料表示の生成結果がありません");
    onGenerated(completed.result);
    toast.success(completed.result.adoption_blocked
      ? "表示案を生成しました。不足情報を確認してください"
      : "原材料表示の確認用候補を生成しました");
  }, [onGenerated]);

  const poll = useCallback(async (jobId: string) => {
    if (pollingJob.current === jobId) return;
    pollingJob.current = jobId;
    setGenerating(true);
    try {
      for (let count = 0; count < 240; count += 1) {
        const response = await fetch(
          `/api/recipe/generate-label?recipeId=${encodeURIComponent(recipeId)}&jobId=${encodeURIComponent(jobId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "原材料表示生成の進捗を確認できません");
        const nextJob = payload.job as IngredientLabelJobView | null;
        if (!nextJob) throw new Error("原材料表示生成タスクが見つかりません");
        setJob(nextJob);
        if (nextJob.status === "completed") {
          finish(nextJob);
          return;
        }
        if (TERMINAL_ERROR_STATUSES.has(nextJob.status)) {
          throw new Error(nextJob.errorMessage || nextJob.currentStep || "原材料表示を生成できませんでした");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_500));
      }
      throw new Error("生成が10分を超えました。Bridgeモニターで継続状況を確認してください");
    } finally {
      if (pollingJob.current === jobId) pollingJob.current = null;
      setGenerating(false);
    }
  }, [finish, recipeId]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const response = await fetch(
          `/api/recipe/generate-label?recipeId=${encodeURIComponent(recipeId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        const latest = payload.job as IngredientLabelJobView | null;
        if (!latest) return;
        setJob(latest);
        if (["queued", "running"].includes(latest.status)) {
          void poll(latest.id).catch((error) => {
            if (!cancelled) toast.error(error instanceof Error ? error.message : "原材料表示を生成できませんでした");
          });
        } else if (latest.status === "completed" && latest.result && hasLabel) {
          onGenerated(latest.result);
        }
      } catch {
        // The generation control remains usable even if history restoration fails.
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [hasLabel, onGenerated, poll, recipeId]);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setJob((current) => current ? { ...current, progress: 0, currentStep: "事務所PCのBridgeへ登録しています" } : null);
    try {
      const response = await fetch("/api/recipe/generate-label", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "原材料表示生成を開始できません");
      const nextJob = payload.job as IngredientLabelJobView | null;
      if (!nextJob?.id) throw new Error("原材料表示生成タスクを登録できません");
      setJob(nextJob);
      setGenerating(false);
      await poll(nextJob.id);
    } catch (error) {
      setGenerating(false);
      toast.error(error instanceof Error ? error.message : "原材料表示を生成できませんでした");
    }
  }

  const isActive = generating || ["queued", "running"].includes(job?.status || "");
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
        {isActive ? `生成中 ${job?.progress || 0}%` : hasLabel ? "Sol / Ultraで再生成" : "Sol / Ultraで生成"}
      </button>
      {isActive && (
        <div className="w-full min-w-[15rem] max-w-sm" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full bg-emerald-600 transition-[width] duration-500"
              style={{ width: `${Math.max(2, job?.progress || 0)}%` }}
            />
          </div>
          <p className="mt-1 truncate text-right text-[10px] text-emerald-700">
            {job?.currentStep || "事務所PCのBridgeへ登録しています"}
          </p>
        </div>
      )}
      {!isActive && job && TERMINAL_ERROR_STATUSES.has(job.status) && (
        <p className="max-w-sm text-right text-[10px] text-red-600">{job.errorMessage || job.currentStep}</p>
      )}
      <p className="text-[10px] text-gray-400">Codex Bridge / GPT-5.6 Sol / Ultra / 人による最終確認必須</p>
    </div>
  );
}
