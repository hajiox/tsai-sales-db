"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Sparkles,
  Target,
} from "lucide-react";

type Focus = "sales" | "expense";

type AnalysisPeriod = {
  type: "half_month" | "monthly";
  startDate: string;
  endDate: string;
  completedChannels: number;
  totalChannels: number;
  source: "codex_jobs" | "default";
};

type AnalysisAction = {
  priority: number;
  area: "sales" | "product" | "channel" | "advertising" | "fees" | "data";
  title: string;
  rationale: string;
  evidence: string[];
  expected_impact: string;
  deadline: string;
  metric: string;
  stop_condition: string;
  confidence: "high" | "medium" | "low";
};

type AnalysisRisk = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: string[];
};

type AnalysisReport = {
  id: string;
  job_id: string;
  version: number;
  model: string;
  status: "completed" | "needs_review";
  period_start: string;
  period_end: string;
  analysis_type: "half_month" | "monthly";
  executive_summary: string;
  sales_analysis: string;
  expense_analysis: string;
  floor_staff_summary: string;
  actions: AnalysisAction[];
  risks: AnalysisRisk[];
  data_quality: { grade: "A" | "B" | "C" | "D"; summary: string; limitations: string[] };
  tsg_post_status: "pending" | "posted" | "failed" | "skipped";
  tsg_post_url?: string | null;
  tsg_post_error?: string | null;
  created_at: string;
};

type AnalysisJob = {
  id: string;
  status: string;
  progress: number;
  current_step: string;
  error_message?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  created_at: string;
};

type AnalysisResponse = {
  analyses: AnalysisReport[];
  jobs: AnalysisJob[];
  worker: {
    name: string;
    version?: string | null;
    status: string;
    last_seen_at: string;
    capabilities?: Record<string, unknown>;
  } | null;
  displayPeriod: AnalysisPeriod | null;
};

