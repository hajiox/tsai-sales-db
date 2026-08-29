import { NextResponse } from "next/server";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { upsertEcProfitEstimate, type EcProfitChannel } from "@/lib/web-sales-codex/ec-profit-estimate";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const workerId = normalizeWorkerId(body.workerId);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,channel,status,worker_id,period_start,period_end,report_month")
      .eq("id", id)
      .single();
    if (error || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (!["ec_profit_import", "web_sales_import"].includes(job.task_key) || job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中の売上・EC精算タスクではありません" }, { status: 409 });
    }

    const result = await upsertEcProfitEstimate({
      supabase,
      channel: job.channel as EcProfitChannel,
      reportMonth: String(job.report_month).slice(0, 7),
      periodStart: job.period_start,
      periodEnd: job.period_end,
    });
    return NextResponse.json({
      status: "needs_review",
      summary: result.status === "estimated"
        ? `${label(job.channel)}の公式費目別明細を照合できないため概算を反映しました`
        : result.message,
      details: result.message,
      estimated: result.status === "estimated",
      importedCount: result.status === "estimated" ? 1 : 0,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "概算を更新できませんでした" },
      { status: 500 },
    );
  }
}

function label(channel: string) {
  return ({ amazon: "Amazon", rakuten: "楽天市場", yahoo: "Yahoo!", mercari: "メルカリShops", base: "BASE", qoo10: "Qoo10", tiktok: "TikTok Shop" } as Record<string, string>)[channel] || channel;
}
