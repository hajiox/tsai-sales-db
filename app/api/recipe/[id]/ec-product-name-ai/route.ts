import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  EC_PRODUCT_NAME_AI_MODEL,
  EC_PRODUCT_NAME_AI_REASONING_EFFORT,
  EC_PRODUCT_NAME_AI_RULES_VERSION,
  EC_PRODUCT_NAME_RULES,
  EC_PRODUCT_NAME_TARGETS,
  normalizeEcProductNamesBySite,
} from "@/lib/ec-product-name-codex";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import type { CodexJobStatus } from "@/lib/web-sales-codex/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";
const ACTIVE_STATUSES: CodexJobStatus[] = ["queued", "running"];

function clip(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function compactMessage(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 1000) : null;
}

function toJobView(job: Record<string, unknown>) {
  const parameters = asObject(job.parameters);
  return {
    id: String(job.id || ""),
    status: String(job.status || "queued") as CodexJobStatus,
    progress: Math.max(0, Math.min(100, Number(job.progress) || 0)),
    currentStep: String(job.current_step || "実行待ち"),
    errorMessage: compactMessage(job.error_message),
    result: job.result && typeof job.result === "object" ? job.result : null,
    model: String(parameters.model || EC_PRODUCT_NAME_AI_MODEL),
    reasoningEffort: String(parameters.reasoningEffort || EC_PRODUCT_NAME_AI_REASONING_EFFORT),
    rulesVersion: String(parameters.rulesVersion || EC_PRODUCT_NAME_AI_RULES_VERSION),
    createdAt: String(job.created_at || ""),
    startedAt: job.started_at ? String(job.started_at) : null,
    updatedAt: job.updated_at ? String(job.updated_at) : null,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

async function loadGenerationInput(recipeId: string) {
  const supabase = getWebSalesAutomationServiceClient();
  const [{ data: recipe, error: recipeError }, { data: syncRows, error: syncError }] = await Promise.all([
    supabase
      .from("recipes")
      .select("id,name,category,series,ec_product_name,ec_product_names_by_site,product_points,web_description,catchcopy,ingredient_label,filling_quantity,filling_quantity_unit,storage_method,shelf_life,jan_code,product_code")
      .eq("id", recipeId)
      .single(),
    supabase
      .from("recipe_ec_product_name_sync_state")
      .select("target,last_product_name,updated_at")
      .eq("recipe_id", recipeId),
  ]);
  if (recipeError || !recipe) throw new Error("レシピが見つかりません");
  if (syncError) throw syncError;

  const currentNames = normalizeEcProductNamesBySite(recipe.ec_product_names_by_site, recipe.ec_product_name);
  const lastVerifiedExternalNames = Object.fromEntries((syncRows || []).map((row) => [row.target, {
    name: clip(row.last_product_name, 255),
    verifiedAt: row.updated_at,
  }]));
  const sourceSnapshot = {
    recipeId: recipe.id,
    recipeName: clip(recipe.name, 300),
    category: clip(recipe.category, 100),
    series: clip(recipe.series, 120),
    currentFallbackName: clip(recipe.ec_product_name, 75),
    currentNames,
    lastVerifiedExternalNames,
    productPoints: clip(recipe.product_points, 8_000),
    webDescription: clip(recipe.web_description, 12_000),
    catchcopy: clip(recipe.catchcopy, 1_000),
    ingredientLabel: clip(recipe.ingredient_label, 4_000),
    fillingQuantity: recipe.filling_quantity,
    fillingQuantityUnit: clip(recipe.filling_quantity_unit, 30),
    storageMethod: clip(recipe.storage_method, 100),
    shelfLife: clip(recipe.shelf_life, 100),
    janCode: clip(recipe.jan_code, 32),
    productCode: clip(recipe.product_code, 100),
  };
  const siteRules = Object.fromEntries(EC_PRODUCT_NAME_TARGETS.map(({ id, label }) => [id, {
    label,
    platformMaxLength: EC_PRODUCT_NAME_RULES[id].platformMaxLength,
    preferredMaxLength: EC_PRODUCT_NAME_RULES[id].generationMaxLength,
    guidance: EC_PRODUCT_NAME_RULES[id].guidance,
  }]));
  return { supabase, recipe, sourceSnapshot, siteRules };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  }
  try {
    const { id: recipeId } = await params;
    const requestedJobId = new URL(request.url).searchParams.get("jobId")?.trim();
    const supabase = getWebSalesAutomationServiceClient();
    let query = supabase
      .from("web_sales_codex_jobs")
      .select("id,status,progress,current_step,error_message,parameters,result,created_at,started_at,updated_at,completed_at")
      .eq("task_key", "ec_product_name_generate")
      .contains("parameters", { recipeId });
    if (requestedJobId) query = query.eq("id", requestedJobId);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(requestedJobId ? 1 : 20);
    if (error) throw error;
    const jobs = (data || []).filter((row) => String(asObject(row.parameters).recipeId || "") === recipeId);
    if (requestedJobId && !jobs[0]) {
      return NextResponse.json({ error: "AI商品名生成タスクが見つかりません" }, { status: 404 });
    }
    const active = jobs.find((row) => ACTIVE_STATUSES.includes(String(row.status) as CodexJobStatus));
    return NextResponse.json({
      ok: true,
      job: requestedJobId
        ? toJobView(jobs[0] as Record<string, unknown>)
        : active
          ? toJobView(active as Record<string, unknown>)
          : jobs[0]
            ? toJobView(jobs[0] as Record<string, unknown>)
            : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "AI商品名生成タスクを確認できません",
    }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });

  try {
    const { id: recipeId } = await params;
    const { supabase, recipe, sourceSnapshot, siteRules } = await loadGenerationInput(recipeId);
    const { data: activeRows, error: activeError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,status,progress,current_step,error_message,parameters,result,created_at,started_at,updated_at,completed_at")
      .eq("task_key", "ec_product_name_generate")
      .contains("parameters", { recipeId })
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    if (activeError) throw activeError;
    if (activeRows?.[0]) {
      const activeParameters = asObject(activeRows[0].parameters);
      if (JSON.stringify(activeParameters.sourceSnapshot) !== JSON.stringify(sourceSnapshot)) {
        return NextResponse.json(
          { error: "商品情報を変更する前のAI生成が実行中です。完了後に再実行してください" },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, reused: true, job: toJobView(activeRows[0] as Record<string, unknown>) });
    }

    const now = new Date().toISOString();
    const parameters = {
      taskKey: "ec_product_name_generate",
      recipeId,
      recipeName: clip(recipe.name, 300),
      sourceSnapshot,
      siteRules,
      model: EC_PRODUCT_NAME_AI_MODEL,
      reasoningEffort: EC_PRODUCT_NAME_AI_REASONING_EFFORT,
      rulesVersion: EC_PRODUCT_NAME_AI_RULES_VERSION,
      executionPolicy: "compact_packet_then_isolated_codex_skill",
      mutationScope: "none",
    };
    const { data: job, error: insertError } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: "ec_product_name_generate",
        channel: null,
        trigger_type: "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: "GPT-5.6 Solの商品名分析待ち",
        requested_by: session.user?.email || ADMIN_EMAIL,
        parameters,
        priority: 40,
        max_attempts: 2,
        scheduled_at: now,
      })
      .select("id,status,progress,current_step,error_message,parameters,result,created_at,started_at,updated_at,completed_at")
      .single();
    if (insertError || !job) throw insertError || new Error("AI商品名生成タスクを登録できません");
    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: "queued",
      message: "GPT-5.6 Sol専用Skillの商品名分析を実行待ちに登録しました",
      progress: 0,
      payload: { recipeId, model: EC_PRODUCT_NAME_AI_MODEL, rulesVersion: EC_PRODUCT_NAME_AI_RULES_VERSION },
    });
    return NextResponse.json({ ok: true, reused: false, job: toJobView(job) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "AI商品名生成タスクを登録できません",
    }, { status: 500 });
  }
}
