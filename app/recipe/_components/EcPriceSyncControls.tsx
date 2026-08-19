"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  EC_PRICE_TARGETS,
  getEcPriceTargetLabel,
  type EcPriceJobView,
  type EcPriceTarget,
} from "@/lib/ec-price-codex";

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
  const [job, setJob] = useState<EcPriceJobView | null>(null);
  const notifiedJobId = useRef<string | null>(null);
  const hasPrice = Number.isFinite(sellingPriceInclTax) && sellingPriceInclTax > 0;
  const jobIsActive = Boolean(job && ACTIVE_STATUSES.has(job.status));
  const disabled = hasUnsavedChanges || isSaving || submitting || jobIsActive || !hasPrice;

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
      } catch (error) {
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
    const confirmed = window.confirm(
      [
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
          expectedPriceInclTax: sellingPriceInclTax,
          expectedRecipeSnapshot,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "価格変更を開始できません");
      setJob(payload.job as EcPriceJobView);
      notifiedJobId.current = null;
      toast.success(payload.reused ? "実行中の価格変更を表示します" : "事務所PCのCodexへ価格変更を登録しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "価格変更を開始できません");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">EC価格反映</h3>
        <p className="mt-1 text-xs text-slate-500">
          保存済みの税込価格を、事務所PCのCodexが価格改定Skillで反映します。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EC_PRICE_TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => enqueue([target.id])}
            disabled={disabled}
            title={hasUnsavedChanges ? "先にレシピを保存してください" : `${target.label}へ反映`}
            className={`rounded px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 ${TARGET_STYLES[target.id]}`}
          >
            {target.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => enqueue(EC_PRICE_TARGETS.map((target) => target.id))}
        disabled={disabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {(submitting || jobIsActive) && <Loader2 className="h-4 w-4 animate-spin" />}
        全て反映
      </button>

      {hasUnsavedChanges ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          価格を含む変更を先に保存すると、反映ボタンが有効になります。
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
    </section>
  );
}
