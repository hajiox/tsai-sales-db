import { NextResponse } from "next/server";
import { inactiveEcJobTargets, ecOperationBlockedMessage } from "@/lib/ec-operation-policy";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  isCodexBridgeAuthorized,
  normalizeWorkerId,
} from "@/lib/web-sales-codex/server";
import {
  isRetiredLegacyTsaCodexBridge,
  REQUIRED_TSA_CODEX_BRIDGE_VERSION,
} from "@/lib/web-sales-codex/bridge-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const workerId = normalizeWorkerId(body.workerId);
    const bridgeVersion = String(body.version || "").trim();
    if (isRetiredLegacyTsaCodexBridge(workerId, bridgeVersion)) {
      return NextResponse.json({
        job: null,
        retired: true,
        requiredVersion: REQUIRED_TSA_CODEX_BRIDGE_VERSION,
      });
    }
    if (bridgeVersion !== REQUIRED_TSA_CODEX_BRIDGE_VERSION) {
      return NextResponse.json({
        error: `Bridge ${REQUIRED_TSA_CODEX_BRIDGE_VERSION} への更新が必要です`,
        requiredVersion: REQUIRED_TSA_CODEX_BRIDGE_VERSION,
      }, { status: 409 });
    }
    const supabase = getWebSalesAutomationServiceClient();
    const now = new Date().toISOString();

    const { data: existingWorker, error: existingWorkerError } = await supabase
      .from("web_sales_codex_workers")
      .select("current_job_id,last_seen_at")
      .eq("id", workerId)
      .maybeSingle();
    if (existingWorkerError) throw existingWorkerError;
    if (existingWorker?.current_job_id) {
      const { data: activeJob, error: activeJobError } = await supabase
        .from("web_sales_codex_jobs")
        .select("id,status,lease_expires_at")
        .eq("id", existingWorker.current_job_id)
        .maybeSingle();
      if (activeJobError) throw activeJobError;
      const leaseExpiresAt = activeJob?.lease_expires_at ? Date.parse(activeJob.lease_expires_at) : 0;
      if (activeJob?.status === "running" && leaseExpiresAt > Date.now()) {
        return NextResponse.json({ job: null, busy: true });
      }
    }

    const { error: workerError } = await supabase.from("web_sales_codex_workers").upsert({
      id: workerId,
      name: String(body.name || workerId).slice(0, 120),
      version: bridgeVersion.slice(0, 40),
      status: "online",
      capabilities: body.capabilities && typeof body.capabilities === "object" ? body.capabilities : {},
      current_job_id: null,
      last_error: null,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: "id" });
    if (workerError) throw workerError;

    let job = null;
    // Old queued jobs remain in history, but must never reach a retired store.
    for (let skipped = 0; skipped < 20; skipped += 1) {
      const { data, error } = await supabase.rpc("claim_web_sales_codex_job", {
        p_worker_id: workerId,
        p_lease_seconds: 900,
      });
      if (error) throw error;
      const candidate = data?.[0] || null;
      if (!candidate) break;
      const blocked = inactiveEcJobTargets(candidate);
      if (blocked.length === 0) { job = candidate; break; }
      const message = ecOperationBlockedMessage(blocked);
      const { data: cancelled, error: cancelError } = await supabase.from("web_sales_codex_jobs")
        .update({ status: "cancelled", current_step: "退店・開店準備中のため実行対象外", error_message: message,
          completed_at: now, updated_at: now, lease_expires_at: null })
        .eq("id", candidate.id).eq("status", "running").eq("worker_id", workerId).select("id").maybeSingle();
      if (cancelError) throw cancelError;
      if (!cancelled) continue;
      const { error: eventError } = await supabase.from("web_sales_codex_job_events").insert({
        job_id: candidate.id, event_type: "cancelled", message, progress: 0, payload: { inactiveChannels: blocked },
      });
      if (eventError) throw eventError;
    }
    {
      const { error: busyError } = await supabase
        .from("web_sales_codex_workers")
        .update({
          status: job ? "busy" : "online",
          current_job_id: job?.id || null,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", workerId);
      if (busyError) throw busyError;
    }
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim failed" },
      { status: 400 },
    );
  }
}
