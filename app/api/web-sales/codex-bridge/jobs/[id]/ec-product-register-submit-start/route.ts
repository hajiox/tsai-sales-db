import { NextResponse } from "next/server";
import { isCodexBridgeAuthorized } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const workerId = String(body.workerId || "").trim().slice(0, 80);
    const payloadHash = String(body.payloadHash || "").trim();
    if (!workerId || !/^[0-9a-f]{64}$/.test(payloadHash)) {
      return NextResponse.json({ error: "商品登録の送信開始情報が不正です" }, { status: 400 });
    }
    const supabase = getWebSalesAutomationServiceClient();
    const { data, error } = await supabase.rpc("mark_ec_product_register_submission_started", {
      p_job_id: id,
      p_worker_id: workerId,
      p_payload_hash: payloadHash,
    });
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "送信開始済み、または商品登録の実行権限がありません" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "商品登録の送信開始を記録できません" },
      { status: 400 },
    );
  }
}
