import { NextResponse } from "next/server";
import {
  INGREDIENT_LABEL_AI_MODEL,
  INGREDIENT_LABEL_AI_REASONING_EFFORT,
  INGREDIENT_LABEL_RULES_VERSION,
  validateIngredientLabelAiResult,
} from "@/lib/ingredient-label-codex";
import {
  buildIngredientLabelSourceSnapshot,
  ingredientLabelValidationPolicyFromSnapshot,
} from "@/lib/ingredient-label-codex-server";
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
  if (!isCodexBridgeAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = asObject(await request.json());
    const workerId = normalizeWorkerId(body.workerId);
    const model = String(body.model || "").trim();
    const reasoningEffort = String(body.reasoningEffort || "").trim();
    const rulesVersion = String(body.rulesVersion || "").trim();
    if (model !== INGREDIENT_LABEL_AI_MODEL
      || reasoningEffort !== INGREDIENT_LABEL_AI_REASONING_EFFORT
      || rulesVersion !== INGREDIENT_LABEL_RULES_VERSION) {
      return NextResponse.json({ error: "AIモデルまたは食品表示ルールが依頼内容と一致しません" }, { status: 409 });
    }
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,parameters")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "ingredient_label_generate") {
      return NextResponse.json({ error: "原材料表示生成タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }
    const parameters = asObject(job.parameters);
    if (String(parameters.model || "") !== model
      || String(parameters.reasoningEffort || "") !== reasoningEffort
      || String(parameters.rulesVersion || "") !== rulesVersion
      || JSON.stringify(parameters.sourceSnapshot) !== JSON.stringify(body.sourceSnapshot)) {
      return NextResponse.json({ error: "生成元のレシピ情報が依頼時点と一致しません" }, { status: 409 });
    }
    const recipeId = String(parameters.recipeId || "").trim();
    const requestedSnapshot = asObject(parameters.sourceSnapshot);
    if (!recipeId || !String(requestedSnapshot.sourceHash || "")) {
      return NextResponse.json({ error: "生成元のレシピ情報が不正です" }, { status: 409 });
    }
    const result = validateIngredientLabelAiResult(
      body.data,
      ingredientLabelValidationPolicyFromSnapshot(requestedSnapshot),
    );
    const currentSnapshot = await buildIngredientLabelSourceSnapshot(supabase, recipeId);
    if (currentSnapshot.sourceHash !== requestedSnapshot.sourceHash) {
      return NextResponse.json({
        error: "生成中にレシピまたは食材DBが変更されました。最新データで再生成してください",
      }, { status: 409 });
    }
    const { error: updateError } = await supabase
      .from("recipes")
      .update({ ai_ingredient_label: result.label })
      .eq("id", recipeId);
    if (updateError) throw updateError;
    return NextResponse.json({
      ok: true,
      sourceHash: currentSnapshot.sourceHash,
      data: result,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "原材料表示生成結果を保存できません",
    }, { status: 500 });
  }
}
