import { NextResponse } from "next/server";
import { validatePeriod } from "@/lib/web-sales-automation/date";
import { parsePreparedWebSalesCsv } from "@/lib/web-sales-automation/csv-import";
import {
  getWebSalesAutomationServiceClient,
  runImportedCsvSync,
} from "@/lib/web-sales-automation/sync";
import {
  asWebSalesChannel,
  isCodexBridgeAuthorized,
  normalizeWorkerId,
} from "@/lib/web-sales-codex/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SIZE = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const formData = await request.formData();
    const workerId = normalizeWorkerId(formData.get("workerId"));
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "ファイルは25MB以下にしてください" }, { status: 413 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,worker_id,channel,period_start,period_end,report_month,status")
      .eq("id", id)
      .eq("worker_id", workerId)
      .single();
    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found for worker" }, { status: 404 });
    }
    if (job.status !== "running") {
      return NextResponse.json({ error: "実行中のジョブではありません" }, { status: 409 });
    }

    const channel = asWebSalesChannel(job.channel);
    const period = validatePeriod(job.period_start, job.period_end);
    if (period.reportMonth !== job.report_month) {
      throw new Error("ジョブの対象月が一致しません");
    }

    const parsed = parsePreparedWebSalesCsv(channel, await file.text(), period);
    const expectedQuantityRaw = String(formData.get("expectedQuantity") || "").trim();
    const expectedQuantity = expectedQuantityRaw ? Number(expectedQuantityRaw) : Number.NaN;
    if (Number.isFinite(expectedQuantity)
      && Math.abs(expectedQuantity - parsed.quantityTotal) > 0.01) {
      return NextResponse.json({
        error: `CSV数量が一致しません（検証: ${expectedQuantity} / 取込: ${parsed.quantityTotal}）`,
      }, { status: 422 });
    }

    const result = await runImportedCsvSync(channel, period, parsed.items, {
      source: "codex_bridge_csv",
      codex_job_id: id,
      source_file_name: file.name.slice(0, 180),
      parsed_row_count: parsed.rowCount,
    });
    const status = result.status === "success" ? "completed" : result.status;
    const summary = status === "completed"
      ? `${parsed.quantityTotal}個をTSAへ登録しました`
      : status === "needs_review"
        ? `${result.unmatchedCount}商品が未マッチのため、月次集計は更新していません`
        : result.error || "CSV取込に失敗しました";

    return NextResponse.json({
      status,
      summary,
      runId: result.runId,
      itemCount: result.itemCount,
      quantityTotal: result.quantityTotal,
      matchedCount: result.matchedCount,
      unmatchedCount: result.unmatchedCount,
      importedCount: status === "completed" ? result.quantityTotal : null,
      error: result.error || null,
    }, { status: status === "failed" ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV direct import failed" },
      { status: 400 },
    );
  }
}
