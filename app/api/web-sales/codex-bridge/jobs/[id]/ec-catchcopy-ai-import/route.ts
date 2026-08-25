import { NextResponse } from "next/server";
import {
  EC_CATCHCOPY_AI_MODEL,
  EC_CATCHCOPY_AI_REASONING_EFFORT,
  EC_CATCHCOPY_AI_RULES_VERSION,
  validateEcCatchcopyAiResult,
} from "@/lib/ec-catchcopy-codex";
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
    if (model !== EC_CATCHCOPY_AI_MODEL
      || reasoningEffort !== EC_CATCHCOPY_AI_REASONING_EFFORT
      || rulesVersion !== EC_CATCHCOPY_AI_RULES_VERSION) {
      return NextResponse.json({ error: "AIモデルまたは生成ルールが依頼内容と一致しません" }, { status: 409 });
    }
    const result = validateEcCatchcopyAiResult(body.data);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,requested_by,parameters")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "ec_catchcopy_generate") {
      return NextResponse.json({ error: "AIキャッチコピー生成タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }
    const parameters = asObject(job.parameters);
    if (String(parameters.model || "") !== model
      || String(parameters.reasoningEffort || "") !== reasoningEffort
      || String(parameters.rulesVersion || "") !== rulesVersion
      || JSON.stringify(parameters.sourceSnapshot) !== JSON.stringify(body.sourceSnapshot)) {
      return NextResponse.json({ error: "生成元の商品情報が依頼時点と一致しません" }, { status: 409 });
    }
    const recipeId = String(parameters.recipeId || "").trim();
    if (!recipeId) return NextResponse.json({ error: "対象レシピが不正です" }, { status: 409 });

    const { data: existing, error: existingError } = await supabase
      .from("recipe_ec_catchcopy_ai_generations")
      .select("id,created_at,model,reasoning_effort,rules_version,suggestions")
      .eq("job_id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const existingResult = validateEcCatchcopyAiResult(existing.suggestions);
      return NextResponse.json({
        ok: true,
        reused: true,
        generationId: existing.id,
        createdAt: existing.created_at,
        model: existing.model,
        reasoningEffort: existing.reasoning_effort,
        rulesVersion: existing.rules_version,
        ...existingResult,
      });
    }

    const { data: generation, error: insertError } = await supabase
      .from("recipe_ec_catchcopy_ai_generations")
      .insert({
        job_id: id,
        recipe_id: recipeId,
        model,
        reasoning_effort: reasoningEffort,
        rules_version: rulesVersion,
        source_snapshot: parameters.sourceSnapshot,
        suggestions: result,
        created_by: job.requested_by || "bridge",
      })
      .select("id,created_at")
      .single();
    if (insertError || !generation) throw insertError || new Error("AI生成履歴を保存できません");

    return NextResponse.json({
      ok: true,
      generationId: generation.id,
      createdAt: generation.created_at,
      model,
      reasoningEffort,
      rulesVersion,
      ...result,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "AIキャッチコピー候補を保存できません",
    }, { status: 500 });
  }
}

