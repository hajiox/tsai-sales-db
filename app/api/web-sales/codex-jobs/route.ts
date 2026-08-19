import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { validatePeriod } from "@/lib/web-sales-automation/date";
import {
  WEB_SALES_CHANNELS,
} from "@/lib/web-sales-automation/types";
import type { CodexChannel } from "@/lib/web-sales-codex/types";
import {
  enqueueCodexJobs,
  enqueueConnectionTest,
} from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

const AD_COST_CHANNELS = new Set(["google", "meta", "rakuten", "yahoo", "amazon"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.taskKey === "connection_test") {
      const job = await enqueueConnectionTest(session.user.email);
      return NextResponse.json({ ok: true, jobs: [job] });
    }

    const taskKey = body.taskKey === "ad_cost_import"
      ? "ad_cost_import"
      : body.taskKey === "ec_profit_import"
        ? "ec_profit_import"
        : "web_sales_import";
    const requested: string[] = Array.isArray(body.channels) ? body.channels.map(String) : [];
    const allowedChannels = taskKey === "ad_cost_import"
      ? AD_COST_CHANNELS
      : new Set<string>(WEB_SALES_CHANNELS);
    let channels = requested.filter((channel): channel is CodexChannel => allowedChannels.has(channel));
    if (channels.length === 0) {
      return NextResponse.json({ error: taskKey === "ad_cost_import" ? "実行する広告媒体を選択してください" : "実行するECを選択してください" }, { status: 400 });
    }
    const period = validatePeriod(String(body.startDate || ""), String(body.endDate || ""));
    if (taskKey !== "web_sales_import" && period.startDate.slice(0, 7) !== period.endDate.slice(0, 7)) {
      return NextResponse.json({ error: "広告費・EC控除は同じ月の期間を指定してください" }, { status: 400 });
    }
    if (body.incompleteOnly) {
      const supabase = getWebSalesAutomationServiceClient();
      const { data: periodJobs, error } = await supabase
        .from("web_sales_codex_jobs")
        .select("channel,status,result,created_at")
        .eq("task_key", taskKey)
        .in("channel", channels)
        .eq("period_start", period.startDate)
        .eq("period_end", period.endDate)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const latestJob = new Map<string, { status: string; result: Record<string, unknown> }>();
      for (const job of periodJobs || []) {
        if (job.channel && !latestJob.has(job.channel)) {
          latestJob.set(job.channel, {
            status: job.status,
            result: job.result && typeof job.result === "object"
              ? job.result as Record<string, unknown>
              : {},
          });
        }
      }
      const alreadyHandled = new Set(["completed", "queued", "running"]);
      channels = channels.filter((channel) => {
        const latest = latestJob.get(channel);
        if (!latest) return true;
        if (alreadyHandled.has(latest.status)) return false;
        if (latest.status !== "needs_review") return true;
        return !(Number(latest.result.unmatchedCount) > 0);
      });
      if (channels.length === 0) {
        return NextResponse.json({ ok: true, jobs: [], incompleteOnly: true });
      }
    }
    const jobs = await enqueueCodexJobs({
      taskKey,
      channels,
      startDate: period.startDate,
      endDate: period.endDate,
      triggerType: "manual",
      requestedBy: session.user.email,
    });
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Codexタスクを登録できません" },
      { status: 500 },
    );
  }
}
