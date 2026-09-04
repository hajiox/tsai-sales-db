import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { buildEcPriceRecipeSnapshot, ecPriceSnapshotsMatch } from "@/lib/ec-price-job-server";
import {
  EC_PRODUCT_REGISTER_TARGET,
  EC_PRODUCT_REGISTER_TASK_KEY,
  ecProductRegisterResultFromUnknown,
  type EcProductRegisterJobView,
} from "@/lib/ec-product-registration-codex";
import {
  buildEcProductRegisterPayload,
  buildEcProductRegisterPayloadHash,
} from "@/lib/ec-product-registration-job-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";
const ACTIVE_STATUSES = ["queued", "running"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

function toJobView(job: Record<string, unknown>): EcProductRegisterJobView {
  const result = ecProductRegisterResultFromUnknown(job.result);
  return {
    id: String(job.id || ""),
    status: String(job.status || "queued") as EcProductRegisterJobView["status"],
    progress: Math.max(0, Math.min(100, Number(job.progress) || 0)),
    currentStep: String(job.current_step || "事務所PCの商品登録開始待ち"),
    summary: result?.summary || (job.error_message ? String(job.error_message).slice(0, 1000) : null),
    result,
    createdAt: String(job.created_at || ""),
    startedAt: job.started_at ? String(job.started_at) : null,
    heartbeatAt: job.heartbeat_at ? String(job.heartbeat_at) : null,
    updatedAt: job.updated_at ? String(job.updated_at) : null,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

async function loadRecipe(supabase: ReturnType<typeof getWebSalesAutomationServiceClient>, recipeId: string) {
  const { data, error } = await supabase
    .from("recipes")
    .select("id,name,is_intermediate,selling_price,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method,product_lp_url,product_points,web_description,catchcopy")
    .eq("id", recipeId)
    .single();
  if (error || !data) throw error || new Error("レシピが見つかりません");
  return data as Record<string, unknown>;
}

async function loadLatestJobs(
  supabase: ReturnType<typeof getWebSalesAutomationServiceClient>,
  recipeId: string,
  jobId?: string,
) {
  let query = supabase
    .from("web_sales_codex_jobs")
    .select("id,status,progress,current_step,error_message,parameters,result,created_at,started_at,heartbeat_at,updated_at,completed_at")
    .eq("task_key", EC_PRODUCT_REGISTER_TASK_KEY)
    .contains("parameters", { recipeId });
  if (jobId) query = query.eq("id", jobId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(jobId ? 1 : 20);
  if (error) throw error;
  return (data || []) as Record<string, unknown>[];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id: recipeId } = await params;
    const jobId = new URL(request.url).searchParams.get("jobId") || undefined;
    const supabase = getWebSalesAutomationServiceClient();
    const jobs = await loadLatestJobs(supabase, recipeId, jobId);
    if (jobId) {
      if (!jobs[0]) return NextResponse.json({ error: "商品登録ジョブが見つかりません" }, { status: 404 });
      return NextResponse.json({ job: toJobView(jobs[0]) });
    }
    const active = jobs.find((job) => ACTIVE_STATUSES.includes(String(job.status || "")));
    const { data: intent } = await supabase
      .from("recipe_ec_product_registration_intents")
      .select("id,status,job_id,product_identifier,public_url,submit_started_at,completed_at,updated_at")
      .eq("recipe_id", recipeId)
      .eq("target", EC_PRODUCT_REGISTER_TARGET)
      .maybeSingle();
    return NextResponse.json({
      activeJob: active ? toJobView(active) : null,
      latestJob: jobs[0] ? toJobView(jobs[0]) : null,
      history: jobs.map(toJobView),
      intent: intent || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "商品登録履歴を取得できません" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id: recipeId } = await params;
    const body = await request.json();
    const supabase = getWebSalesAutomationServiceClient();
    const recipe = await loadRecipe(supabase, recipeId);
    if (recipe.is_intermediate) {
      return NextResponse.json({ error: "中間加工品はEC商品登録の対象外です" }, { status: 400 });
    }
    const payload = await buildEcProductRegisterPayload(supabase, recipe);
    const payloadHash = buildEcProductRegisterPayloadHash(payload);
    const priceSnapshot = buildEcPriceRecipeSnapshot(recipe);
    const expectedSnapshot = buildEcPriceRecipeSnapshot(asObject(body.expectedRecipeSnapshot));
    if (
      String(body.target || EC_PRODUCT_REGISTER_TARGET) !== EC_PRODUCT_REGISTER_TARGET
      || Number(body.expectedPriceInclTax) !== payload.targetPrice
      || !ecPriceSnapshotsMatch(expectedSnapshot, priceSnapshot)
    ) {
      return NextResponse.json(
        { error: "確認後に価格または商品情報が変わりました。画面を再読込して確認し直してください" },
        { status: 409 },
      );
    }

    const { data: priceJobs, error: priceJobsError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,parameters,result,status")
      .eq("task_key", "ec_price_update")
      .contains("parameters", { recipeId })
      .order("created_at", { ascending: false })
      .limit(50);
    if (priceJobsError) throw priceJobsError;
    const verifiedMissing = (priceJobs || []).some((job) => {
      const parameters = asObject(job.parameters);
      const result = asObject(job.result);
      const sites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
      return result.validated_plan_checkpoint === true
        && ecPriceSnapshotsMatch(parameters.recipeSnapshot, priceSnapshot)
        && sites.some((site) => site.site === EC_PRODUCT_REGISTER_TARGET && site.status === "not_found");
    });
    if (!verifiedMissing) {
      return NextResponse.json(
        { error: "Qoo10で対象商品なしを確認した価格Bridge履歴がありません。先にQoo10価格確認を実行してください" },
        { status: 409 },
      );
    }

    const authorizedAt = new Date().toISOString();
    const requestedBy = session.user?.email || ADMIN_EMAIL;
    const intentId = randomUUID();
    const jobId = randomUUID();
    const parameters = {
      taskKey: EC_PRODUCT_REGISTER_TASK_KEY,
      protocolVersion: 1,
      intentId,
      payloadHash,
      recipeId,
      target: EC_PRODUCT_REGISTER_TARGET,
      ...payload,
      executionPolicy: "signed_in_browser_isolated_codex",
      operatorAuthorization: {
        executionAuthorized: true,
        source: "tsa_ec_product_registration_confirmation",
        authorizedAt,
        authorizedBy: requestedBy,
        recipeId,
        target: EC_PRODUCT_REGISTER_TARGET,
        productName: payload.productName,
        janCode: payload.janCode,
        targetPrice: payload.targetPrice,
        payloadHash,
      },
    };
    const { data: queuedData, error: enqueueError } = await supabase.rpc("enqueue_ec_product_register_job", {
      p_intent_id: intentId,
      p_job_id: jobId,
      p_recipe_id: recipeId,
      p_parameters: parameters,
      p_payload_hash: payloadHash,
      p_requested_by: requestedBy,
      p_scheduled_at: authorizedAt,
    });
    if (enqueueError) throw enqueueError;
    const queued = Array.isArray(queuedData) ? queuedData[0] : queuedData;
    if (!queued?.job_id) throw new Error("商品登録ジョブを登録できません");
    const queuedJobs = await loadLatestJobs(supabase, recipeId, String(queued.job_id));
    if (!queuedJobs[0]) throw new Error("商品登録ジョブを再取得できません");
    return NextResponse.json({
      ok: true,
      reused: queued.reused === true,
      alreadyRegistered: queued.already_registered === true,
      reviewRequired: queued.review_required === true,
      intentId: queued.intent_id,
      job: toJobView(queuedJobs[0]),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "商品登録ジョブを登録できません" },
      { status: 500 },
    );
  }
}
