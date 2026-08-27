import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  INGREDIENT_LABEL_AI_MODEL,
  INGREDIENT_LABEL_AI_REASONING_EFFORT,
  INGREDIENT_LABEL_RULES_VERSION,
  ingredientLabelJobViewFromRow,
} from "@/lib/ingredient-label-codex";
import { buildIngredientLabelSourceSnapshot } from "@/lib/ingredient-label-codex-server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import type { CodexJobStatus } from "@/lib/web-sales-codex/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";
const ACTIVE_STATUSES: CodexJobStatus[] = ["queued", "running"];
const JOB_SELECT = "id,status,progress,current_step,error_message,parameters,result,created_at,started_at,updated_at,completed_at";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

export async function GET(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const recipeId = String(url.searchParams.get("recipeId") || "").trim();
    const jobId = String(url.searchParams.get("jobId") || "").trim();
    if (!recipeId) return NextResponse.json({ error: "recipeId が必要です" }, { status: 400 });
    const supabase = getWebSalesAutomationServiceClient();
    let query = supabase
      .from("web_sales_codex_jobs")
      .select(JOB_SELECT)
      .eq("task_key", "ingredient_label_generate")
      .contains("parameters", { recipeId });
    if (jobId) query = query.eq("id", jobId);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(jobId ? 1 : 10);
    if (error) throw error;
    const rows = (data || []).filter((row) => String(asObject(row.parameters).recipeId || "") === recipeId);
    const selected = jobId
      ? rows[0]
      : rows.find((row) => ACTIVE_STATUSES.includes(String(row.status) as CodexJobStatus)) || rows[0];
    return NextResponse.json({
      ok: true,
      job: selected ? ingredientLabelJobViewFromRow(selected) : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "原材料表示生成の進捗を確認できません",
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  try {
    const body = asObject(await request.json().catch(() => null));
    const recipeId = String(body.recipeId || "").trim();
    if (!recipeId) return NextResponse.json({ error: "recipeId が必要です" }, { status: 400 });
    const supabase = getWebSalesAutomationServiceClient();
    const sourceSnapshot = await buildIngredientLabelSourceSnapshot(supabase, recipeId);
    const recipe = asObject(sourceSnapshot.recipe);
    const items = Array.isArray(recipe.items) ? recipe.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "保存済みのレシピ原材料がありません" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const { data: activeRows, error: activeError } = await supabase
      .from("web_sales_codex_jobs")
      .select(JOB_SELECT)
      .eq("task_key", "ingredient_label_generate")
      .contains("parameters", { recipeId })
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    if (activeError) throw activeError;
    if (activeRows?.[0]) {
      const activeParameters = asObject(activeRows[0].parameters);
      const activeSnapshot = asObject(activeParameters.sourceSnapshot);
      const isCurrentRequest = String(activeParameters.model || "") === INGREDIENT_LABEL_AI_MODEL
        && String(activeParameters.reasoningEffort || "") === INGREDIENT_LABEL_AI_REASONING_EFFORT
        && String(activeParameters.rulesVersion || "") === INGREDIENT_LABEL_RULES_VERSION
        && String(activeSnapshot.sourceHash || "") === sourceSnapshot.sourceHash;
      if (isCurrentRequest) {
        return NextResponse.json({
          ok: true,
          reused: true,
          job: ingredientLabelJobViewFromRow(activeRows[0]),
        });
      }
      const { error: cancelError } = await supabase
        .from("web_sales_codex_jobs")
        .update({
          status: "cancelled",
          current_step: "旧ルールの生成を終了しました",
          error_message: `食品表示ルール ${INGREDIENT_LABEL_RULES_VERSION} で再生成します`,
          completed_at: now,
          updated_at: now,
        })
        .eq("id", activeRows[0].id)
        .in("status", ACTIVE_STATUSES);
      if (cancelError) throw cancelError;
      await supabase.from("web_sales_codex_job_events").insert({
        job_id: activeRows[0].id,
        event_type: "cancelled",
        message: `食品表示ルール ${INGREDIENT_LABEL_RULES_VERSION} へ更新するため旧タスクを終了しました`,
        progress: Number(activeRows[0].progress) || 0,
        payload: { replacementRulesVersion: INGREDIENT_LABEL_RULES_VERSION },
      });
    }
    const parameters = {
      taskKey: "ingredient_label_generate",
      recipeId,
      recipeName: String(recipe.name || "").slice(0, 300),
      sourceSnapshot,
      model: INGREDIENT_LABEL_AI_MODEL,
      reasoningEffort: INGREDIENT_LABEL_AI_REASONING_EFFORT,
      rulesVersion: INGREDIENT_LABEL_RULES_VERSION,
      executionPolicy: "fresh_ephemeral_skill_session_compact_saved_snapshot_only",
      mutationScope: "recipes.ai_ingredient_label_only",
    };
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: "ingredient_label_generate",
        channel: null,
        trigger_type: "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: "原材料表示案の生成待ち",
        requested_by: session.user?.email || ADMIN_EMAIL,
        parameters,
        priority: 45,
        max_attempts: 1,
        scheduled_at: now,
      })
      .select(JOB_SELECT)
      .single();
    if (jobError || !job) throw jobError || new Error("原材料表示生成タスクを登録できません");
    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: "queued",
      message: "専用Skillによる原材料表示案生成を登録しました",
      progress: 0,
      payload: {
        recipeId,
        sourceHash: sourceSnapshot.sourceHash,
        model: INGREDIENT_LABEL_AI_MODEL,
        reasoningEffort: INGREDIENT_LABEL_AI_REASONING_EFFORT,
        rulesVersion: INGREDIENT_LABEL_RULES_VERSION,
      },
    });
    return NextResponse.json({
      ok: true,
      reused: false,
      job: ingredientLabelJobViewFromRow(job),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "原材料表示生成を開始できません",
    }, { status: 500 });
  }
}
