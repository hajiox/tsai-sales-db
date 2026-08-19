import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const action = String(body.action || "");
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("*")
      .eq("id", id)
      .single();
    if (jobError || !job) {
      return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    }

    if (action === "cancel") {
      if (!["queued", "waiting_for_user"].includes(job.status)) {
        return NextResponse.json({ error: "このタスクは取り消せません" }, { status: 409 });
      }
      const { error } = await supabase
        .from("web_sales_codex_jobs")
        .update({
          status: "cancelled",
          current_step: "取り消しました",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      await supabase.from("web_sales_codex_job_events").insert({
        job_id: id,
        event_type: "cancelled",
        message: "画面からタスクを取り消しました",
        progress: job.progress,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "retry") {
      if (!["failed", "waiting_for_user", "needs_review", "cancelled"].includes(job.status)) {
        return NextResponse.json({ error: "このタスクは再実行できません" }, { status: 409 });
      }
      const { data: retried, error } = await supabase
        .from("web_sales_codex_jobs")
        .insert({
          task_key: job.task_key,
          channel: job.channel,
          trigger_type: "retry",
          period_start: job.period_start,
          period_end: job.period_end,
          report_month: job.report_month,
          status: "queued",
          progress: 0,
          current_step: "再実行待ち",
          parameters: job.parameters || {},
          requested_by: session.user.email,
          max_attempts: job.max_attempts,
        })
        .select("id")
        .single();
      if (error || !retried) throw error || new Error("再実行を登録できません");
      await supabase.from("web_sales_codex_job_events").insert({
        job_id: retried.id,
        event_type: "queued",
        message: `タスク ${id.slice(0, 8)} から再実行しました`,
        progress: 0,
      });
      return NextResponse.json({ ok: true, jobId: retried.id });
    }

    return NextResponse.json({ error: "操作が正しくありません" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "タスクを更新できません" },
      { status: 500 },
    );
  }
}
