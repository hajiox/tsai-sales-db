import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  AD_COST_CODEX_TASKS,
  EC_PROFIT_CODEX_TASKS,
  WEB_SALES_CODEX_TASKS,
} from "@/lib/web-sales-codex/tasks";
import { REQUIRED_TSA_CODEX_BRIDGE_VERSION } from "@/lib/web-sales-codex/bridge-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  try {
    const supabase = getWebSalesAutomationServiceClient();
    const [runsResult, unmatchedResult, productsResult, jobsResult, workersResult, artifactsResult] = await Promise.all([
      supabase
        .from("web_sales_sync_runs")
        .select("id,channel,trigger_type,period_start,period_end,report_month,status,item_count,quantity_total,matched_count,unmatched_count,error_message,started_at,completed_at")
        .order("started_at", { ascending: false })
        .limit(70),
      supabase
        .from("web_sales_sync_unmatched")
        .select("id,run_id,channel,external_product_key,external_product_name,quantity,created_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("products")
        .select("id,name,series,product_code")
        .eq("is_hidden", false)
        .order("series_code")
        .order("product_code"),
      supabase
        .from("web_sales_codex_jobs")
        .select("id,task_key,channel,trigger_type,period_start,period_end,report_month,status,progress,current_step,result,error_message,worker_id,attempt_count,max_attempts,scheduled_at,heartbeat_at,started_at,completed_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("web_sales_codex_workers")
        .select("id,name,version,status,capabilities,current_job_id,last_error,last_seen_at,updated_at")
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("web_sales_codex_artifacts")
        .select("id,job_id,artifact_type,file_name,content_type,byte_size,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (runsResult.error) throw runsResult.error;
    if (unmatchedResult.error) throw unmatchedResult.error;
    if (productsResult.error) throw productsResult.error;
    if (jobsResult.error) throw jobsResult.error;
    if (workersResult.error) throw workersResult.error;
    if (artifactsResult.error) throw artifactsResult.error;

    const jobIds = (jobsResult.data || []).slice(0, 30).map((job) => job.id);
    const eventsResult = jobIds.length > 0
      ? await supabase
          .from("web_sales_codex_job_events")
          .select("id,job_id,event_type,message,progress,payload,created_at")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : { data: [], error: null };
    if (eventsResult.error) throw eventsResult.error;

    return NextResponse.json({
      tasks: WEB_SALES_CODEX_TASKS,
      adTasks: AD_COST_CODEX_TASKS,
      profitTasks: EC_PROFIT_CODEX_TASKS,
      jobs: jobsResult.data || [],
      workers: (workersResult.data || []).map((worker) => ({
        ...worker,
        online: Date.now() - new Date(worker.last_seen_at).getTime() < 70_000,
      })),
      bridge: {
        requiredVersion: REQUIRED_TSA_CODEX_BRIDGE_VERSION,
      },
      events: eventsResult.data || [],
      artifacts: artifactsResult.data || [],
      runs: runsResult.data || [],
      unmatched: unmatchedResult.data || [],
      products: productsResult.data || [],
      schedule: {
        halfMonth: "中間集計：毎月16日 09:15に当月1〜15日の商品販売個数のみ取得",
        previousMonth: "月次確定：毎月1日 09:15に前月の商品販売個数・広告費・EC手数料を取得",
        timezone: "Asia/Tokyo",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "自動同期状態を取得できません" },
      { status: 500 },
    );
  }
}