export default function WebSalesCodexAnalysis({ month, focus }: { month: string; focus: Focus }) {
  const [data, setData] = useState<AnalysisResponse>({ analyses: [], jobs: [], worker: null, displayPeriod: null });
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/web-sales/analysis?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "分析履歴を取得できません");
      setData(payload);
      setSelectedId((current) => {
        if (current && payload.analyses.some((item: AnalysisReport) => item.id === current)) return current;
        const periodType = payload.displayPeriod?.type;
        return payload.analyses.find((item: AnalysisReport) => item.analysis_type === periodType)?.id
          || payload.analyses[0]?.id
          || "";
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析履歴を取得できません");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    setSelectedId("");
    void load();
  }, [load]);

  const activeJob = data.jobs.find((job) => ["queued", "running"].includes(job.status)
    && (!data.displayPeriod
      || (job.period_start === data.displayPeriod.startDate && job.period_end === data.displayPeriod.endDate)));
  useEffect(() => {
    if (!activeJob) return;
    const timer = window.setInterval(() => void load(true), 3500);
    return () => window.clearInterval(timer);
  }, [activeJob, load]);

  const report = data.analyses.find((item) => item.id === selectedId) || data.analyses[0] || null;
  const workerOnline = Boolean(data.worker && data.worker.status !== "offline"
    && Date.now() - new Date(data.worker.last_seen_at).getTime() < 90_000);
  const relevantActions = useMemo(() => {
    if (!report) return [];
    const areas = focus === "sales"
      ? new Set(["sales", "product", "channel", "data"])
      : new Set(["advertising", "fees", "channel", "data"]);
    const filtered = report.actions.filter((action) => areas.has(action.area));
    return (filtered.length >= 3 ? filtered : report.actions).sort((a, b) => a.priority - b.priority);
  }, [focus, report]);

  const startAnalysis = async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/web-sales/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "分析を開始できません");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析を開始できません");
    } finally {
      setStarting(false);
    }
  };

  const title = focus === "sales" ? "WEB販売 Codexデータアナリスト" : "経費・利益 Codexデータアナリスト";
  const analysisText = report ? (focus === "sales" ? report.sales_analysis : report.expense_analysis) : "";

  return (
    <section className="border-y border-gray-200 bg-white">
      <div className="p-4 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-950">
              <Sparkles className="h-5 w-5 text-blue-600" />
              {title}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {data.displayPeriod?.type === "half_month"
                ? "1日〜15日の販売個数を途中分析します。月次の経費や確定利益は分析しません。"
                : "月次保存データをSolが分析し、根拠・期限・中止条件まで具体化します。実行のたびに新しい版として保存します。"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 border px-2 py-1 font-medium ${workerOnline ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                <Server className="h-3.5 w-3.5" />
                事務所PC {workerOnline ? "オンライン" : "オフライン"}
              </span>
              {data.worker?.version && <span className="text-gray-500">Bridge {data.worker.version}</span>}
              <span className="text-gray-500">モデル: GPT-5.6 Sol</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:items-center">
            {data.analyses.length > 0 && (
              <label className="flex min-h-11 items-center gap-2 border border-gray-200 bg-white px-3 text-sm">
                <History className="h-4 w-4 text-gray-500" />
                <span className="sr-only">過去分析</span>
                <select
                  value={report?.id || ""}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="max-w-[230px] bg-transparent font-medium outline-none"
                >
                  {data.analyses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.analysis_type === "half_month" ? "1〜15日" : "月次"} 第{item.version}版 {formatDateTime(item.created_at)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={startAnalysis}
              disabled={starting || Boolean(activeJob) || !workerOnline}
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-gray-950 px-4 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
              title={!workerOnline ? "事務所PCでTSA Codex Bridgeを起動してください" : "新しい分析版を作成します"}
            >
              {starting || activeJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {activeJob ? "分析中" : data.analyses.length ? "再分析して新版作成" : "分析を実行"}
            </button>
          </div>
        </div>

        {activeJob && (
          <div className="mt-5 border-l-4 border-blue-500 bg-blue-50 p-4">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-blue-900">
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{activeJob.current_step}</span>
              <span>{activeJob.progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden bg-blue-100">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.max(2, activeJob.progress)}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 font-semibold">
              <RefreshCw className="h-3.5 w-3.5" />再読込
            </button>
          </div>
        )}

        {loading && !report ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />分析履歴を読み込んでいます
          </div>
        ) : report ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 border-y border-gray-200 py-4 sm:grid-cols-4">
              <div>
                <div className="text-xs font-medium text-gray-500">保存版</div>
                <div className="mt-1 text-lg font-bold">第{report.version}版</div>
                <div className="text-xs text-gray-500">{formatDateTime(report.created_at)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">データ品質</div>
                <div className="mt-1 flex items-center gap-2 text-lg font-bold">
                  <span className={qualityColor(report.data_quality.grade)}>{report.data_quality.grade}</span>
                  <span className="text-sm font-medium text-gray-700">{report.data_quality.summary}</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">分析期間</div>
                <div className="mt-1 text-sm font-bold text-gray-900">
                  {report.analysis_type === "half_month" ? "途中集計（1〜15日）" : "月次確定"}
                </div>
                <div className="text-xs text-gray-500">{formatShortDate(report.period_start)}〜{formatShortDate(report.period_end)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">状態</div>
                <div className={`mt-1 inline-flex items-center gap-1 text-sm font-bold ${report.status === "completed" ? "text-emerald-700" : "text-amber-700"}`}>
                  {report.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {report.status === "completed" ? "分析完了" : "要確認データあり"}
                </div>
              </div>
            </div>

            <AnalysisMarkdown title="経営サマリー" icon={<Target className="h-4 w-4" />} text={report.executive_summary} />
            <AnalysisMarkdown title={focus === "sales" ? "売上分析" : "経費・利益分析"} icon={<BarChart3 className="h-4 w-4" />} text={analysisText} />

            {focus === "sales" && report.floor_staff_summary && (
              <div className="border-l-4 border-emerald-500 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-emerald-950">フロアスタッフ向け共有文</h3>
                  <span className={`text-xs font-semibold ${report.tsg_post_status === "posted" ? "text-emerald-700" : "text-amber-700"}`}>
                    {report.tsg_post_status === "posted" ? "TSGへ投稿済み" : "TSG投稿を要確認"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-emerald-950">{report.floor_staff_summary}</p>
                {report.tsg_post_url && (
                  <a href={report.tsg_post_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-emerald-700 underline">
                    TSGの投稿を開く
                  </a>
                )}
                {report.tsg_post_error && <p className="mt-2 text-xs text-red-700">{report.tsg_post_error}</p>}
              </div>
            )}

            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-950">
                <Clock3 className="h-4 w-4 text-blue-600" />優先アクション
              </h3>
              <div className="mt-3 divide-y divide-gray-200 border-y border-gray-200">
                {relevantActions.map((action) => (
                  <div key={`${action.priority}-${action.title}`} className="grid gap-3 py-4 lg:grid-cols-[52px_minmax(0,1fr)_minmax(260px,0.7fr)]">
                    <div className="flex h-9 w-9 items-center justify-center bg-gray-950 text-sm font-bold text-white">{action.priority}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-gray-950">{action.title}</h4>
                        <span className="border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600">確度 {confidenceLabel(action.confidence)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-gray-700">{action.rationale}</p>
                      <ul className="mt-2 space-y-1 text-xs text-gray-600">
                        {action.evidence.map((item) => <li key={item}>・{item}</li>)}
                      </ul>
                    </div>
                    <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-xs leading-5">
                      <dt className="font-semibold text-gray-500">期限</dt><dd>{action.deadline}</dd>
                      <dt className="font-semibold text-gray-500">KPI</dt><dd>{action.metric}</dd>
                      <dt className="font-semibold text-gray-500">期待効果</dt><dd>{action.expected_impact}</dd>
                      <dt className="font-semibold text-gray-500">中止条件</dt><dd>{action.stop_condition}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            </div>

            {report.risks.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" />注意すべきリスク</h3>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {report.risks.map((risk) => (
                    <div key={risk.title} className="border-l-4 border-amber-400 bg-amber-50 p-4">
                      <div className="text-sm font-bold text-amber-950">{risk.title}</div>
                      <p className="mt-1 text-sm leading-6 text-amber-900">{risk.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.data_quality.limitations.length > 0 && (
              <details className="border-t border-gray-200 pt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-gray-700">データ上の制約を確認</summary>
                <ul className="mt-2 space-y-1 text-gray-600">
                  {report.data_quality.limitations.map((item) => <li key={item}>・{item}</li>)}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <div className="mt-6 border border-dashed border-gray-300 py-12 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">{month}の保存済み分析はまだありません</p>
            <p className="mt-1 text-xs text-gray-500">「分析を実行」で第1版を作成します。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AnalysisMarkdown({ title, icon, text }: { title: string; icon: React.ReactNode; text: string }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-base font-bold text-gray-950">{icon}{title}</h3>
      <div className="prose prose-sm mt-3 max-w-none border-l-4 border-blue-500 bg-blue-50/50 p-4 text-gray-800 prose-headings:text-gray-950 prose-li:my-0.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function qualityColor(grade: string) {
  if (grade === "A") return "text-emerald-700";
  if (grade === "B") return "text-blue-700";
  if (grade === "C") return "text-amber-700";
  return "text-red-700";
}

function confidenceLabel(value: AnalysisAction["confidence"]) {
  return value === "high" ? "高" : value === "medium" ? "中" : "低";
}
