import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  isCodexBridgeAuthorized,
  normalizeWorkerId,
} from "@/lib/web-sales-codex/server";
import type { CodexJobStatus } from "@/lib/web-sales-codex/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINAL_STATUSES: CodexJobStatus[] = [
  "waiting_for_user",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
];

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
    const status = String(body.status || "running") as CodexJobStatus;
    if (!["running", ...FINAL_STATUSES].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const progress = Math.max(0, Math.min(100, Number(body.progress) || 0));
    const message = String(body.message || body.currentStep || "").slice(0, 4000);
    const now = new Date().toISOString();
    const isFinal = FINAL_STATUSES.includes(status);
    const supabase = getWebSalesAutomationServiceClient();
    const updates = {
      status,
      progress: isFinal && status === "completed" ? 100 : progress,
      current_step: String(body.currentStep || message || "処理中").slice(0, 500),
      result: body.result && typeof body.result === "object" ? body.result : {},
      error_message: body.errorMessage ? String(body.errorMessage).slice(0, 4000) : null,
      heartbeat_at: now,
      lease_expires_at: isFinal ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      completed_at: isFinal ? now : null,
      updated_at: now,
    };
    const { data: job, error } = await supabase
      .from("web_sales_codex_jobs")
      .update(updates)
      .eq("id", id)
      .eq("worker_id", workerId)
      .select("id")
      .single();
    if (error || !job) throw error || new Error("Job not found for worker");

    await supabase.from("web_sales_codex_job_events").insert({
      job_id: id,
      event_type: String(body.eventType || status).slice(0, 80),
      message,
      progress: updates.progress,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    });

    if (isFinal) {
      await supabase
        .from("web_sales_codex_workers")
        .update({
          status: status === "failed" ? "error" : "online",
          current_job_id: null,
          last_error: status === "failed" ? updates.error_message : null,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", workerId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job update failed" },
      { status: 400 },
    );
  }
}
