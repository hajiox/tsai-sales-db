import { NextResponse } from "next/server";
import { getReportMonth } from "@/lib/web-sales-automation/date";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { WEB_SALES_CHANNELS } from "@/lib/web-sales-automation/types";
import { enqueueCodexJobs } from "@/lib/web-sales-codex/server";
import { AD_COST_CODEX_TASKS, EC_PROFIT_CODEX_TASKS } from "@/lib/web-sales-codex/tasks";
import { upsertEcProfitEstimate, type EcProfitChannel } from "@/lib/web-sales-codex/ec-profit-estimate";
import {
  isAutomaticSettlementRetryDue,
  isQoo10SettledDetailUnavailable,
  settlementPeriodMonthsAgo,
  type EcProfitRetryChannel,
} from "@/lib/web-sales-codex/ec-profit-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  return Boolean(expected)
    && request.headers.get("authorization") === `Bearer ${expected}`;
}

function previousMonthPeriod(year: number, monthIndex: number) {
  return settlementPeriodMonthsAgo(year, monthIndex, 1);
}

async function enqueueIncompleteSettlementRetryPeriod(input: {
  year: number;
  monthIndex: number;
  day: number;
  weekday: number;
  dateKey: string;
  monthsAgo: number;
}) {
  const period = settlementPeriodMonthsAgo(input.year, input.monthIndex, input.monthsAgo);
  const dueChannels = EC_PROFIT_CODEX_TASKS
    .map((task) => task.channel as EcProfitRetryChannel)
    .filter((channel) => isAutomaticSettlementRetryDue({
      channel,
      day: input.day,
      weekday: input.weekday,
      monthsAgo: input.monthsAgo,
    }));
  if (dueChannels.length === 0) return [];

  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("ec_profit_monthly")
    .select("channel,coverage_level")
    .eq("report_month", `${period.reportMonth}-01`)
    .eq("coverage_level", "complete");
  if (error) throw new Error(`EC精算の完了状況を確認できません: ${error.message}`);

  const completed = new Set((data || []).map((row) => String(row.channel)));
  const { data: recentJobs, error: recentJobsError } = await supabase
    .from("web_sales_codex_jobs")
    .select("channel,status,result,created_at")
    .eq("task_key", "ec_profit_import")
    .eq("period_start", period.startDate)
    .eq("period_end", period.endDate)
    .order("created_at", { ascending: false })
    .limit(100);
  if (recentJobsError) throw new Error(`EC精算の実行状態を確認できません: ${recentJobsError.message}`);
  const latestJobByChannel = new Map<string, { status: string; result: unknown }>();
  for (const job of recentJobs || []) {
    const channel = String(job.channel || "");
    if (channel && !latestJobByChannel.has(channel)) {
      latestJobByChannel.set(channel, {
        status: String(job.status || ""),
        result: job.result,
      });
    }
  }
  const retryChannels = dueChannels
    .filter((channel) => !completed.has(channel))
    .filter((channel) => latestJobByChannel.get(channel)?.status !== "waiting_for_user")
    .filter((channel) => channel !== "qoo10"
      || !isQoo10SettledDetailUnavailable(latestJobByChannel.get(channel)?.result));
  if (retryChannels.length === 0) return [];

  for (const channel of retryChannels) {
    await upsertEcProfitEstimate({
      supabase,
      channel: channel as EcProfitChannel,
      reportMonth: period.reportMonth,
      periodStart: period.startDate,
      periodEnd: period.endDate,
    });
  }

  return enqueueCodexJobs({
    taskKey: "ec_profit_import",
    channels: retryChannels,
    startDate: period.startDate,
    endDate: period.endDate,
    triggerType: "retry",
    requestedBy: "vercel-cron-auto-retry",
    idempotencyPrefix: `automatic-retry:${input.dateKey}:${period.reportMonth}`,
  });
}

