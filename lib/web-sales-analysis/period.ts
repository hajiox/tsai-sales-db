import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

const CHANNEL_COUNT = 7;

export type WebSalesAnalysisPeriodType = "half_month" | "monthly";

export type WebSalesDisplayPeriod = {
  type: WebSalesAnalysisPeriodType;
  startDate: string;
  endDate: string;
  completedChannels: number;
  totalChannels: number;
  source: "codex_jobs" | "default";
};

export async function getWebSalesDisplayPeriod(month: string): Promise<WebSalesDisplayPeriod> {
  assertMonth(month);
  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("web_sales_codex_jobs")
    .select("channel,period_start,period_end,status,completed_at,created_at")
    .eq("task_key", "web_sales_import")
    .eq("report_month", `${month}-01`)
    .in("status", ["completed", "needs_review"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const latestByChannel = new Map<string, { period_start: string; period_end: string }>();
  for (const row of data || []) {
    const channel = String(row.channel || "");
    if (!channel || latestByChannel.has(channel) || !row.period_start || !row.period_end) continue;
    latestByChannel.set(channel, {
      period_start: String(row.period_start),
      period_end: String(row.period_end),
    });
  }

  const cohorts = new Map<string, number>();
  for (const period of latestByChannel.values()) {
    const key = `${period.period_start}:${period.period_end}`;
    cohorts.set(key, (cohorts.get(key) || 0) + 1);
  }
  const selected = [...cohorts.entries()]
    .map(([key, count]) => ({ key, count, endDate: key.split(":")[1] }))
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.count - a.count)[0];

  if (selected) {
    const [startDate, endDate] = selected.key.split(":");
    return {
      type: isHalfMonthPeriod(startDate, endDate) ? "half_month" : "monthly",
      startDate,
      endDate,
      completedChannels: selected.count,
      totalChannels: CHANNEL_COUNT,
      source: "codex_jobs",
    };
  }

  return {
    type: "monthly",
    startDate: `${month}-01`,
    endDate: lastDayOfMonth(month),
    completedChannels: 0,
    totalChannels: CHANNEL_COUNT,
    source: "default",
  };
}

export function isHalfMonthPeriod(startDate: string, endDate: string) {
  return startDate.slice(0, 7) === endDate.slice(0, 7)
    && startDate.endsWith("-01")
    && endDate.endsWith("-15");
}

export function assertAnalysisPeriod(month: string, startDate: string, endDate: string) {
  assertMonth(month);
  if (startDate.slice(0, 7) !== month || endDate.slice(0, 7) !== month) {
    throw new Error("分析期間は対象月の範囲内で指定してください");
  }
  const type: WebSalesAnalysisPeriodType = isHalfMonthPeriod(startDate, endDate)
    ? "half_month"
    : endDate === lastDayOfMonth(month) && startDate.endsWith("-01")
      ? "monthly"
      : (() => { throw new Error("分析期間は1〜15日または月初〜月末を指定してください"); })();
  return { type, startDate, endDate };
}

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("対象月が正しくありません");
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
