import { NextResponse } from "next/server";
import { isCodexBridgeAuthorized } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { EC_PRODUCT_REGISTER_TASK_KEY } from "@/lib/ec-product-registration-codex";
import {
  buildEcProductRegisterPayload,
  buildEcProductRegisterPayloadHash,
  ecProductRegisterPayloadMismatchKeys,
} from "@/lib/ec-product-registration-job-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeWorkerId(value: unknown) {
  return String(value || "").trim().slice(0, 80);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const workerId = normalizeWorkerId(body.workerId);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,parameters")
      .eq("id", id)
      .eq("task_key", EC_PRODUCT_REGISTER_TASK_KEY)
      .single();
    if (jobError || !job) throw jobError || new Error("商品登録ジョブが見つかりません");
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "商品登録ジョブの実行権限がありません" }, { status: 409 });
    }
    const recipeId = String((job.parameters as Record<string, unknown>)?.recipeId || "");
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,selling_price,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method,product_lp_url,product_points,web_description,catchcopy")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) throw recipeError || new Error("レシピが見つかりません");
    const current = await buildEcProductRegisterPayload(supabase, recipe as Record<string, unknown>);
    const parameters = job.parameters as Record<string, unknown>;
    const payloadHash = buildEcProductRegisterPayloadHash(current);
    const mismatches = ecProductRegisterPayloadMismatchKeys(parameters, current);
    if (parameters.payloadHash !== payloadHash) mismatches.push("payloadHash");
    if (mismatches.length > 0) {
      return NextResponse.json({ error: `商品登録の確認後に固定情報が変わりました（差分: ${[...new Set(mismatches)].join(", ")}）` }, { status: 409 });
    }
    const { data: intent, error: intentError } = await supabase
      .from("recipe_ec_product_registration_intents")
      .select("id,status,payload_hash,job_id,submit_started_at")
      .eq("id", String(parameters.intentId || ""))
      .eq("job_id", id)
      .single();
    if (intentError || !intent || intent.payload_hash !== payloadHash) {
      return NextResponse.json({ error: "商品登録の固定済み実行記録が一致しません" }, { status: 409 });
    }
    if (intent.status !== "authorized" || intent.submit_started_at) {
      return NextResponse.json({ error: "この商品登録は送信開始済みのため自動再送できません" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "商品登録対象を再確認できません" },
      { status: 400 },
    );
  }
}
