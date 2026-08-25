"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  StopCircle,
  Clock3,
  Download,
  HardDrive,
  Loader2,
  Megaphone,
  Monitor,
  Play,
  RefreshCw,
  ReceiptText,
  Save,
  Server,
  ShieldCheck,
  ShoppingBag,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type JobStatus =
  | "queued"
  | "running"
  | "waiting_for_user"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

type TaskDefinition = {
  key: "web_sales_import" | "ad_cost_import" | "ec_profit_import";
  channel: string;
  label: string;
  shortLabel: string;
  description: string;
  archiveFolder: string;
  schedule: string;
};

type CodexJob = {
  id: string;
  task_key: "connection_test" | "web_sales_import" | "ad_cost_import" | "ec_profit_import";
  channel: string | null;
  trigger_type: string;
  period_start: string | null;
  period_end: string | null;
  report_month: string | null;
  status: JobStatus;
  progress: number;
  current_step: string;
  result: Record<string, unknown>;
  error_message: string | null;
  worker_id: string | null;
  attempt_count: number;
  max_attempts: number;
  heartbeat_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type Worker = {
  id: string;
  name: string;
  version: string | null;
  status: "online" | "busy" | "offline" | "error";
  capabilities: Record<string, unknown>;
  current_job_id: string | null;
  last_error: string | null;
  last_seen_at: string;
  online: boolean;
};

type JobEvent = {
  id: number;
  job_id: string;
  event_type: string;
  message: string;
  progress: number | null;
  created_at: string;
};

type Artifact = {
  id: string;
  job_id: string;
  artifact_type: "source" | "output" | "log" | "screenshot";
  file_name: string;
  byte_size: number;
  created_at: string;
};

type Unmatched = {
  id: string;
  run_id: string;
  channel: string;
  external_product_key: string;
  external_product_name: string;
  quantity: number;
};

type SyncRun = {
  id: string;
  channel: string;
  period_start: string;
  period_end: string;
  status: "running" | "success" | "needs_review" | "failed";
};

type Product = {
  id: string;
  name: string;
  product_code: string | null;
};

type StatusPayload = {
  tasks: TaskDefinition[];
  adTasks: TaskDefinition[];
  profitTasks: TaskDefinition[];
  jobs: CodexJob[];
  workers: Worker[];
  events: JobEvent[];
  artifacts: Artifact[];
  runs: SyncRun[];
  unmatched: Unmatched[];
  products: Product[];
  bridge: { requiredVersion: string };
  schedule: { halfMonth: string; previousMonth: string; timezone: string };
};

type PeriodMode = "halfMonth" | "previousMonth" | "custom";
type Workflow = "sales" | "ads" | "profit";

export default function WebSalesAutomationPage() {
  const router = useRouter();
  const initialPeriod = useMemo(() => getPeriod("halfMonth"), []);
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("halfMonth");
  const [startDate, setStartDate] = useState(initialPeriod.startDate);
  const [endDate, setEndDate] = useState(initialPeriod.endDate);
  const [workflow, setWorkflow] = useState<Workflow>("sales");
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingChannel, setMappingChannel] = useState<string | null>(null);
  const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({});
  const [mappingSavingId, setMappingSavingId] = useState<string | null>(null);
  const autoOpenedReviewKey = useRef<string | null>(null);

  const loadStatus = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/web-sales/automation/status", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "状態を取得できません");
      setData(payload);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "状態を取得できません");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash === "#ads" || window.location.hash === "#profit") {
      setWorkflow(window.location.hash === "#ads" ? "ads" : "profit");
      const period = getPeriod("previousMonth");
      setPeriodMode("previousMonth");
      setStartDate(period.startDate);
      setEndDate(period.endDate);
    }
    loadStatus();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadStatus(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const taskKey = workflow === "ads"
    ? "ad_cost_import"
    : workflow === "profit"
      ? "ec_profit_import"
      : "web_sales_import";
  const workflowTasks = workflow === "ads"
    ? (data?.adTasks || [])
    : workflow === "profit"
      ? (data?.profitTasks || [])
      : (data?.tasks || []);
  const allTasks = [...(data?.tasks || []), ...(data?.adTasks || []), ...(data?.profitTasks || [])];
  const workflowChannels = workflowTasks.map((task) => task.channel);

  const activeJobs = useMemo(
    () => {
      const latest = new Map<string, CodexJob>();
      for (const job of data?.jobs || []) {
        if (!["queued", "running"].includes(job.status)) continue;
        if (job.task_key !== taskKey && job.task_key !== "connection_test") continue;
        const key = `${job.task_key}:${job.channel || "connection"}:${job.period_start || "-"}:${job.period_end || "-"}`;
        if (!latest.has(key)) latest.set(key, job);
      }
      return [...latest.values()].sort((left, right) => {
        if (left.status === right.status) return right.created_at.localeCompare(left.created_at);
        return left.status === "running" ? -1 : 1;
      });
    },
    [data?.jobs, taskKey],
  );
  const historyJobs = useMemo(
    () => (data?.jobs || [])
      .filter((job) => job.task_key === taskKey && !["queued", "running"].includes(job.status))
      .slice(0, 40),
    [data?.jobs, taskKey],
  );
  const interactiveWorker = data?.workers.find((worker) => worker.online && worker.capabilities?.chrome === true)
    || data?.workers.find((worker) => worker.capabilities?.chrome === true)
    || null;
  const preLoginWorker = data?.workers.find((worker) => worker.online && worker.capabilities?.preLogin === true)
    || data?.workers.find((worker) => worker.capabilities?.preLogin === true)
    || null;
  const primaryWorker = interactiveWorker || preLoginWorker || data?.workers.find((worker) => worker.online) || data?.workers[0] || null;
  const codexVersion = typeof primaryWorker?.capabilities?.codexVersion === "string"
    ? primaryWorker.capabilities.codexVersion
    : null;
  const codexRuntimeReady = primaryWorker?.capabilities?.codexRuntimeReady !== false;
  const codexRuntimeCheckedAt = typeof primaryWorker?.capabilities?.codexRuntimeCheckedAt === "string"
    ? primaryWorker.capabilities.codexRuntimeCheckedAt
    : null;
  const bridgeUpdateRequired = Boolean(
    primaryWorker?.version
      && data?.bridge?.requiredVersion
      && primaryWorker.version !== data.bridge.requiredVersion,
  );
  const artifactsByJob = useMemo(() => {
    const map = new Map<string, Artifact[]>();
    for (const artifact of data?.artifacts || []) {
      map.set(artifact.job_id, [...(map.get(artifact.job_id) || []), artifact]);
    }
    return map;
  }, [data?.artifacts]);
  const latestEventByJob = useMemo(() => {
    const map = new Map<string, JobEvent>();
    for (const event of data?.events || []) {
      if (!map.has(event.job_id)) map.set(event.job_id, event);
    }
    return map;
  }, [data?.events]);
  const latestPeriodJobByChannel = useMemo(() => {
    const map = new Map<string, CodexJob>();
    for (const job of data?.jobs || []) {
      if (job.channel
        && job.task_key === taskKey
        && job.period_start === startDate
        && job.period_end === endDate
        && !map.has(job.channel)) {
        map.set(job.channel, job);
      }
    }
    return map;
  }, [data?.jobs, endDate, startDate, taskKey]);
  const selectedPeriodRunIds = useMemo(
    () => new Set((data?.runs || [])
      .filter((run) => run.period_start === startDate && run.period_end === endDate)
      .map((run) => run.id)),
    [data?.runs, endDate, startDate],
  );
  const periodUnmatched = useMemo(
    () => (data?.unmatched || []).filter((item) => selectedPeriodRunIds.has(item.run_id)),
    [data?.unmatched, selectedPeriodRunIds],
  );
  const visibleUnmatched = useMemo(
    () => periodUnmatched.filter((item) => !mappingChannel || item.channel === mappingChannel),
    [mappingChannel, periodUnmatched],
  );
  const unmatchedCountByChannel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of periodUnmatched) counts.set(item.channel, (counts.get(item.channel) || 0) + 1);
    return counts;
  }, [periodUnmatched]);
  const reviewChannels = useMemo(
    () => workflowTasks
      .map((task) => task.channel)
      .filter((channel) => latestPeriodJobByChannel.get(channel)?.status === "needs_review"
        && (unmatchedCountByChannel.get(channel) || 0) > 0),
    [latestPeriodJobByChannel, unmatchedCountByChannel, workflowTasks],
  );
  const incompleteChannels = useMemo(
    () => workflowChannels.filter((channel) => {
      const latest = latestPeriodJobByChannel.get(channel);
      if (!latest) return true;
      if (["failed", "waiting_for_user", "cancelled"].includes(latest.status)) return true;
      return latest.status === "needs_review" && (unmatchedCountByChannel.get(channel) || 0) === 0;
    }),
    [latestPeriodJobByChannel, workflowChannels, unmatchedCountByChannel],
  );
  const completedChannelCount = workflowChannels.filter((channel) => latestPeriodJobByChannel.get(channel)?.status === "completed").length;
  const operationWaitingCount = workflowChannels.filter((channel) => latestPeriodJobByChannel.get(channel)?.status === "waiting_for_user").length;
  const automaticWaitingCount = Math.max(0, incompleteChannels.length - operationWaitingCount);
  const selectedPeriodKind = getPeriodKind(startDate, endDate);
  const selectedPeriodStatus = completedChannelCount === workflowChannels.length && workflowChannels.length > 0
    ? "完了"
    : operationWaitingCount > 0
      ? `未完了（操作待ち ${operationWaitingCount}件）`
      : "未完了";

  useEffect(() => {
    if (workflow !== "sales" || reviewChannels.length === 0) return;
    const key = `${startDate}:${endDate}:${[...reviewChannels].sort().join(",")}`;
    if (autoOpenedReviewKey.current === key) return;
    autoOpenedReviewKey.current = key;
    setMappingChannel(reviewChannels.length === 1 ? reviewChannels[0] : null);
    setMappingOpen(true);
  }, [endDate, reviewChannels, startDate, workflow]);

  useEffect(() => {
    if (mappingOpen && periodUnmatched.length === 0) setMappingOpen(false);
  }, [mappingOpen, periodUnmatched.length]);

  const changePeriodMode = (mode: PeriodMode) => {
    setPeriodMode(mode);
    if (mode !== "custom") {
      const period = getPeriod(mode);
      setStartDate(period.startDate);
      setEndDate(period.endDate);
    }
  };

  const changeWorkflow = (nextWorkflow: Workflow) => {
    setWorkflow(nextWorkflow);
    const nextMode: Exclude<PeriodMode, "custom"> = nextWorkflow === "sales" ? "halfMonth" : "previousMonth";
    const period = getPeriod(nextMode);
    setPeriodMode(nextMode);
    setStartDate(period.startDate);
    setEndDate(period.endDate);
  };

  const enqueue = async (channels: string[], incompleteOnly = false) => {
    if (channels.length === 0) {
      toast.error(workflow === "ads" ? "実行する広告媒体を選択してください" : "実行するECを選択してください");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/web-sales/codex-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskKey, channels, startDate, endDate, incompleteOnly }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "タスクを登録できません");
      const jobCount = payload.jobs?.length || 0;
      toast.success(jobCount > 0
        ? `${jobCount}件を実行待ちに登録しました`
        : incompleteOnly ? "未取得のタスクはありません" : "同じ期間のタスクはすでに実行待ちです");
      await loadStatus(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "タスクを登録できません");
    } finally {
      setSubmitting(false);
    }
  };

  const testConnection = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/web-sales/codex-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskKey: "connection_test" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "接続テストを登録できません");
      toast.success("接続テストを登録しました");
      await loadStatus(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "接続テストを登録できません");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelJob = async (job: CodexJob) => {
    setActionJobId(job.id);
    try {
      const response = await fetch(`/api/web-sales/codex-jobs/${job.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "タスクを更新できません");
      toast.success("タスクを取り消しました");
      await loadStatus(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "タスクを更新できません");
    } finally {
      setActionJobId(null);
    }
  };

  const openMapping = (channel: string | null = null) => {
    setMappingChannel(channel);
    setMappingOpen(true);
  };

  const saveMapping = async (item: Unmatched) => {
    const productId = mappingSelections[item.id];
    if (!productId) {
      toast.error("紐付けるTSA商品を選択してください");
      return;
    }
    setMappingSavingId(item.id);
    try {
      const response = await fetch("/api/web-sales/automation/mapping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unmatchedId: item.id, productId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "商品紐付けを保存できません");
      toast.success(payload.result?.status === "success"
        ? "紐付けを保存し、月次集計へ反映しました"
        : "紐付けを保存しました。残りの商品を確認してください");
      setMappingSelections({});
      await loadStatus(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品紐付けを保存できません");
    } finally {
      setMappingSavingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(workflow === "sales" ? "/web-sales/dashboard" : "/web-sales/advertising")}
              className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              title={workflow === "sales" ? "WEB販売管理へ戻る" : "EC経費管理へ戻る"}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{workflow === "ads" ? "Codex広告費取込" : workflow === "profit" ? "Codex EC控除取込" : "Codex売上集計"}</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {workflow === "ads" ? "広告レポート取得・費用反映" : workflow === "profit" ? "手数料・返金・店舗負担値引の取得" : "ECデータ取得・TSA取込"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadStatus()}
            disabled={loading}
            className="flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="最新状態に更新"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-7 px-4 py-5 sm:px-6">
        {loading && !data ? (
          <div className="flex min-h-72 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={20} /> 読み込み中
          </div>
        ) : (
          <>
            <section className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-white p-1 sm:max-w-xl">
              <button
                type="button"
                onClick={() => changeWorkflow("sales")}
                className={`flex h-10 items-center justify-center gap-2 rounded text-sm font-semibold ${workflow === "sales" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <ShoppingBag size={16} /> 商品売上
              </button>
              <button
                type="button"
                onClick={() => changeWorkflow("ads")}
                className={`flex h-10 items-center justify-center gap-2 rounded text-sm font-semibold ${workflow === "ads" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <Megaphone size={16} /> 広告費
              </button>
              <button
                type="button"
                onClick={() => changeWorkflow("profit")}
                className={`flex h-10 items-center justify-center gap-2 rounded text-sm font-semibold ${workflow === "profit" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <ReceiptText size={16} /> EC控除
              </button>
            </section>

            <section className="flex items-start gap-3 border-l-4 border-cyan-500 bg-cyan-50 px-4 py-3">
              <ShieldCheck size={19} className="mt-0.5 shrink-0 text-cyan-800" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-cyan-950">省トークン実行</div>
                <p className="mt-0.5 text-xs leading-5 text-cyan-900">
                  完了済み・保存済みファイル・APIを先に確認し、必要な場合だけ独立した短いCodex処理を開始します。開発チャットは参照しません。
                </p>
              </div>
            </section>

            <section className={`flex flex-col gap-4 border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
              primaryWorker?.online
                ? primaryWorker.status === "busy" ? "border-blue-500 bg-blue-50" : "border-emerald-500 bg-emerald-50"
                : "border-amber-500 bg-amber-50"
            }`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${primaryWorker?.online ? "bg-white text-emerald-700" : "bg-white text-amber-700"}`}>
                  {primaryWorker?.online ? <Wifi size={20} /> : <WifiOff size={20} />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="font-bold">{primaryWorker?.name || "事務所PC"}</h2>
                    <span className={`text-xs font-semibold ${primaryWorker?.online ? "text-emerald-700" : "text-amber-700"}`}>
                      {primaryWorker?.online ? (primaryWorker.status === "busy" ? "実行中" : "オンライン") : "オフライン"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    ブラウザ操作 {interactiveWorker?.online ? "オンライン" : "オフライン"}
                    {interactiveWorker ? ` / 最終接続 ${formatDateTime(interactiveWorker.last_seen_at)}` : ""}
                  </p>
                  <p className={`mt-0.5 text-xs ${preLoginWorker?.online ? "text-emerald-700" : "text-slate-500"}`}>
                    ログイン前処理 {preLoginWorker?.online ? "オンライン" : "オフライン"}
                    {preLoginWorker ? ` / 最終接続 ${formatDateTime(preLoginWorker.last_seen_at)}` : ""}
                  </p>
                  {primaryWorker && (
                    <p className={`mt-1 text-xs ${codexRuntimeReady && !bridgeUpdateRequired ? "text-slate-600" : "font-semibold text-red-700"}`}>
                      Codex {codexVersion || "確認中"}
                      {codexRuntimeCheckedAt ? ` / 更新確認 ${formatDateTime(codexRuntimeCheckedAt)}` : ""}
                      {bridgeUpdateRequired ? ` / Bridge ${data?.bridge.requiredVersion}への更新が必要` : ""}
                      {!codexRuntimeReady ? " / Codex実行環境エラー" : ""}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={testConnection}
                disabled={submitting}
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                <Monitor size={16} /> 接続テスト
              </button>
            </section>

            {activeJobs.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin text-blue-600" />
                  <h2 className="text-base font-bold">現在の処理</h2>
                  <span className="text-xs text-slate-500">{activeJobs.length}件</span>
                </div>
                <div className="space-y-2">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="rounded-md border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>{jobLabel(job, allTasks)}</strong>
                            <JobStatusBadge status={job.status} />
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{job.current_step}</p>
                          {latestEventByJob.get(job.id)?.message && latestEventByJob.get(job.id)?.message !== job.current_step && (
                            <p className="mt-1 text-xs text-slate-400">{latestEventByJob.get(job.id)?.message}</p>
                          )}
                        </div>
                        {job.status === "queued" && (
                          <button
                            type="button"
                            onClick={() => cancelJob(job)}
                            disabled={actionJobId === job.id}
                            className="flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <StopCircle size={15} /> 取消
                          </button>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-[width] duration-500 ${job.status === "waiting_for_user" ? "bg-amber-500" : "bg-blue-600"}`}
                            style={{ width: `${Math.max(job.status === "queued" ? 2 : 4, job.progress)}%` }}
                          />
                        </div>
                        <span className="min-w-16 text-right text-xs font-bold text-slate-600">{jobProgressLabel(job)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Server size={18} />
                  <h2 className="text-base font-bold">対象データ</h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {workflowTasks.map((task) => {
                    const latest = latestPeriodJobByChannel.get(task.channel);
                    const unmatchedCount = unmatchedCountByChannel.get(task.channel) || 0;
                    const reason = latest && latest.status !== "completed"
                      ? latest.error_message || resultSummary(latest.result) || latest.current_step
                      : null;
                    return (
                      <div
                        key={task.channel}
                        className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white"
                      >
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold">{task.label}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{task.schedule}</div>
                            </div>
                            {latest ? (
                              <JobStatusBadge
                                status={latest.status}
                                compact
                                labelOverride={latest.status === "needs_review"
                                  ? unmatchedCount > 0 ? "商品紐付け待ち" : "自動再実行待ち"
                                  : undefined}
                              />
                            ) : <span className="text-[11px] font-semibold text-slate-400">未実行</span>}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-2 text-[11px] text-slate-500">
                            <span>{latest ? formatDateTime(latest.created_at) : "未実行"}</span>
                            {latest?.status === "waiting_for_user" && <span className="font-semibold text-amber-700">操作後に手動再開</span>}
                            {latest && ["failed", "cancelled"].includes(latest.status) && <span className="font-semibold text-blue-700">毎朝自動再実行</span>}
                          </div>
                          {reason && <p className="mt-2 text-[11px] leading-5 text-slate-600">{reason}</p>}
                        </div>
                        {latest?.status === "needs_review" && unmatchedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => openMapping(task.channel)}
                            className="flex h-10 w-full items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100"
                          >
                            <AlertTriangle size={14} /> 商品紐付けを確認（{unmatchedCount}件）
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-l-0 border-slate-200 xl:border-l xl:pl-6">
                <div className="mb-3 flex items-center gap-2">
                  <Play size={18} />
                  <h2 className="text-base font-bold">データ更新</h2>
                </div>
                <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
                  <div className={`grid ${workflow === "sales" ? "grid-cols-3" : "grid-cols-2"} rounded-md border border-slate-200 bg-slate-50 p-1`}>
                    {(workflow === "sales" ? ([
                      ["halfMonth", "中間集計", "当月1〜15日"],
                      ["previousMonth", "月次確定", "前月1か月"],
                      ["custom", "期間指定", "任意の期間"],
                    ] as const) : ([
                      ["previousMonth", "月次確定", "前月1か月"],
                      ["custom", "期間指定", "任意の期間"],
                    ] as const)).map(([mode, label, detail]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => changePeriodMode(mode)}
                        className={`flex h-12 flex-col items-center justify-center text-sm font-semibold ${periodMode === mode ? "rounded bg-slate-900 text-white" : "text-slate-600"}`}
                      >
                        <span>{label}</span>
                        <span className={`text-[10px] font-normal ${periodMode === mode ? "text-slate-300" : "text-slate-400"}`}>{detail}</span>
                      </button>
                    ))}
                  </div>
                  <div className={`border-l-4 px-3 py-2 ${selectedPeriodKind === "halfMonth" ? "border-cyan-500 bg-cyan-50" : selectedPeriodKind === "fullMonth" ? "border-blue-500 bg-blue-50" : "border-slate-400 bg-slate-50"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {selectedPeriodKind === "halfMonth" ? "中間集計（1〜15日）" : selectedPeriodKind === "fullMonth" ? "月次確定（1か月）" : "期間指定"}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
                          {workflow === "sales" && selectedPeriodKind === "halfMonth"
                            ? "販売個数のみを集計します。広告費・EC控除は含みません。"
                            : workflow === "sales"
                              ? "販売個数の月次確定です。広告費・EC控除は各専用タブで取得します。"
                              : workflow === "ads"
                                ? "1か月分の広告費を取得します。中間集計は行いません。"
                                : "1か月分の手数料・値引・返金等を取得します。中間集計は行いません。"}
                        </p>
                      </div>
                      <span className={`rounded px-2 py-1 text-xs font-bold ${selectedPeriodStatus === "完了" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                        {selectedPeriodStatus}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => { setStartDate(event.target.value); setPeriodMode("custom"); }}
                      className="h-10 min-w-0 rounded-md border border-slate-300 px-2 text-sm"
                    />
                    <span className="text-slate-400">〜</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => { setEndDate(event.target.value); setPeriodMode("custom"); }}
                      className="h-10 min-w-0 rounded-md border border-slate-300 px-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-center">
                    <div className="bg-white px-2 py-2"><div className="text-[11px] text-slate-500">完了</div><strong className="text-emerald-700">{completedChannelCount}/{workflowChannels.length}</strong></div>
                    <div className="bg-white px-2 py-2"><div className="text-[11px] text-slate-500">自動処理待ち</div><strong className="text-blue-700">{automaticWaitingCount}</strong></div>
                    <div className="bg-white px-2 py-2"><div className="text-[11px] text-slate-500">操作待ち</div><strong className="text-amber-700">{operationWaitingCount}</strong></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => enqueue(workflowChannels, true)}
                    disabled={submitting || incompleteChannels.length === 0}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                    {incompleteChannels.length > 0
                      ? selectedPeriodKind === "halfMonth"
                        ? `1〜15日分を取得（${incompleteChannels.length}件）`
                        : selectedPeriodKind === "fullMonth"
                          ? `前月1か月分を取得（${incompleteChannels.length}件）`
                          : `指定期間を取得（${incompleteChannels.length}件）`
                      : selectedPeriodKind === "halfMonth"
                        ? "1〜15日分は取得済み"
                        : selectedPeriodKind === "fullMonth"
                          ? "前月1か月分は取得済み"
                          : "指定期間は取得済み"}
                  </button>
                  <p className="text-xs leading-5 text-slate-500">
                    完了済みは再取得せず、未取得・失敗・確認待ちだけを実行します。ログイン・MFA・権限待ちは自動再実行せず、操作後にこの画面から再開します。
                  </p>
                </div>
              </div>
            </section>

            {workflow === "sales" && periodUnmatched.length > 0 && (
              <section className="flex flex-col gap-3 border-y border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertTriangle size={17} /> 商品紐付けの確認が必要です
                  </div>
                  <p className="mt-1 text-xs text-amber-800">未紐付けの商品が{periodUnmatched.length}件あります。紐付け完了後に月次集計へ反映されます。</p>
                </div>
                <button
                  type="button"
                  onClick={() => openMapping(null)}
                  className="h-9 shrink-0 rounded-md bg-amber-900 px-4 text-xs font-bold text-white hover:bg-amber-950"
                >
                  商品紐付けを開く
                </button>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock3 size={18} />
                <h2 className="text-base font-bold">実行履歴</h2>
              </div>
              <div className="overflow-x-auto border-y border-slate-200 bg-white">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs text-slate-600">
                    <tr>
                      <th className="px-4 py-3">実行日時</th>
                      <th className="px-4 py-3">タスク</th>
                      <th className="px-4 py-3">集計区分</th>
                      <th className="px-4 py-3">対象期間</th>
                      <th className="px-4 py-3">状態</th>
                      <th className="px-4 py-3">結果</th>
                      <th className="px-4 py-3">ファイル</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyJobs.map((job) => {
                      const artifacts = artifactsByJob.get(job.id) || [];
                      return (
                        <tr key={job.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(job.created_at)}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">{jobLabel(job, allTasks)}</td>
                          <td className="whitespace-nowrap px-4 py-3"><PeriodKindBadge job={job} /></td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs">{job.period_start ? `${job.period_start} 〜 ${job.period_end}` : "-"}</td>
                          <td className="whitespace-nowrap px-4 py-3"><JobStatusBadge status={job.status} /></td>
                          <td className="max-w-[360px] px-4 py-3 text-xs text-slate-600">
                            {job.error_message || resultSummary(job.result) || job.current_step}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex max-w-[280px] flex-wrap gap-1">
                              {artifacts.map((artifact) => (
                                <a
                                  key={artifact.id}
                                  href={`/api/web-sales/codex-jobs/${job.id}/artifacts/${artifact.id}`}
                                  className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50"
                                  title={`${artifact.file_name} (${formatBytes(artifact.byte_size)})`}
                                >
                                  <Download size={12} className="shrink-0" />
                                  <span className="truncate">{artifact.file_name}</span>
                                </a>
                              ))}
                              {artifacts.length === 0 && <span className="text-xs text-slate-400">-</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {historyJobs.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">実行履歴はありません</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><HardDrive size={13} /> 元CSV・処理結果を履歴保存</span>
              <span>{data?.schedule.halfMonth}</span>
              <span>{data?.schedule.previousMonth}</span>
            </footer>
          </>
        )}
      </div>

      <Dialog open={mappingOpen} onOpenChange={setMappingOpen}>
        <DialogContent className="flex max-h-[88vh] w-[calc(100%-24px)] max-w-5xl flex-col overflow-hidden rounded-lg p-0">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={19} className="text-amber-600" /> 商品紐付け確認
            </DialogTitle>
            <DialogDescription>
              ECの商品名とTSAの商品マスターを紐付けます。保存後、該当月の集計を自動で再計算します。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
            <button
              type="button"
              onClick={() => setMappingChannel(null)}
              className={`h-8 rounded-md px-3 text-xs font-bold ${mappingChannel === null ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              すべて（{periodUnmatched.length}）
            </button>
            {[...unmatchedCountByChannel.entries()].map(([channel, count]) => (
              <button
                key={channel}
                type="button"
                onClick={() => setMappingChannel(channel)}
                className={`h-8 rounded-md px-3 text-xs font-bold ${mappingChannel === channel ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
              >
                {channelLabel(channel, data?.tasks || [])}（{count}）
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {visibleUnmatched.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)_auto] md:items-end">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-amber-800">{channelLabel(item.channel, data?.tasks || [])} / 数量 {item.quantity}個</div>
                  <div className="mt-1 break-words text-sm font-semibold text-slate-900">{item.external_product_name || item.external_product_key}</div>
                </div>
                <label className="min-w-0 text-xs font-semibold text-slate-700">
                  紐付けるTSA商品
                  <select
                    value={mappingSelections[item.id] || ""}
                    onChange={(event) => setMappingSelections((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                  >
                    <option value="">商品を選択してください</option>
                    {(data?.products || []).map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.product_code ? `${product.product_code} / ` : ""}{product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => saveMapping(item)}
                  disabled={!mappingSelections[item.id] || mappingSavingId !== null}
                  className="flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {mappingSavingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  紐付けて反映
                </button>
              </div>
            ))}
            {visibleUnmatched.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">このECの未紐付け商品はありません</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function JobStatusBadge({
  status,
  compact = false,
  labelOverride,
}: {
  status: JobStatus;
  compact?: boolean;
  labelOverride?: string;
}) {
  const config = {
    queued: [Clock3, "待機中", "text-slate-600 bg-slate-100"],
    running: [Loader2, "実行中", "text-blue-700 bg-blue-50"],
    waiting_for_user: [AlertTriangle, "操作待ち", "text-amber-800 bg-amber-50"],
    needs_review: [AlertTriangle, "確認待ち", "text-amber-800 bg-amber-50"],
    completed: [CheckCircle2, "完了", "text-emerald-700 bg-emerald-50"],
    failed: [XCircle, "失敗", "text-red-700 bg-red-50"],
    cancelled: [StopCircle, "取消", "text-slate-500 bg-slate-100"],
  } as const;
  const [Icon, label, className] = config[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${compact ? "text-[10px]" : "text-xs"} ${className}`}>
      <Icon size={compact ? 11 : 13} className={status === "running" ? "animate-spin" : ""} />{labelOverride || label}
    </span>
  );
}

function PeriodKindBadge({ job }: { job: CodexJob }) {
  if (!job.period_start || !job.period_end) return <span className="text-xs text-slate-400">-</span>;
  const kind = getPeriodKind(job.period_start, job.period_end, job.trigger_type);
  const label = kind === "halfMonth" ? "中間（1〜15日）" : kind === "fullMonth" ? "月次確定" : "期間指定";
  const className = kind === "halfMonth"
    ? "bg-cyan-50 text-cyan-800"
    : kind === "fullMonth"
      ? "bg-blue-50 text-blue-800"
      : "bg-slate-100 text-slate-600";
  return <span className={`rounded px-2 py-1 text-[11px] font-semibold ${className}`}>{label}</span>;
}

function channelLabel(channel: string, tasks: TaskDefinition[]) {
  return tasks.find((task) => task.channel === channel)?.shortLabel || channel;
}

function getPeriod(mode: Exclude<PeriodMode, "custom">) {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  if (mode === "halfMonth") {
    const target = jst.getUTCDate() >= 16
      ? new Date(Date.UTC(year, month, 1))
      : new Date(Date.UTC(year, month - 1, 1));
    const targetYear = target.getUTCFullYear();
    const monthText = String(target.getUTCMonth() + 1).padStart(2, "0");
    return {
      startDate: `${targetYear}-${monthText}-01`,
      endDate: `${targetYear}-${monthText}-15`,
    };
  }
  const end = new Date(Date.UTC(year, month, 0));
  const previousYear = end.getUTCFullYear();
  const previousMonth = String(end.getUTCMonth() + 1).padStart(2, "0");
  return {
    startDate: `${previousYear}-${previousMonth}-01`,
    endDate: end.toISOString().slice(0, 10),
  };
}

function getPeriodKind(startDate: string, endDate: string, triggerType = "") {
  if (triggerType.includes("half_month")) return "halfMonth" as const;
  if (startDate.slice(0, 7) === endDate.slice(0, 7) && startDate.endsWith("-01") && endDate.endsWith("-15")) {
    return "halfMonth" as const;
  }
  if (startDate.slice(0, 7) === endDate.slice(0, 7) && startDate.endsWith("-01")) {
    const [year, month] = endDate.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (Number(endDate.slice(-2)) === lastDay) return "fullMonth" as const;
  }
  return "custom" as const;
}

function jobLabel(job: CodexJob, tasks: TaskDefinition[]) {
  if (job.task_key === "connection_test") return "PC接続テスト";
  return tasks.find((task) => task.key === job.task_key && task.channel === job.channel)?.shortLabel
    || job.channel
    || "Codex取込";
}

function resultSummary(result: Record<string, unknown>) {
  return typeof result?.summary === "string" ? result.summary : "";
}

function jobProgressLabel(job: CodexJob) {
  if (job.status === "queued") return "待機中";
  if (job.status === "waiting_for_user") return "操作待ち";
  if (job.progress < 20) return "準備中";
  if (job.progress < 80) return "実行中";
  return "最終確認中";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
