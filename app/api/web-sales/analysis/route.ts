import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enqueueWebSalesAnalysisJob } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { getWebSalesDisplayPeriod } from "@/lib/web-sales-analysis/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const month = new URL(request.url).searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "対象月が正しくありません" }, { status: 400 });
  }

  try {
    const supabase = getWebSalesAutomationServiceClient();
    const reportMonth = `${month}-01`;
    const [analysesResult, jobsResult, workersResult, displayPeriod] = await Promise.all([
      supabase
        .from("web_sales_ai_analyses")
        .select("id,job_id,report_month,period_start,period_end,analysis_type,version,model,status,executive_summary,sales_analysis,expense_analysis,floor_staff_summary,actions,risks,data_quality,tsg_post_status,tsg_post_url,tsg_post_error,created_by,created_at")
        .eq("report_month", reportMonth)
        .order("created_at", { ascending: false }),
      supabase
        .from("web_sales_codex_jobs")
        .select("id,status,progress,current_step,error_message,result,worker_id,period_start,period_end,created_at,started_at,completed_at")
        .eq("task_key", "web_sales_analysis")
        .eq("report_month", reportMonth)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("web_sales_codex_workers")
        .select("id,name,version,status,last_seen_at,capabilities,last_error")
        .order("last_seen_at", { ascending: false })
        .limit(1),
      getWebSalesDisplayPeriod(month),
    ]);
    for (const result of [analysesResult, jobsResult, workersResult]) {
      if (result.error) throw result.error;
    }
    return NextResponse.json({
      month,
      analyses: analysesResult.data || [],
      jobs: jobsResult.data || [],
      worker: workersResult.data?.[0] || null,
      displayPeriod,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析履歴を取得できません" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const month = String(body.month || "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "対象月が正しくありません" }, { status: 400 });
    }
    const displayPeriod = await getWebSalesDisplayPeriod(month);
    const job = await enqueueWebSalesAnalysisJob({
      month,
      startDate: displayPeriod.startDate,
      endDate: displayPeriod.endDate,
      requestedBy: session.user.email,
    });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析タスクを登録できません" },
      { status: 500 },
    );
  }
}
