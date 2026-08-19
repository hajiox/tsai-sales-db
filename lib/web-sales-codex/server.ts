import { timingSafeEqual } from "node:crypto";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { validatePeriod } from "@/lib/web-sales-automation/date";
import type { WebSalesChannel } from "@/lib/web-sales-automation/types";
import type { EnqueueCodexJobsInput } from "./types";
import { assertAnalysisPeriod } from "@/lib/web-sales-analysis/period";

export function isCodexBridgeAuthorized(request: Request) {
  const expected = process.env.TSA_CODEX_BRIDGE_TOKEN?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function enqueueCodexJobs(input: EnqueueCodexJobsInput) {
  const taskKey = input.taskKey || "web_sales_import";
  const period = validatePeriod(input.startDate, input.endDate);
  const supabase = getWebSalesAutomationServiceClient();
  const now = new Date().toISOString();
  const { data: activeJobs, error: activeError } = await supabase
    .from("web_sales_codex_jobs")
    .select("channel")
    .eq("task_key", taskKey)
    .in("channel", input.channels)
    .eq("period_start", period.startDate)
    .eq("period_end", period.endDate)
    .in("status", ["queued", "running"]);
  if (activeError) throw new Error(`実行中タスクを確認できません: ${activeError.message}`);
  const activeChannels = new Set((activeJobs || []).map((job) => String(job.channel)));
  const rows = input.channels
    .filter((channel) => !activeChannels.has(channel))
    .map((channel) => ({
    task_key: taskKey,
    channel,
    trigger_type: input.triggerType,
    period_start: period.startDate,
    period_end: period.endDate,
    report_month: period.reportMonth,
    status: "queued",
    progress: 0,
    current_step: "省トークン経路の確認待ち",
    requested_by: input.requestedBy || null,
    parameters: {
      taskKey,
      channel,
      ...period,
      executionPolicy: taskKey === "ad_cost_import" && channel === "google"
        ? "api_first"
        : taskKey === "ec_profit_import"
          ? "local_json_then_isolated_codex"
          : "archive_then_isolated_codex",
    },
    idempotency_key: input.idempotencyPrefix
      ? `${input.idempotencyPrefix}:${taskKey}:${channel}:${period.startDate}:${period.endDate}`
      : null,
    scheduled_at: now,
    }));

  if (rows.length === 0) return [];

  const query = input.idempotencyPrefix
    ? supabase
        .from("web_sales_codex_jobs")
        .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
        .select("id,channel,status,created_at")
    : supabase
        .from("web_sales_codex_jobs")
        .insert(rows)
        .select("id,channel,status,created_at");
  const { data, error } = await query;
  if (error) throw new Error(`Codexタスクを登録できません: ${error.message}`);

  const jobs = data || [];
  if (jobs.length > 0) {
    const { error: eventError } = await supabase
      .from("web_sales_codex_job_events")
      .insert(jobs.map((job) => ({
        job_id: job.id,
        event_type: "queued",
        message: "保存済み成果物・APIを先に確認する実行待ちに登録しました",
        progress: 0,
      })));
    if (eventError) throw new Error(`タスク履歴を登録できません: ${eventError.message}`);
  }
  return jobs;
}

export async function enqueueWebSalesAnalysisJob(input: {
  month: string;
  startDate: string;
  endDate: string;
  requestedBy?: string | null;
}) {
  const analysisPeriod = assertAnalysisPeriod(input.month, input.startDate, input.endDate);
  const period = validatePeriod(analysisPeriod.startDate, analysisPeriod.endDate);
  const supabase = getWebSalesAutomationServiceClient();
  const { data: active, error: activeError } = await supabase
    .from("web_sales_codex_jobs")
    .select("id,status,progress,current_step,created_at")
    .eq("task_key", "web_sales_analysis")
    .eq("report_month", period.reportMonth)
    .eq("period_start", period.startDate)
    .eq("period_end", period.endDate)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw new Error(`実行中の分析を確認できません: ${activeError.message}`);
  if (active) return active;

  const { data, error } = await supabase
    .from("web_sales_codex_jobs")
    .insert({
      task_key: "web_sales_analysis",
      channel: null,
      trigger_type: "manual",
      period_start: period.startDate,
      period_end: period.endDate,
      report_month: period.reportMonth,
      status: "queued",
      progress: 0,
      current_step: "分析データを準備しています",
      requested_by: input.requestedBy || null,
      parameters: {
        taskKey: "web_sales_analysis",
        ...period,
        analysisType: analysisPeriod.type,
        model: "gpt-5.6-sol",
        executionPolicy: "compact_packet_then_isolated_codex",
      },
      scheduled_at: new Date().toISOString(),
    })
    .select("id,status,progress,current_step,created_at")
    .single();
  if (error || !data) throw new Error(`分析タスクを登録できません: ${error?.message || "unknown"}`);

  await supabase.from("web_sales_codex_job_events").insert({
    job_id: data.id,
    event_type: "queued",
    message: "月次WEB販売・経費分析を実行待ちに登録しました",
    progress: 0,
  });
  return data;
}

export async function enqueueConnectionTest(requestedBy?: string | null) {
  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("web_sales_codex_jobs")
    .insert({
      task_key: "connection_test",
      trigger_type: "test",
      status: "queued",
      progress: 0,
      current_step: "接続テスト待ち",
      requested_by: requestedBy || null,
      parameters: {},
    })
    .select("id,status,created_at")
    .single();
  if (error || !data) throw new Error(`接続テストを登録できません: ${error?.message || "unknown"}`);
  await supabase.from("web_sales_codex_job_events").insert({
    job_id: data.id,
    event_type: "queued",
    message: "PC接続テストを登録しました",
    progress: 0,
  });
  return data;
}

export function normalizeWorkerId(value: unknown) {
  const workerId = String(value || "").trim();
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(workerId)) {
    throw new Error("workerIdが正しくありません");
  }
  return workerId;
}

export function asWebSalesChannel(value: unknown): WebSalesChannel {
  const channel = String(value || "") as WebSalesChannel;
  if (!["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"].includes(channel)) {
    throw new Error("対象ECが正しくありません");
  }
  return channel;
}

function lastDayOfMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("対象月が正しくありません");
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
