"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  EC_PRODUCT_NAME_RULES,
  EC_PRODUCT_NAME_TARGETS,
  normalizeEcProductNameForTarget,
  normalizeEcProductNamesBySite,
  validateEcProductNameAiResult,
  type EcProductNameAiResult,
  type EcProductNamesBySite,
  type EcProductNameTarget,
} from "@/lib/ec-product-name-codex";

type Generation = EcProductNameAiResult & {
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
  fallbackName: string | null | undefined;
  namesBySite: EcProductNamesBySite | null | undefined;
  onChange: (names: EcProductNamesBySite, fallbackName?: string) => void;
};

const SITE_ACCENTS: Record<EcProductNameTarget, string> = {
  amazon: "border-l-orange-500",
  rakuten: "border-l-red-500",
  yahoo: "border-l-violet-500",
  mercari: "border-l-sky-500",
  base: "border-l-emerald-600",
  qoo10: "border-l-pink-500",
  tiktok: "border-l-teal-500",
};

export default function EcProductNameAiEditor({ recipeId, fallbackName, namesBySite, onChange }: Props) {
  const [generating, setGenerating] = useState(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStep, setJobStep] = useState("");
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const pollingJobRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const current = useMemo(
    () => normalizeEcProductNamesBySite(namesBySite, fallbackName),
    [fallbackName, namesBySite],
  );

  function updateSite(target: EcProductNameTarget, value: string) {
    onChange({ ...current, [target]: normalizeEcProductNameForTarget(target, value) });
  }

  const finishGeneration = useCallback((job: GenerationJob) => {
    const resultObject = job.result && typeof job.result === "object"
      ? job.result as Record<string, unknown>
      : {};
    const validated = validateEcProductNameAiResult(resultObject);
    const generationId = String(resultObject.generationId || "").trim();
    if (!generationId) throw new Error("AI商品名の生成履歴を確認できませんでした");
    setGeneration({
      ...validated,
      generationId,
      model: String(resultObject.model || "gpt-5.6-sol"),
      reasoningEffort: String(resultObject.reasoningEffort || "medium"),
      createdAt: String(resultObject.createdAt || ""),
    });
    setOpen(true);
    toast.success("GPT-5.6 Solの商品名候補を作成しました");
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    if (pollingJobRef.current === jobId) return;
    pollingJobRef.current = jobId;
    setGenerating(true);
    try {
      for (let count = 0; count < 240; count += 1) {
        const response = await fetch(`/api/recipe/${recipeId}/ec-product-name-ai?jobId=${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "AI商品名の進捗を確認できませんでした");
        const job = payload.job as GenerationJob | null;
        if (!job) throw new Error("AI商品名生成タスクが見つかりませんでした");
        if (!mountedRef.current) return;
        setJobProgress(job.progress);
        setJobStep(job.currentStep || "GPT-5.6 Solで分析しています");
        if (job.status === "completed") {
          finishGeneration(job);
          return;
        }
        if (["waiting_for_user", "needs_review", "failed", "cancelled"].includes(job.status)) {
          throw new Error(job.errorMessage || job.currentStep || "AI商品名の生成を完了できませんでした");
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
        const response = await fetch(`/api/recipe/${recipeId}/ec-product-name-ai`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        const job = payload.job as GenerationJob | null;
        if (job && ["queued", "running"].includes(job.status)) {
          await pollJob(job.id);
        }
      } catch {
        // Initial status recovery is advisory; the explicit button reports errors.
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [pollJob, recipeId]);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setJobProgress(0);
    setJobStep("事務所PCのBridgeへ登録しています");
    try {
      const response = await fetch(`/api/recipe/${recipeId}/ec-product-name-ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI商品名を生成できませんでした");
      const job = payload.job as GenerationJob | null;
      if (!job?.id) throw new Error("AI商品名生成タスクを登録できませんでした");
      setGenerating(false);
      await pollJob(job.id);
    } catch (error) {
      setGenerating(false);
      toast.error(error instanceof Error ? error.message : "AI商品名を生成できませんでした");
    }
  }

  async function regenerate() {
    if (generating) return;
    setOpen(false);
    await generate();
  }

  function applyAll() {
    if (!generation) return;
    const names = Object.fromEntries(EC_PRODUCT_NAME_TARGETS.map(({ id }) => [id, generation.suggestions[id].name])) as EcProductNamesBySite;
    onChange(names, generation.suggestions.amazon.name);
    setOpen(false);
    toast.success("各ECの商品名候補を採用しました。内容を確認してレシピを保存してください");
  }

  function applyOne(target: EcProductNameTarget) {
    if (!generation) return;
    updateSite(target, generation.suggestions[target].name);
    toast.success(`${EC_PRODUCT_NAME_TARGETS.find(({ id }) => id === target)?.label}の候補を採用しました`);
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">
        <div>
          <p className="text-sm font-bold text-gray-800">EC別の商品名</p>
          <p className="text-[11px] text-gray-500">各ECのSEO・表示特性・文字数制限に合わせて個別に保存します。</p>
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
            {generating ? `GPT-5.6 Solで分析中 ${jobProgress}%` : "AIで各EC向け商品名を作成"}
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
        <p className="mt-1 text-[10px] text-blue-700">専用Skillのみを読み込む新規Bridgeセッションです。画面を閉じても処理は継続します。</p>
      </div>}

      <div className="divide-y rounded-md border border-gray-200 bg-white">
        {EC_PRODUCT_NAME_TARGETS.map(({ id, label }) => {
          const rule = EC_PRODUCT_NAME_RULES[id];
          const name = current[id] || "";
          const preferredExceeded = name.length > rule.generationMaxLength;
          return (
            <div key={id} className={`border-l-4 px-3 py-3 ${SITE_ACCENTS[id]}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-gray-800" htmlFor={`ec-name-${id}`}>{label}</label>
                <span className={`text-[11px] font-mono ${name.length >= rule.platformMaxLength ? "font-bold text-red-600" : preferredExceeded ? "text-amber-600" : "text-gray-400"}`}>
                  {name.length}/{rule.platformMaxLength}文字
                </span>
              </div>
              <input
                id={`ec-name-${id}`}
                type="text"
                value={name}
                maxLength={rule.platformMaxLength}
                onChange={(event) => updateSite(id, event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{rule.guidance}（AI推奨 {rule.generationMaxLength}文字以内）</p>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12">
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-blue-600" />EC商品名 AI分析</DialogTitle>
            <DialogDescription>GPT-5.6 Solが保存済みの商品情報だけを根拠に作成した候補です。採用しても、レシピ保存まではECへ反映されません。</DialogDescription>
          </DialogHeader>
          {generation && <div className="overflow-y-auto px-5 py-4">
            <div className="mb-4 border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              <p className="font-bold">総合判断</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{generation.overall_analysis}</p>
              {generation.source_gaps.length > 0 && <div className="mt-2 text-xs text-amber-800">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />不足情報: {generation.source_gaps.join(" / ")}
              </div>}
            </div>
            <div className="divide-y border-y">
              {EC_PRODUCT_NAME_TARGETS.map(({ id, label }) => {
                const item = generation.suggestions[id];
                const rule = EC_PRODUCT_NAME_RULES[id];
                return <div key={id} className="grid gap-3 py-4 md:grid-cols-[100px_minmax(0,1fr)_130px]">
                  <div className="font-bold text-gray-900">{label}</div>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold leading-relaxed text-gray-950">{item.name}</p>
                    <p className="mt-1 text-[11px] text-gray-500">{item.name.length}/{rule.platformMaxLength}文字 ・ {item.rationale}</p>
                    {item.selected_keywords.length > 0 && <p className="mt-1 text-[11px] text-blue-700">採用語: {item.selected_keywords.join("・")}</p>}
                    {item.cautions.length > 0 && <p className="mt-1 text-[11px] text-amber-700">注意: {item.cautions.join(" / ")}</p>}
                  </div>
                  <button type="button" onClick={() => applyOne(id)} className="inline-flex min-h-9 items-center justify-center self-start rounded-md border border-gray-300 bg-white px-3 text-xs font-bold hover:bg-gray-50">
                    <Check className="mr-1 h-4 w-4" />この候補を採用
                  </button>
                </div>;
              })}
            </div>
          </div>}
          <DialogFooter className="border-t bg-gray-50 px-5 py-4">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-bold hover:bg-gray-100">
              <ArrowLeft className="mr-2 h-4 w-4" />戻す
            </button>
            <button type="button" onClick={() => void regenerate()} disabled={generating} className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-300 bg-white px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">
              <RefreshCw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />再生成
            </button>
            <button type="button" onClick={applyAll} className="inline-flex min-h-10 items-center justify-center rounded-md bg-gray-950 px-5 text-sm font-bold text-white hover:bg-gray-800">
              <Check className="mr-2 h-4 w-4" />全候補を採用
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
