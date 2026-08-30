"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  History,
  ImageIcon,
  Link2,
  Loader2,
  Megaphone,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  RECIPE_SNS_PLATFORMS,
  countRecipeSnsCharacters,
  ensureRecipeSnsPostDestinationUrl,
  formatRecipeSnsPost,
  normalizeRecipeSnsHashtag,
  recipeSnsImageModeLabel,
  type RecipeSnsGenerationView,
  type RecipeSnsImageMode,
  type RecipeSnsPlatform,
  type RecipeSnsPost,
} from "@/lib/recipe-sns";

type RecipeSnsJob = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  generationId: string;
  imageMode: RecipeSnsImageMode;
  targetPlatform: RecipeSnsPlatform | null;
};

type SnsResponse = {
  job: RecipeSnsJob | null;
  generations: RecipeSnsGenerationView[];
};

type Props = {
  recipeId: string;
  hasUnsavedChanges: boolean;
};

const PLATFORM_ACCENTS: Record<RecipeSnsPlatform, string> = {
  x: "border-t-gray-900",
  instagram: "border-t-pink-500",
  instagram_story: "border-t-fuchsia-500",
  threads: "border-t-gray-700",
};

function formatGenerationDate(value: string) {
  if (!value) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function clonePosts(generation: RecipeSnsGenerationView | null) {
  if (!generation?.posts) return null;
  return Object.fromEntries(RECIPE_SNS_PLATFORMS.map((platform) => {
    const post = generation.posts!.posts[platform.id];
    return [platform.id, { ...post, hashtags: [...post.hashtags] }];
  })) as Record<RecipeSnsPlatform, RecipeSnsPost>;
}

export default function RecipeSnsStudio({ recipeId, hasUnsavedChanges }: Props) {
  const [generations, setGenerations] = useState<RecipeSnsGenerationView[]>([]);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);
  const [job, setJob] = useState<RecipeSnsJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingMode, setGeneratingMode] = useState<RecipeSnsImageMode | null>(null);
  const [generatingPlatform, setGeneratingPlatform] = useState<RecipeSnsPlatform | null>(null);
  const [editedPosts, setEditedPosts] = useState<Record<RecipeSnsPlatform, RecipeSnsPost> | null>(null);
  const mountedRef = useRef(true);
  const pollingRef = useRef<string | null>(null);
  const loadedDraftSignatureRef = useRef("");

  const selectedGeneration = useMemo(
    () => generations.find((generation) => generation.id === selectedGenerationId) || generations[0] || null,
    [generations, selectedGenerationId],
  );

  useEffect(() => {
    const signature = selectedGeneration
      ? `${selectedGeneration.id}:${selectedGeneration.completedAt || selectedGeneration.status}`
      : "";
    if (loadedDraftSignatureRef.current === signature) return;
    loadedDraftSignatureRef.current = signature;
    setEditedPosts(clonePosts(selectedGeneration));
  }, [selectedGeneration]);

  const loadState = useCallback(async (jobId?: string) => {
    const suffix = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const response = await fetch(`/api/recipe/${recipeId}/sns-generations${suffix}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "SNS生成状況を確認できませんでした");
    const next = payload as SnsResponse;
    if (!mountedRef.current) return next;
    setJob(next.job || null);
    setGenerations(next.generations || []);
    setSelectedGenerationId((current) => {
      const currentJobGeneration = next.job?.id
        ? next.generations.find((generation) => generation.jobId === next.job?.id)
        : null;
      if (currentJobGeneration) return currentJobGeneration.id;
      if (current && next.generations.some((generation) => generation.id === current)) return current;
      const preferred = next.generations.find((generation) => generation.status === "completed")
        || next.generations[0];
      return preferred?.id || null;
    });
    return next;
  }, [recipeId]);

  const pollJob = useCallback(async (jobId: string) => {
    if (pollingRef.current === jobId) return;
    pollingRef.current = jobId;
    setGenerating(true);
    try {
      for (let count = 0; count < 720; count += 1) {
        const state = await loadState(jobId);
        const current = state.job;
        if (!current) throw new Error("SNS生成タスクが見つかりませんでした");
        if (mountedRef.current) {
          setGeneratingMode(current.imageMode);
          setGeneratingPlatform(current.targetPlatform);
        }
        if (current.status === "completed") {
          await loadState();
          const target = RECIPE_SNS_PLATFORMS.find((platform) => platform.id === current.targetPlatform);
          toast.success(target ? `${target.label}の画像と投稿文を再生成しました` : "SNS画像と投稿文を作成しました");
          return;
        }
        if (["waiting_for_user", "needs_review", "failed", "cancelled"].includes(current.status)) {
          throw new Error(current.errorMessage || current.currentStep || "SNS生成を完了できませんでした");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
      }
      throw new Error("SNS素材生成が30分を超えました。Bridgeでは処理を継続しています");
    } finally {
      if (pollingRef.current === jobId) pollingRef.current = null;
      if (mountedRef.current) {
        setGenerating(false);
        setGeneratingMode(null);
        setGeneratingPlatform(null);
      }
    }
  }, [loadState]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      setLoading(true);
      try {
        const state = await loadState();
        if (state.job && ["queued", "running"].includes(state.job.status)) {
          await pollJob(state.job.id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "SNS生成状況を確認できませんでした");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [loadState, pollJob]);

  async function generate(
    imageMode: RecipeSnsImageMode,
    targetPlatform?: RecipeSnsPlatform,
    baseGenerationId?: string,
  ) {
    if (generating || hasUnsavedChanges) return;
    setGenerating(true);
    setGeneratingMode(imageMode);
    setGeneratingPlatform(targetPlatform || null);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/sns-generations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageMode, targetPlatform, baseGenerationId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "SNS生成を開始できませんでした");
      const nextJob = payload.job as RecipeSnsJob | null;
      if (!nextJob?.id) throw new Error("SNS生成タスクを登録できませんでした");
      setJob(nextJob);
      setGenerating(false);
      await pollJob(nextJob.id);
    } catch (error) {
      setGenerating(false);
      setGeneratingMode(null);
      setGeneratingPlatform(null);
      toast.error(error instanceof Error ? error.message : "SNS生成を開始できませんでした");
    }
  }

  function updatePost(platform: RecipeSnsPlatform, next: RecipeSnsPost) {
    setEditedPosts((current) => current ? { ...current, [platform]: next } : current);
  }

  async function copyPost(platform: RecipeSnsPlatform) {
    const post = editedPosts?.[platform];
    if (!post) return;
    const normalizedPost = ensureRecipeSnsPostDestinationUrl(
      post,
      platform,
      selectedGeneration?.destinationUrl,
    );
    await navigator.clipboard.writeText(formatRecipeSnsPost(normalizedPost));
    toast.success(`${RECIPE_SNS_PLATFORMS.find((item) => item.id === platform)?.label}の投稿文をコピーしました`);
  }

  async function copyStoryLink(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("IGストーリーのリンクURLをコピーしました");
  }

  return (
    <section className="mx-auto max-w-[1400px] px-3 py-5 sm:px-4 lg:px-8" aria-labelledby="recipe-sns-heading">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-pink-600" />
            <h2 id="recipe-sns-heading" className="text-lg font-bold text-gray-900">SNS投稿作成</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            保存済み商品情報と元画像1枚だけを、専用の新規Bridgeセッションで媒体別素材にします。
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {generations.length > 0 && (
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-600">
              <History className="h-4 w-4" />
              <span className="sr-only">生成履歴</span>
              <select
                value={selectedGeneration?.id || ""}
                onChange={(event) => setSelectedGenerationId(event.target.value)}
                className="max-w-48 bg-transparent text-sm font-medium outline-none"
              >
                {generations.map((generation, index) => (
                    <option key={generation.id} value={generation.id}>
                      第{generations.length - index}版 {recipeSnsImageModeLabel(generation.imageMode)}
                      {generation.targetPlatform
                        ? `・${RECIPE_SNS_PLATFORMS.find((platform) => platform.id === generation.targetPlatform)?.label}再生成`
                        : ""} {formatGenerationDate(generation.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => void generate("normal")}
              disabled={generating || hasUnsavedChanges}
              className="inline-flex min-h-10 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={hasUnsavedChanges ? "EC情報を保存してから生成してください" : "元画像を媒体推奨サイズへ変換"}
            >
              {generatingMode === "normal" && !generatingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
              通常リサイズ
            </button>
            <button
              type="button"
              onClick={() => void generate("creative")}
              disabled={generating || hasUnsavedChanges}
              className="inline-flex min-h-10 items-center rounded-md bg-gray-900 px-4 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              title={hasUnsavedChanges ? "EC情報を保存してから生成してください" : "広告用の構図と正確な日本語見出しを生成"}
            >
              {generatingMode === "creative" && !generatingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
              クリエイティブ
            </button>
            <button
              type="button"
              onClick={() => void generate("arrange")}
              disabled={generating || hasUnsavedChanges}
              className="inline-flex min-h-10 items-center rounded-md border border-pink-300 bg-pink-50 px-4 text-sm font-bold text-pink-800 hover:bg-pink-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={hasUnsavedChanges ? "EC情報を保存してから生成してください" : "料理を自然な生活シーンへ配置"}
            >
              {generatingMode === "arrange" && !generatingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              アレンジ
            </button>
          </div>
        </div>
      </div>

      {hasUnsavedChanges && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>未保存のEC情報があります。上部または下部の「保存」を押してからSNS投稿を生成してください。</span>
        </div>
      )}

      {(generating || (job && ["queued", "running"].includes(job.status))) && (
        <div className="mt-4 border-l-4 border-blue-600 bg-blue-50 px-4 py-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm font-bold text-blue-950">
            <span className="truncate">{job?.currentStep || "媒体別SNS素材を作成しています"}</span>
            <span className="shrink-0 font-mono">{job?.progress || 0}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
            <div className="h-full bg-blue-600 transition-[width] duration-500" style={{ width: `${Math.max(2, job?.progress || 0)}%` }} />
          </div>
          <p className="mt-1 text-xs text-blue-700">
            巨大な過去Chatは読み込みません。専用Skill、固定済み商品情報、元画像1枚だけを新規Bridgeセッションで処理しています。
          </p>
        </div>
      )}

      {loading && generations.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />生成履歴を確認しています
        </div>
      ) : !selectedGeneration ? (
        <div className="mt-6 flex min-h-64 flex-col items-center justify-center border border-dashed border-gray-300 bg-gray-50 px-4 text-center">
          <ImageIcon className="h-9 w-9 text-gray-300" />
          <p className="mt-3 text-sm font-bold text-gray-700">まだSNS投稿はありません</p>
          <p className="mt-1 max-w-lg text-xs text-gray-500">上の3モードから、最初のSNS素材を作成してください。</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-1 font-medium ${selectedGeneration.status === "failed" ? "text-amber-700" : "text-emerald-700"}`}>
                {selectedGeneration.status === "completed"
                  ? <CheckCircle2 className="h-4 w-4" />
                  : selectedGeneration.status === "failed"
                    ? <AlertTriangle className="h-4 w-4 text-amber-600" />
                    : <Loader2 className="h-4 w-4 animate-spin" />}
                {selectedGeneration.status === "completed"
                  ? "生成完了"
                  : selectedGeneration.status === "failed"
                    ? "素材生成は未完了"
                    : "素材生成中"}
              </span>
              <span>生成: {recipeSnsImageModeLabel(selectedGeneration.imageMode)}</span>
              <span>
                {selectedGeneration.targetPlatform
                  ? `${RECIPE_SNS_PLATFORMS.find((platform) => platform.id === selectedGeneration.targetPlatform)?.label}だけ再生成（他媒体は前版を保持）`
                  : `画像元: ${selectedGeneration.sourceImageRole === "portrait" ? "ポートレート画像" : "Web商品画像（先頭）"}`}
              </span>
              <span>訴求軸: {selectedGeneration.variationKey}</span>
            </div>
            <span>GPT-5.6 Sol / {selectedGeneration.reasoningEffort}</span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {RECIPE_SNS_PLATFORMS.map((platform) => {
              const variant = selectedGeneration.imageVariants[platform.id];
              const post = editedPosts?.[platform.id] || null;
              const normalizedPost = post
                ? ensureRecipeSnsPostDestinationUrl(post, platform.id, selectedGeneration.destinationUrl)
                : null;
              const combined = normalizedPost ? formatRecipeSnsPost(normalizedPost) : "";
              const length = countRecipeSnsCharacters(combined);
              const over = length > platform.maxLength;
              return (
                <article key={platform.id} className={`overflow-hidden rounded-md border border-gray-200 border-t-4 bg-white ${PLATFORM_ACCENTS[platform.id]}`}>
                  <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{platform.label}</h3>
                      <p className="text-[10px] text-gray-400">
                        {platform.aspectLabel} / {platform.maxLength.toLocaleString()}文字以内
                        {` / ${recipeSnsImageModeLabel(selectedGeneration.imageMode)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void generate(selectedGeneration.imageMode, platform.id, selectedGeneration.id)}
                        disabled={generating || hasUnsavedChanges || selectedGeneration.status !== "completed"}
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-gray-200 px-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                        title={`${platform.label}だけを同じモードで再生成`}
                      >
                        {generatingPlatform === platform.id
                          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          : <RefreshCw className="mr-1.5 h-4 w-4" />}
                        再生成
                      </button>
                      {variant?.url && (
                        <a
                          href={variant.url}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                          title={`${platform.label}画像を保存`}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-0 sm:grid-cols-[minmax(160px,0.8fr)_minmax(0,1.2fr)]">
                    {variant?.url ? (
                      <a href={variant.url} target="_blank" rel="noreferrer" className="block bg-gray-100" style={{ aspectRatio: `${variant.width}/${variant.height}` }}>
                        {/* Generated Blob URLs are dynamic and are not part of the static Next Image allow-list. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={variant.url} alt={`${platform.label}用の${recipeSnsImageModeLabel(selectedGeneration.imageMode)}画像`} className="h-full w-full object-cover" />
                      </a>
                    ) : (
                      <div className="flex min-h-48 items-center justify-center bg-gray-100 text-xs text-gray-400">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />画像生成中
                      </div>
                    )}
                    <div className="min-w-0 space-y-3 border-t border-gray-100 p-3 sm:border-l sm:border-t-0">
                      {post ? (
                        <>
                          <div>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="text-xs font-bold text-gray-700">投稿文</label>
                              <span className={`font-mono text-[10px] ${over ? "font-bold text-red-600" : "text-gray-400"}`}>{length}/{platform.maxLength}</span>
                            </div>
                            <textarea
                              value={post.text}
                              onChange={(event) => updatePost(platform.id, { ...post, text: event.target.value })}
                              rows={platform.id === "instagram" ? 8 : platform.id === "instagram_story" ? 3 : 5}
                              className={`w-full resize-y rounded-md border px-2.5 py-2 text-sm leading-relaxed outline-none focus:ring-1 ${over ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-gray-300 focus:border-gray-700 focus:ring-gray-700"}`}
                            />
                          </div>
                          {platform.maxHashtags > 0 && (
                            <div>
                              <label className="mb-1 block text-xs font-bold text-gray-700">ハッシュタグ</label>
                              <input
                                value={post.hashtags.join(" ")}
                                onChange={(event) => {
                                  const hashtags = event.target.value.split(/\s+/).map(normalizeRecipeSnsHashtag).filter(Boolean).slice(0, platform.maxHashtags);
                                  updatePost(platform.id, { ...post, hashtags });
                                }}
                                className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-gray-700 focus:ring-1 focus:ring-gray-700"
                              />
                              <p className="mt-1 text-[10px] text-gray-400">{post.hashtags.length}件{platform.minHashtags > 0 ? ` / 推奨${platform.minHashtags}〜${platform.maxHashtags}件` : ""}</p>
                            </div>
                          )}
                          {platform.id === "instagram_story" && normalizedPost?.linkUrl && (
                            <div>
                              <label className="mb-1 block text-xs font-bold text-gray-700">リンクスタンプ用URL</label>
                              <div className="flex min-w-0 items-center gap-2">
                                <input
                                  readOnly
                                  value={normalizedPost.linkUrl}
                                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => void copyStoryLink(normalizedPost.linkUrl!)}
                                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                  title="リンクスタンプ用URLをコピー"
                                >
                                  <Link2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => void copyPost(platform.id)}
                            disabled={over}
                            className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-gray-900 px-3 text-xs font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ClipboardCopy className="mr-2 h-4 w-4" />投稿文をコピー
                          </button>
                        </>
                      ) : selectedGeneration.status === "failed" ? (
                        <div className="flex min-h-36 items-center justify-center text-center text-xs text-amber-700">
                          <AlertTriangle className="mr-2 h-4 w-4" />素材を生成できませんでした。上の3モードから再実行できます。
                        </div>
                      ) : (
                        <div className="flex min-h-36 items-center justify-center text-center text-xs text-gray-400">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Solが投稿文を作成しています
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {selectedGeneration.posts?.source_gaps.length ? (
            <div className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <p className="font-bold">参照できなかった情報</p>
              <p className="mt-1 whitespace-pre-wrap">{selectedGeneration.posts.source_gaps.join(" / ")}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
