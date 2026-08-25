import { NextResponse } from "next/server";
import {
  RECIPE_SNS_MODEL,
  RECIPE_SNS_REASONING_EFFORT,
  RECIPE_SNS_RULES_VERSION,
  validateRecipeSnsAiResult,
} from "@/lib/recipe-sns";
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
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = asObject(await request.json());
    const workerId = normalizeWorkerId(body.workerId);
    const model = String(body.model || "").trim();
    const reasoningEffort = String(body.reasoningEffort || "").trim();
    const rulesVersion = String(body.rulesVersion || "").trim();
    if (model !== RECIPE_SNS_MODEL
      || reasoningEffort !== RECIPE_SNS_REASONING_EFFORT
      || rulesVersion !== RECIPE_SNS_RULES_VERSION) {
      return NextResponse.json({ error: "SNS生成モデルまたはルール版が依頼内容と一致しません" }, { status: 409 });
    }

    const result = validateRecipeSnsAiResult(body.data);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,requested_by,parameters")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "recipe_sns_generate") {
      return NextResponse.json({ error: "SNS投稿生成タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }

    const parameters = asObject(job.parameters);
    const sourceSnapshot = asObject(parameters.sourceSnapshot);
    if (String(parameters.model || "") !== model
      || String(parameters.reasoningEffort || "") !== reasoningEffort
      || String(parameters.rulesVersion || "") !== rulesVersion
      || JSON.stringify(parameters.sourceSnapshot) !== JSON.stringify(body.sourceSnapshot)) {
      return NextResponse.json({ error: "SNS生成元の商品情報が依頼時点と一致しません" }, { status: 409 });
    }
    if (result.variation_key !== String(sourceSnapshot.variationKey || "")) {
      return NextResponse.json({ error: "SNS投稿の訴求軸が依頼内容と一致しません" }, { status: 409 });
    }
    const generationId = String(parameters.generationId || "").trim();
    if (!generationId) return NextResponse.json({ error: "SNS生成履歴IDが不正です" }, { status: 409 });

    const { data: generation, error: generationError } = await supabase
      .from("recipe_sns_generations")
      .select("id,status,image_variants,posts,created_at,completed_at")
      .eq("id", generationId)
      .eq("job_id", id)
      .single();
    if (generationError || !generation) {
      return NextResponse.json({ error: "SNS生成履歴が見つかりません" }, { status: 404 });
    }
    if (generation.status === "completed" && generation.posts) {
      return NextResponse.json({
        ok: true,
        reused: true,
        generationId: generation.id,
        createdAt: generation.created_at,
        completedAt: generation.completed_at,
        imageVariants: generation.image_variants,
        ...validateRecipeSnsAiResult(generation.posts),
      });
    }
    if (generation.status !== "pending") {
      return NextResponse.json({ error: "SNS生成履歴は更新できない状態です" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("recipe_sns_generations")
      .update({ status: "completed", posts: result, completed_at: now, error_message: null })
      .eq("id", generationId)
      .eq("job_id", id)
      .eq("status", "pending");
    if (updateError) throw updateError;
    return NextResponse.json({
      ok: true,
      reused: false,
      generationId,
      createdAt: generation.created_at,
      completedAt: now,
      imageVariants: generation.image_variants,
      model,
      reasoningEffort,
      rulesVersion,
      ...result,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SNS投稿文を保存できません",
    }, { status: 500 });
  }
}
