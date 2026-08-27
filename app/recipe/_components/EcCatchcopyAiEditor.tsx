"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Eye, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EC_COMMON_CATCHCOPY_MAX_LENGTH,
  validateEcCatchcopyAiResult,
  type EcCatchcopyAiResult,
} from "@/lib/ec-catchcopy-codex";

type Generation = EcCatchcopyAiResult & {
  generationId: string;
  model: string;
  reasoningEffort?: string;
  createdAt?: string;
};

type GenerationJob = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  result: unknown;
};

type Props = {
  recipeId: string;
  onChange: (catchcopy: string) => void;
};

export default function EcCatchcopyAiEditor({ recipeId, onChange }: Props) {
  const [generating, setGenerating] = useState(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStep, setJobStep] = useState("");
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const pollingJobRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const finishGeneration = useCallback((job: GenerationJob) => {
    const resultObject = job.result && typeof job.result === "object"
      ? job.result as Record<string, unknown>
      : {};
    const validated = validateEcCatchcopyAiResult(resultObject);
    const generationId = String(resultObject.generationId || "").trim();
    if (!generationId) throw new Error("AIキャッチコピーの生成履歴を確認できませんでした");
    setGeneration({
      ...validated,
      generationId,
      model: String(resultObject.model || "gpt-5.6-sol"),
      reasoningEffort: String(resultObject.reasoningEffort || "medium"),
      createdAt: String(resultObject.createdAt || ""),
    });
    setOpen(true);
    toast.success("GPT-5.6 Solが楽天・Yahoo共通のキャッチコピー候補を作成しました");
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    if (pollingJobRef.current === jobId) return;
    pollingJobRef.current = jobId;
    setGenerating(true);
    try {
      for (let count = 0; count < 240; count += 1) {
        const response = await fetch(`/api/recipe/${recipeId}/ec-catchcopy-ai?jobId=${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "AIキャッチコピーの進捗を確認できませんでした");
        const job = payload.job as GenerationJob | null;
        if (!job) throw new Error("AIキャッチコピー生成タスクが見つかりませんでした");
        if (!mountedRef.current) return;
        setJobProgress(job.progress);
        setJobStep(job.currentStep || "GPT-5.6 Solで分析しています");
        if (job.status === "completed") {
          finishGeneration(job);
          return;
        }
        if (["waiting_for_user", "needs_review", "failed", "cancelled"].includes(job.status)) {
          throw new Error(job.errorMessage || job.currentStep || "AIキャッチコピーの生成を完了できませんでした");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
      }
      throw new Error("AI分析が10分を超えました。ジョブは継続中のため、しばらく後に画面を再表示してください");
    } finally {
      if (pollingJobRef.current === jobId) pollingJobRef.current = null;
      if (mountedRef.current) setGenerating(false);
    }
  }, [finishGeneration, recipeId]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const response = await fetch(`/api/recipe/${recipeId}/ec-catchcopy-ai`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        const job = payload.job as GenerationJob | null;
        if (job && ["queued", "running"].includes(job.status)) await pollJob(job.id);
      } catch {
        // The explicit generate button reports recoverable status errors.
      }
    })();
    return () => { mountedRef.current = false; };
  }, [pollJob, recipeId]);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setJobProgress(0);
    setJobStep("事務所PCのBridgeへ登録しています");
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-catchcopy-ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AIキャッチコピーを生成できませんでした");
      const job = payload.job as GenerationJob | null;
      if (!job?.id) throw new Error("AIキャッチコピー生成タスクを登録できませんでした");
      setGenerating(false);
      await pollJob(job.id);
    } catch (error) {
      setGenerating(false);
      toast.error(error instanceof Error ? error.message : "AIキャッチコピーを生成できませんでした");
    }
  }

  async function regenerate() {
    if (generating) return;
    setOpen(false);
    await generate();
  }

  function applySuggestion() {
    if (!generation) return;
    onChange(generation.suggestion.catchcopy);
    setOpen(false);
    toast.success("共通キャッチコピーへ採用しました。レシピ保存後、楽天とYahooへ同じ値を反映できます");
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">
        <div>
          <p className="text-sm font-bold text-gray-800">楽天・Yahoo共通のキャッチコピーをAI生成</p>
          <p className="text-[11px] text-gray-500">両サイトへ同じ文言を登録できるよう、厳しい方の30文字上限で1件作成します。</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {generation && !generating && <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <Eye className="mr-2 h-4 w-4" />生成結果を見る
          </button>}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex min-h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {generating ? `GPT-5.6 Solで分析中 ${jobProgress}%` : "AIで共通キャッチコピーを作成"}
          </button>
        </div>
      </div>

      {generating && <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2" aria-live="polite">
        <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-blue-900">
          <span className="truncate">{jobStep || "GPT-5.6 Solで分析しています"}</span>
          <span className="shrink-0 font-mono">{jobProgress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
          <div className="h-full bg-blue-600 transition-[width] duration-500" style={{ width: `${Math.max(2, jobProgress)}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-blue-700">専用Skillのみを読む新規Bridgeセッションです。画面を閉じても処理は継続します。</p>
      </div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12">
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-blue-600" />共通キャッチコピー AI分析</DialogTitle>
            <DialogDescription>GPT-5.6 Solが楽天とYahooの条件を横断して作成した1件です。採用後、レシピを保存するまではECへ反映されません。</DialogDescription>
          </DialogHeader>
          {generation && <div className="overflow-y-auto px-5 py-4">
            <div className="border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              <p className="font-bold">総合判断</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{generation.overall_analysis}</p>
              {generation.source_gaps.length > 0 && <div className="mt-2 text-xs text-amber-800">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />不足情報: {generation.source_gaps.join(" / ")}
              </div>}
            </div>
            <div className="mt-4 border-y py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-gray-500">楽天・Yahoo 共通</p>
                <span className="font-mono text-xs text-gray-500">{generation.suggestion.catchcopy.length}/{EC_COMMON_CATCHCOPY_MAX_LENGTH}文字</span>
              </div>
              <p className="mt-2 break-words text-base font-bold leading-relaxed text-gray-950">{generation.suggestion.catchcopy}</p>
              <p className="mt-2 text-xs leading-relaxed text-gray-600">{generation.suggestion.rationale}</p>
              {generation.suggestion.selected_keywords.length > 0 && <p className="mt-2 text-xs text-blue-700">採用語: {generation.suggestion.selected_keywords.join("・")}</p>}
              {generation.suggestion.cautions.length > 0 && <p className="mt-2 text-xs text-amber-700">注意: {generation.suggestion.cautions.join(" / ")}</p>}
            </div>
          </div>}
          <DialogFooter className="border-t bg-gray-50 px-5 py-4">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-bold hover:bg-gray-100">
              <ArrowLeft className="mr-2 h-4 w-4" />戻す
            </button>
            <button type="button" onClick={() => void regenerate()} disabled={generating} className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-300 bg-white px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">
              <RefreshCw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />再生成
            </button>
            <button type="button" onClick={applySuggestion} className="inline-flex min-h-10 items-center justify-center rounded-md bg-gray-950 px-5 text-sm font-bold text-white hover:bg-gray-800">
              <Check className="mr-2 h-4 w-4" />共通キャッチコピーとして採用
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
