import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  isCodexBridgeAuthorized,
  normalizeWorkerId,
} from "@/lib/web-sales-codex/server";
import { REQUIRED_TSA_CODEX_BRIDGE_VERSION } from "@/lib/web-sales-codex/bridge-version";

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
    if (bridgeVersion !== REQUIRED_TSA_CODEX_BRIDGE_VERSION) {
      return NextResponse.json({
        error: `Bridge ${REQUIRED_TSA_CODEX_BRIDGE_VERSION} への更新が必要です`,
        requiredVersion: REQUIRED_TSA_CODEX_BRIDGE_VERSION,
      }, { status: 409 });
    }
    const currentJobId = body.currentJobId ? String(body.currentJobId) : null;
    const supabase = getWebSalesAutomationServiceClient();
    const now = new Date().toISOString();
    const { error } = await supabase.from("web_sales_codex_workers").upsert({
      id: workerId,
      name: String(body.name || workerId).slice(0, 120),
      version: bridgeVersion.slice(0, 40),
      status: currentJobId ? "busy" : "online",
      capabilities: body.capabilities && typeof body.capabilities === "object" ? body.capabilities : {},
      current_job_id: currentJobId,
      last_error: body.lastError ? String(body.lastError).slice(0, 4000) : null,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: "id" });
    if (error) throw error;

    if (currentJobId) {
      await supabase
        .from("web_sales_codex_jobs")
        .update({
          heartbeat_at: now,
          lease_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          updated_at: now,
        })
        .eq("id", currentJobId)
        .eq("worker_id", workerId)
        .eq("status", "running");
    }
    return NextResponse.json({ ok: true, serverTime: now });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Heartbeat failed" },
      { status: 400 },
    );
  }
}
