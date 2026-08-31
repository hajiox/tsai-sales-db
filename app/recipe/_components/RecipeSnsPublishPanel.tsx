"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Send,
  Square,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  RECIPE_SNS_PLATFORMS,
  type RecipeSnsGenerationView,
  type RecipeSnsPlatform,
  type RecipeSnsPost,
} from "@/lib/recipe-sns";
import {
  RECIPE_SNS_EXPECTED_ACCOUNTS,
  type RecipeSnsPublicationView,
} from "@/lib/recipe-sns-publish";

type Props = {
  recipeId: string;
  generation: RecipeSnsGenerationView;
  posts: Record<RecipeSnsPlatform, RecipeSnsPost> | null;
  disabled: boolean;
};

const PLATFORM_BUTTONS: Record<RecipeSnsPlatform, string> = {
  x: "border-gray-900 bg-gray-900 text-white hover:bg-gray-800",
  instagram: "border-pink-600 bg-pink-600 text-white hover:bg-pink-700",
  instagram_story: "border-fuchsia-600 bg-fuchsia-600 text-white hover:bg-fuchsia-700",
  threads: "border-gray-700 bg-gray-700 text-white hover:bg-gray-800",
};

const ACTIVE_STATUSES = new Set(["scheduled", "queued", "running"]);

function defaultScheduleValue() {
  const value = new Date(Date.now() + 60 * 60_000);
  value.setMinutes(Math.ceil(value.getMinutes() / 5) * 5, 0, 0);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  if (!value) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: RecipeSnsPublicationView["status"]) {
  return {
    scheduled: "予約済み",
    queued: "実行待ち",
    running: "投稿中",
    completed: "完了",
    partial: "一部完了",
    waiting_for_user: "操作待ち",
    needs_review: "確認待ち",
    failed: "失敗",
    cancelled: "取消済み",
  }[status];
}

function statusClass(status: RecipeSnsPublicationView["status"]) {
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "scheduled" || status === "queued" || status === "running") return "bg-blue-100 text-blue-800";
  if (status === "cancelled") return "bg-gray-100 text-gray-600";
  return "bg-amber-100 text-amber-900";
}