async function enqueueIncompleteSettlementRetries(input: {
  year: number;
  monthIndex: number;
  day: number;
  weekday: number;
  dateKey: string;
}) {
  const jobs = [];
  for (const monthsAgo of [1, 2]) {
    jobs.push(...await enqueueIncompleteSettlementRetryPeriod({ ...input, monthsAgo }));
  }
  return jobs;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const forced = url.searchParams.get("force") === "1" && startDate && endDate;
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const year = jst.getUTCFullYear();
    const monthIndex = jst.getUTCMonth();
    const day = jst.getUTCDate();
    const weekday = jst.getUTCDay();
    const dateKey = jst.toISOString().slice(0, 10);

    let triggerType: "scheduled_half_month" | "scheduled_previous_month" | null = null;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    if (forced && startDate && endDate) {
      triggerType = "scheduled_previous_month";
      periodStart = startDate;
      periodEnd = endDate;
    } else if (day === 16) {
      const month = String(monthIndex + 1).padStart(2, "0");
      triggerType = "scheduled_half_month";
      periodStart = `${year}-${month}-01`;
      periodEnd = `${year}-${month}-15`;
    } else if (day === 1) {
      const previous = previousMonthPeriod(year, monthIndex);
      triggerType = "scheduled_previous_month";
      periodStart = previous.startDate;
      periodEnd = previous.endDate;
    }

    // The 16th is reserved for the 1st-15th quantity snapshot. Do not mix
    // previous-month settlement recovery into that operator-facing run.
    const retryJobs = !forced && day !== 1 && day !== 16
      ? await enqueueIncompleteSettlementRetries({ year, monthIndex, day, weekday, dateKey })
      : [];

    if (!triggerType || !periodStart || !periodEnd) {
      return NextResponse.json({
        ok: true,
        skipped: retryJobs.length === 0,
        reason: retryJobs.length > 0 ? "未完了のEC精算を自動再実行しました" : "本日の定期実行はありません",
        automaticRetryQueued: retryJobs.length,
        jobs: retryJobs,
      });
    }

    const reportMonth = getReportMonth(periodStart);
    const shouldQueueMonthlyExpenses = forced || triggerType === "scheduled_previous_month";
    const [salesJobs, adJobs] = await Promise.all([
      enqueueCodexJobs({
        channels: [...WEB_SALES_CHANNELS],
        startDate: periodStart,
        endDate: periodEnd,
        triggerType,
        requestedBy: "vercel-cron",
        idempotencyPrefix: `${triggerType}:${reportMonth}`,
      }),
      shouldQueueMonthlyExpenses
        ? enqueueCodexJobs({
            taskKey: "ad_cost_import",
            channels: AD_COST_CODEX_TASKS.map((task) => task.channel),
            startDate: periodStart,
            endDate: periodEnd,
            triggerType,
            requestedBy: "vercel-cron",
            idempotencyPrefix: `${triggerType}:${reportMonth}`,
          })
        : Promise.resolve([]),
    ]);
    const profitJobs = shouldQueueMonthlyExpenses
      ? await enqueueCodexJobs({
          taskKey: "ec_profit_import",
          channels: EC_PROFIT_CODEX_TASKS.map((task) => task.channel),
          startDate: periodStart,
          endDate: periodEnd,
          triggerType,
          requestedBy: "vercel-cron",
          idempotencyPrefix: `${triggerType}:${reportMonth}`,
        })
      : [];
    const estimateResults = [];
    if (shouldQueueMonthlyExpenses) {
      const supabase = getWebSalesAutomationServiceClient();
      for (const task of EC_PROFIT_CODEX_TASKS) {
        estimateResults.push(await upsertEcProfitEstimate({
          supabase,
          channel: task.channel as EcProfitChannel,
          reportMonth: reportMonth.slice(0, 7),
          periodStart,
          periodEnd,
        }));
      }
    }
    const jobs = [...salesJobs, ...adJobs, ...profitJobs, ...retryJobs];
    return NextResponse.json({
      ok: true,
      trigger: triggerType,
      period: { startDate: periodStart, endDate: periodEnd, reportMonth },
      queued: jobs.length,
      salesQueued: salesJobs.length,
      adCostQueued: adJobs.length,
      ecProfitQueued: profitJobs.length,
      automaticRetryQueued: retryJobs.length,
      estimatesUpdated: estimateResults.filter((result) => result.status === "estimated").length,
      jobs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "定期同期に失敗しました" },
      { status: 500 },
    );
  }
}
