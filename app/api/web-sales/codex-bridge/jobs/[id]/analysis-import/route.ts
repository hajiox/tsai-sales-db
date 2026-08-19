import { NextResponse } from "next/server";
import { z } from "zod";
import { webSalesAnalysisResultSchema } from "@/lib/web-sales-analysis/schema";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { isHalfMonthPeriod } from "@/lib/web-sales-analysis/period";
import { postWebSalesFloorSummary } from "@/lib/tsg-floor-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  workerId: z.string(),
  model: z.string().min(1).max(100),
  data: webSalesAnalysisResultSchema,
  inputSnapshot: z.record(z.string(), z.unknown()),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const parsed = payloadSchema.parse(await request.json());
    const workerId = normalizeWorkerId(parsed.workerId);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,report_month,period_start,period_end,requested_by")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "web_sales_analysis") {
      return NextResponse.json({ error: "WEB販売分析タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }

    const month = String(job.report_month).slice(0, 7);
    const periodStart = String(job.period_start);
    const periodEnd = String(job.period_end);
    const analysisType = isHalfMonthPeriod(periodStart, periodEnd) ? "half_month" : "monthly";
    const { data: latest, error: versionError } = await supabase
      .from("web_sales_ai_analyses")
      .select("version")
      .eq("report_month", job.report_month)
      .eq("analysis_type", analysisType)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw versionError;
    const version = Number(latest?.version || 0) + 1;
    const row = {
      job_id: job.id,
      report_month: job.report_month,
      period_start: periodStart,
      period_end: periodEnd,
      analysis_type: analysisType,
      version,
      model: parsed.model,
      status: parsed.data.status,
      executive_summary: parsed.data.executive_summary,
      sales_analysis: parsed.data.sales_analysis,
      expense_analysis: parsed.data.expense_analysis,
      floor_staff_summary: parsed.data.floor_staff_summary,
      actions: parsed.data.actions,
      risks: parsed.data.risks,
      data_quality: parsed.data.data_quality,
      input_snapshot: parsed.inputSnapshot,
      raw_result: parsed.data,
      created_by: job.requested_by,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: insertError } = await supabase
      .from("web_sales_ai_analyses")
      .insert(row)
      .select("id,version,created_at")
      .single();
    if (insertError || !saved) throw insertError || new Error("分析結果を保存できません");

    let postStatus: "posted" | "failed" = "posted";
    let postError: string | null = null;
    let postUrl: string | null = null;
    try {
      const posted = await postWebSalesFloorSummary({
        month,
        periodStart,
        periodEnd,
        analysisType,
        summary: parsed.data.floor_staff_summary,
        sourceKey: `tsa-web-sales-analysis:${job.id}`,
      });
      postUrl = posted.url;
      await supabase
        .from("web_sales_ai_analyses")
        .update({
          tsg_post_status: "posted",
          tsg_post_id: posted.post.id,
          tsg_board_id: posted.group.id,
          tsg_post_url: posted.url,
          tsg_post_error: null,
          tsg_posted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", saved.id);
    } catch (error) {
      postStatus = "failed";
      postError = error instanceof Error ? error.message : "TSG投稿に失敗しました";
      await supabase
        .from("web_sales_ai_analyses")
        .update({
          tsg_post_status: "failed",
          tsg_post_error: postError,
          updated_at: new Date().toISOString(),
        })
        .eq("id", saved.id);
    }

    const responseStatus = postStatus === "failed" ? "needs_review" : parsed.data.status;
    return NextResponse.json({
      status: responseStatus,
      summary: postStatus === "posted"
        ? `${month}の分析 第${saved.version}版を保存し、TSGフロアへ投稿しました`
        : `${month}の分析は保存しましたが、TSG投稿に失敗しました: ${postError}`,
      analysisId: saved.id,
      version: saved.version,
      createdAt: saved.created_at,
      tsgPostStatus: postStatus,
      tsgPostUrl: postUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: `分析結果の形式が正しくありません: ${error.issues[0]?.message || "validation error"}` },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析結果を保存できません" },
      { status: 500 },
    );
  }
}