export default function RecipeSnsPublishPanel({ recipeId, generation, posts, disabled }: Props) {
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduleValue, setScheduleValue] = useState(defaultScheduleValue);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [history, setHistory] = useState<RecipeSnsPublicationView[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [pollRevision, setPollRevision] = useState(0);

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/recipe/${recipeId}/sns-publications`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "SNS投稿履歴を確認できませんでした");
    setHistory(Array.isArray(payload.publications) ? payload.publications : []);
    return Array.isArray(payload.publications) ? payload.publications as RecipeSnsPublicationView[] : [];
  }, [recipeId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    async function refresh() {
      try {
        const rows = await loadHistory();
        if (cancelled) return;
        const active = rows.filter((row) => ACTIVE_STATUSES.has(row.status));
        if (active.length > 0) {
          const hasDueOrRunning = active.some((row) => row.status !== "scheduled" || Date.parse(row.scheduledAt) <= Date.now() + 60_000);
          timer = window.setTimeout(refresh, hasDueOrRunning ? 2_500 : 30_000);
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "SNS投稿履歴を確認できませんでした");
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [loadHistory, pollRevision]);

  const canPublish = useMemo(() => (
    !disabled
    && generation.status === "completed"
    && Boolean(posts)
    && RECIPE_SNS_PLATFORMS.every((platform) => Boolean(generation.imageVariants[platform.id]?.url && posts?.[platform.id]))
  ), [disabled, generation, posts]);
  const activeTargets = useMemo(() => new Set(
    history
      .filter((publication) => (
        publication.generationId === generation.id
        && (publication.status === "running"
          || publication.status === "queued"
          || (publication.status === "scheduled" && Date.parse(publication.scheduledAt) <= Date.now() + 60_000))
      ))
      .flatMap((publication) => publication.targets),
  ), [generation.id, history]);

  async function publish(targets: RecipeSnsPlatform[]) {
    if (!canPublish || submitting) return;
    let scheduledAt: string | null = null;
    if (mode === "schedule") {
      const timestamp = Date.parse(scheduleValue);
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        toast.error("現在より後の予約日時を指定してください");
        return;
      }
      scheduledAt = new Date(timestamp).toISOString();
    }
    const targetLabels = targets.map((target) => RECIPE_SNS_PLATFORMS.find((platform) => platform.id === target)?.label).join("・");
    const action = mode === "schedule" ? `${formatDate(scheduledAt!)}に予約` : "今すぐ公開";
    if (!window.confirm([
      `${targetLabels}へ${action}します。投稿文・画像・投稿先アカウントを確定してよろしいですか？`,
      "この実行で公開直後に本文・画像・リンクの不一致が確認された場合は、その不完全投稿だけを削除候補として止め、対話中のCodexで確認後に削除します。",
    ].join("\n\n"))) return;
    setSubmitting(targets.length === RECIPE_SNS_PLATFORMS.length ? "all" : targets[0]);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/sns-publications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          generationId: generation.id,
          targets,
          posts,
          scheduledAt,
          cleanupMalformedOwnAttemptAuthorized: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "SNS投稿を登録できませんでした");
      await loadHistory();
      setPollRevision((current) => current + 1);
      toast.success(payload.reused
        ? "同じSNS投稿依頼はすでに登録済みです"
        : mode === "schedule" ? "SNS投稿を予約しました" : "SNS投稿をBridgeへ渡しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SNS投稿を登録できませんでした");
    } finally {
      setSubmitting(null);
    }
  }

  async function cancelPublication(publicationId: string) {
    if (submitting || !window.confirm("このSNS投稿予約を取り消しますか？")) return;
    setSubmitting(`cancel:${publicationId}`);
    try {
      const response = await fetch(`/api/recipe/${recipeId}/sns-publications`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicationId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "SNS投稿予約を取り消せませんでした");
      await loadHistory();
      setPollRevision((current) => current + 1);
      toast.success("SNS投稿予約を取り消しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SNS投稿予約を取り消せませんでした");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mt-5 border-y border-gray-200 bg-gray-50 px-3 py-4 sm:px-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-gray-800" />
            <h3 className="text-sm font-bold text-gray-900">会津ブランド館 SNS投稿</h3>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            X: @Aizu_Brand_Kan / Instagram・IGストーリー・Threads: @aizubrandhall
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid min-h-10 grid-cols-2 rounded-md border border-gray-300 bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode("now")}
              className={`inline-flex min-w-28 items-center justify-center rounded px-3 text-xs font-bold ${mode === "now" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />今すぐ投稿
            </button>
            <button
              type="button"
              onClick={() => setMode("schedule")}
              className={`inline-flex min-w-28 items-center justify-center rounded px-3 text-xs font-bold ${mode === "schedule" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />日時予約
            </button>
          </div>
          {mode === "schedule" && (
            <input
              type="datetime-local"
              value={scheduleValue}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
              onChange={(event) => setScheduleValue(event.target.value)}
              className="min-h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-gray-700 focus:ring-1 focus:ring-gray-700"
            />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {RECIPE_SNS_PLATFORMS.map((platform) => (
          <button
            key={platform.id}
            type="button"
            onClick={() => void publish([platform.id])}
            disabled={!canPublish || Boolean(submitting) || activeTargets.has(platform.id)}
            className={`inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${PLATFORM_BUTTONS[platform.id]}`}
            title={`${RECIPE_SNS_EXPECTED_ACCOUNTS[platform.id]}へ${mode === "schedule" ? "予約" : "投稿"}`}
          >
            {submitting === platform.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            {platform.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void publish(RECIPE_SNS_PLATFORMS.map((platform) => platform.id))}
        disabled={!canPublish || Boolean(submitting) || activeTargets.size > 0}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-gray-950 px-4 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "schedule" ? <CalendarClock className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
        {mode === "schedule" ? "全SNSを予約" : "全SNSへ投稿"}
      </button>
      <p className="mt-2 text-[11px] text-gray-500">
        予約時刻に事務所PCとログイン済みChromeが利用できない場合は待機します。画像アップロードまたは最終公開で確認が必要な媒体は「操作待ち」になり、対話中のCodexで未投稿媒体だけを再開します。1媒体で止まっても残りは続行します。
      </p>

      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="inline-flex items-center text-xs font-bold text-gray-700"><Clock3 className="mr-1.5 h-4 w-4" />投稿・予約履歴</h4>
          {loadingHistory && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        {history.length === 0 && !loadingHistory ? (
          <p className="mt-2 text-xs text-gray-400">投稿履歴はまだありません。</p>
        ) : (
          <div className="mt-2 divide-y divide-gray-200 border-y border-gray-200 bg-white">
            {history.slice(0, 12).map((publication) => (
              <div key={publication.id} className="px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusClass(publication.status)}`}>{statusLabel(publication.status)}</span>
                    <span className="text-xs font-bold text-gray-800">
                      {publication.targets.map((target) => RECIPE_SNS_PLATFORMS.find((platform) => platform.id === target)?.label).join("・")}
                    </span>
                    <span className="text-[11px] text-gray-500">{formatDate(publication.scheduledAt)}</span>
                  </div>
                  {["scheduled", "queued"].includes(publication.status) && (
                    <button
                      type="button"
                      onClick={() => void cancelPublication(publication.id)}
                      disabled={Boolean(submitting)}
                      className="inline-flex min-h-8 items-center justify-center self-start rounded-md border border-gray-300 bg-white px-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 sm:self-auto"
                    >
                      {submitting === `cancel:${publication.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Square className="mr-1.5 h-3.5 w-3.5" />}
                      取消
                    </button>
                  )}
                </div>
                {ACTIVE_STATUSES.has(publication.status) && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px] text-blue-800">
                      <span>{publication.currentStep}</span><span className="font-mono">{publication.progress}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${Math.max(2, publication.progress)}%` }} />
                    </div>
                  </div>
                )}
                {publication.errorMessage && !ACTIVE_STATUSES.has(publication.status) && (
                  <p className="mt-2 flex items-start text-xs text-amber-800"><AlertTriangle className="mr-1.5 mt-0.5 h-3.5 w-3.5 shrink-0" />{publication.errorMessage}</p>
                )}
                {publication.platformResults.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {publication.platformResults.map((result) => {
                      const success = result.status === "published" || result.status === "already_published";
                      return result.publishedUrl ? (
                        <a
                          key={result.platform}
                          href={result.publishedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center rounded border px-2 py-1 text-[10px] font-bold ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
                          title={result.message}
                        >
                          {success ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
                          {RECIPE_SNS_PLATFORMS.find((platform) => platform.id === result.platform)?.label}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      ) : (
                        <span
                          key={result.platform}
                          className={`inline-flex items-center rounded border px-2 py-1 text-[10px] font-bold ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
                          title={result.message}
                        >
                          {success ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
                          {RECIPE_SNS_PLATFORMS.find((platform) => platform.id === result.platform)?.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
