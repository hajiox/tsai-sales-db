import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  isCodexBridgeAuthorized,
  normalizeWorkerId,
} from "@/lib/web-sales-codex/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const workerId = normalizeWorkerId(body.workerId);
    const supabase = getWebSalesAutomationServiceClient();
    const now = new Date().toISOString();
    const { error: workerError } = await supabase.from("web_sales_codex_workers").upsert({
      id: workerId,
      name: String(body.name || workerId).slice(0, 120),
      version: String(body.version || "").slice(0, 40) || null,
      status: "online",
      capabilities: body.capabilities && typeof body.capabilities === "object" ? body.capabilities : {},
      current_job_id: null,
      last_error: null,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: "id" });
    if (workerError) throw workerError;

    const { data, error } = await supabase.rpc("claim_web_sales_codex_job", {
      p_worker_id: workerId,
      p_lease_seconds: 900,
    });
    if (error) throw error;
    return NextResponse.json({ job: data?.[0] || null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim failed" },
      { status: 400 },
    );
  }
}
