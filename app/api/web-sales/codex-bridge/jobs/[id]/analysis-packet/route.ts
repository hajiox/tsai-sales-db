import { NextResponse } from "next/server";
import { z } from "zod";
import { buildWebSalesAnalysisPacket } from "@/lib/web-sales-analysis/packet";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({ workerId: z.string() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { workerId: rawWorkerId } = payloadSchema.parse(await request.json());
    const workerId = normalizeWorkerId(rawWorkerId);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,report_month,period_start,period_end")
      .eq("id", id)
      .single();
    if (error || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "web_sales_analysis") {
      return NextResponse.json({ error: "WEB販売分析タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }

    const month = String(job.report_month || "").slice(0, 7);
    const packet = await buildWebSalesAnalysisPacket({
      month,
      startDate: String(job.period_start),
      endDate: String(job.period_end),
    });
    return NextResponse.json({ packet });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "workerIdが正しくありません" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析データを準備できません" },
      { status: 500 },
    );
  }
}
