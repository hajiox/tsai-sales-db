"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, RefreshCw, Scissors, Sparkles } from "lucide-react";
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
  EC_PRODUCT_CONTENT_MAX_CHARACTERS,
  validateEcProductContentAiResult,
  type EcProductContentAiResult,
} from "@/lib/ec-product-content-codex";

type Generation = EcProductContentAiResult & {
  generationId: string;
  model: string;
  reasoningEffort: string;
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
  productPoints: string;
  webDescription: string;
  totalCharacters: number;
  onApply: (value: { productPoints: string; webDescription: string }) => void;
};

export default function EcProductContentAiAdjuster({
  recipeId,
  productPoints,
  webDescription,
  totalCharacters,
  onApply,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const pollingJob = useRef<string | null>(null);

  const finish = useCallback((job: GenerationJob) => {
    const object = job.result && typeof job.result === "object" ? job.result as Record<string, unknown> : {};
    const validated = validateEcProductContentAiResult(object);
    const generationId = String(object.generationId || "").trim();
    if (!generationId) throw new Error("AI調整履歴を確認できませんでした");
    setGeneration({
      ...validated,
      generationId,
      model: String(object.model || "gpt-5.6-sol"),
      reasoningEffort: String(object.reasoningEffort || "medium"),
    });
    setOpen(true);
    toast.success("商品ポイントと商品説明を500文字以内へ調整しました");
  }, []);

  const poll = useCallback(async (jobId: string) => {
    if (pollingJob.current === jobId) return;
    pollingJob.current = jobId;
    setGenerating(true);
    try {
      for (let count = 0; count < 240; count += 1) {
        const response = await fetch(`/api/recipe/${recipeId}/ec-product-content-ai?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "AI調整の進捗を確認できませんでした");
        const job = payload.job as GenerationJob | null;
        if (!job) throw new Error("商品文章調整タスクが見つかりませんでした");
        setProgress(job.progress);
        setStep(job.currentStep || "商品文章を調整しています");
        if (job.status === "completed") { finish(job); return; }
        if (["waiting_for_user", "needs_review", "failed", "cancelled"].includes(job.status)) {
          throw new Error(job.errorMessage || job.currentStep || "商品文章を調整できませんでした");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
      }
      throw new Error("AI調整が10分を超えました。処理は継続中です");
    } finally {
      if (pollingJob.current === jobId) pollingJob.current = null;
      setGenerating(false);
    }
  }, [finish, recipeId]);

  async function generate() {
    if (generating || totalCharacters <= EC_PRODUCT_CONTENT_MAX_CHARACTERS) return;
    setGenerating(true);
    setProgress(0);
    setStep("事務所PCのBridgeへ登録しています");
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-product-content-ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productPoints, webDescription }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "商品文章を調整できませんでした");
      const job = payload.job as GenerationJob | null;
      if (!job?.id) throw new Error("商品文章調整タスクを登録できませんでした");
      setGenerating(false);
      await poll(job.id);
    } catch (error) {
      setGenerating(false);
      toast.error(error instanceof Error ? error.message : "商品文章を調整できませんでした");
    }
  }

  function apply() {
    if (!generation) return;
    onApply({ productPoints: generation.product_points, webDescription: generation.web_description });
    setOpen(false);
    toast.success("調整結果を入力欄へ反映しました。内容を確認して保存してください");
  }

  if (totalCharacters <= EC_PRODUCT_CONTENT_MAX_CHARACTERS && !generation) return null;

  return <>
    <button
      type="button"
      onClick={() => generation && !generating ? setOpen(true) : void generate()}
      disabled={generating}
      className="inline-flex min-h-9 items-center rounded-md bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
    >
      {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Scissors className="mr-1.5 h-4 w-4" />}
      {generating ? `調整中 ${progress}%` : generation ? "調整結果を見る" : "500文字以内に調整"}
    </button>
    {generating && <span className="min-w-0 truncate text-xs text-blue-700" aria-live="polite">{step}</span>}

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-blue-600" />商品文章の500文字調整</DialogTitle>
          <DialogDescription>事実と訴求の優先度を保ちながら重複を整理した案です。採用後にレシピを保存するまではECへ反映されません。</DialogDescription>
        </DialogHeader>
        {generation && <div className="overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-sm font-bold text-gray-800">調整後</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700">{generation.total_characters}/{EC_PRODUCT_CONTENT_MAX_CHARACTERS}文字</span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div><p className="mb-1 text-xs font-bold text-gray-500">商品ポイント</p><div className="min-h-40 whitespace-pre-wrap rounded-md border bg-gray-50 p-3 text-sm leading-relaxed">{generation.product_points}</div></div>
            <div><p className="mb-1 text-xs font-bold text-gray-500">Web商品説明</p><div className="min-h-40 whitespace-pre-wrap rounded-md border bg-gray-50 p-3 text-sm leading-relaxed">{generation.web_description}</div></div>
          </div>
          {generation.rationale && <p className="mt-4 text-xs leading-relaxed text-gray-600">調整方針: {generation.rationale}</p>}
          {generation.removed_or_condensed.length > 0 && <p className="mt-2 text-xs text-amber-700">要約・整理: {generation.removed_or_condensed.join(" / ")}</p>}
        </div>}
        <DialogFooter className="border-t bg-gray-50 px-5 py-4">
          <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center rounded-md border bg-white px-4 text-sm font-bold"><ArrowLeft className="mr-2 h-4 w-4" />戻す</button>
          <button type="button" onClick={() => { setOpen(false); void generate(); }} disabled={generating} className="inline-flex min-h-10 items-center rounded-md border border-blue-300 bg-white px-4 text-sm font-bold text-blue-700"><RefreshCw className="mr-2 h-4 w-4" />再調整</button>
          <button type="button" onClick={apply} className="inline-flex min-h-10 items-center rounded-md bg-gray-950 px-5 text-sm font-bold text-white"><Check className="mr-2 h-4 w-4" />この内容を採用</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
