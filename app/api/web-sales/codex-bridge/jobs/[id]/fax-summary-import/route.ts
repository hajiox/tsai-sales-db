import { NextResponse } from "next/server";
import {
  DOCSCANNER_FAX_SUMMARY_MODEL,
  DOCSCANNER_FAX_SUMMARY_REASONING_EFFORT,
  DOCSCANNER_FAX_SUMMARY_RULES_VERSION,
  DOCSCANNER_FAX_SUMMARY_TASK_KEY,
  docScannerFaxSummaryNeedsReview,
  formatDocScannerFaxSummaryForTsg,
  normalizeDocScannerFaxSourceKey,
  updateTsgDocScannerFaxSummary,
  validateDocScannerFaxSummaryResult,
} from "@/lib/docscanner-fax-summary";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = asObject(await request.json());
    const workerId = normalizeWorkerId(body.workerId);
    const sourceKey = normalizeDocScannerFaxSourceKey(body.sourceKey);
    const callbackStatus = String(body.status || "completed");
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,parameters")
      .eq("id", id)
      .single();
    if (error || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== DOCSCANNER_FAX_SUMMARY_TASK_KEY) {
      return NextResponse.json({ error: "FAX要約タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }
    const parameters = asObject(job.parameters);
    if (normalizeDocScannerFaxSourceKey(parameters.sourceKey) !== sourceKey) {
      return NextResponse.json({ error: "FAX受信IDが依頼時点と一致しません" }, { status: 409 });
    }

    if (callbackStatus === "failed") {
      const tsg = await updateTsgDocScannerFaxSummary({ sourceKey, summaryStatus: "failed" });
      return NextResponse.json({ ok: true, summaryStatus: "failed", tsg });
    }

    const model = String(body.model || "");
    const reasoningEffort = String(body.reasoningEffort || "");
    const rulesVersion = String(body.rulesVersion || "");
    if (model !== DOCSCANNER_FAX_SUMMARY_MODEL
      || reasoningEffort !== DOCSCANNER_FAX_SUMMARY_REASONING_EFFORT
      || rulesVersion !== DOCSCANNER_FAX_SUMMARY_RULES_VERSION
      || String(parameters.model || "") !== model
      || String(parameters.reasoningEffort || "") !== reasoningEffort
      || String(parameters.rulesVersion || "") !== rulesVersion) {
      return NextResponse.json({ error: "FAX要約のモデルまたはルールが依頼内容と一致しません" }, { status: 409 });
    }

    const result = validateDocScannerFaxSummaryResult(body.data);
    const summary = formatDocScannerFaxSummaryForTsg(result);
    const summaryStatus = docScannerFaxSummaryNeedsReview(result) ? "needs_review" : "completed";
    const tsg = await updateTsgDocScannerFaxSummary({ sourceKey, summaryStatus, summary });
    return NextResponse.json({ ok: true, summaryStatus, summary, result, tsg });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "FAX要約結果をTSGへ反映できません",
    }, { status: 500 });
  }
}
