import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "node:crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  RECIPE_SNS_MODEL,
  RECIPE_SNS_REASONING_EFFORT,
  RECIPE_SNS_RULES_VERSION,
  RECIPE_SNS_PLATFORMS,
  isRecipeSnsImageMode,
  recipeSnsPlatformRules,
  validateRecipeSnsAiResult,
  type RecipeSnsGenerationView,
  type RecipeSnsImageVariant,
  type RecipeSnsPlatform,
} from "@/lib/recipe-sns";
import {
  chooseRecipeSnsSourceImage,
  chooseRecipeSnsVariation,
  fetchCompanyLpSummary,
  type RecipeSnsSourceImage,
} from "@/lib/recipe-sns-server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import type { CodexJobStatus } from "@/lib/web-sales-codex/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";
const ACTIVE_STATUSES: CodexJobStatus[] = ["queued", "running"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clip(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
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
    generationId: String(parameters.generationId || ""),
    imageMode: isRecipeSnsImageMode(parameters.imageMode) ? parameters.imageMode : "normal",
    model: String(parameters.model || RECIPE_SNS_MODEL),
    reasoningEffort: String(parameters.reasoningEffort || RECIPE_SNS_REASONING_EFFORT),
    rulesVersion: String(parameters.rulesVersion || RECIPE_SNS_RULES_VERSION),
    createdAt: String(job.created_at || ""),
    startedAt: job.started_at ? String(job.started_at) : null,
    updatedAt: job.updated_at ? String(job.updated_at) : null,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

function parseImageVariants(value: unknown) {
  const source = asObject(value);
  const result = {} as Record<RecipeSnsPlatform, RecipeSnsImageVariant>;
  for (const platform of RECIPE_SNS_PLATFORMS) {
    const variant = asObject(source[platform.id]);
    const url = String(variant.url || "").trim();
    if (!url) continue;
    const layoutMode = new Set(["smart-crop", "subject-preserve", "normal-resize", "creative", "arrange"])
      .has(String(variant.layoutMode || ""))
      ? variant.layoutMode as RecipeSnsImageVariant["layoutMode"]
      : "normal-resize";
    result[platform.id] = {
      url,
      width: Number(variant.width) || platform.width,
      height: Number(variant.height) || platform.height,
      aspectLabel: String(variant.aspectLabel || platform.aspectLabel),
      layoutMode,
    };
  }
  return result;
}

function toGenerationView(
  row: Record<string, unknown>,
  jobStatus?: string,
): RecipeSnsGenerationView {
  const rawPosts = row.posts;
  const sourceSnapshot = asObject(row.source_snapshot);
  const storedStatus = String(row.status || "pending") as RecipeSnsGenerationView["status"];
  const status = storedStatus === "pending" && ["waiting_for_user", "needs_review", "failed", "cancelled"].includes(jobStatus || "")
    ? "failed"
    : storedStatus;
  return {
    id: String(row.id || ""),
    jobId: String(row.job_id || ""),
    status,
    sourceImageId: row.source_image_id ? String(row.source_image_id) : null,
    sourceImageUrl: String(row.source_image_url || ""),
    sourceImageRole: String(row.source_image_role || "gallery") as "portrait" | "gallery",
    imageMode: isRecipeSnsImageMode(sourceSnapshot.imageMode) ? sourceSnapshot.imageMode : "normal",
    variationKey: String(row.variation_key || ""),
    imageVariants: parseImageVariants(row.image_variants),
    posts: rawPosts && typeof rawPosts === "object" ? validateRecipeSnsAiResult(rawPosts) : null,
    model: String(row.model || RECIPE_SNS_MODEL),
    reasoningEffort: String(row.reasoning_effort || RECIPE_SNS_REASONING_EFFORT),
    rulesVersion: String(row.rules_version || RECIPE_SNS_RULES_VERSION),
    createdAt: String(row.created_at || ""),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

const JOB_SELECT = "id,status,progress,current_step,error_message,parameters,result,created_at,started_at,updated_at,completed_at";
const GENERATION_SELECT = "id,job_id,status,source_image_id,source_image_url,source_image_role,variation_key,image_variants,source_snapshot,posts,model,reasoning_effort,rules_version,created_at,completed_at";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  try {
    const { id: recipeId } = await params;
    const requestedJobId = new URL(request.url).searchParams.get("jobId")?.trim();
    const supabase = getWebSalesAutomationServiceClient();
    let jobQuery = supabase
      .from("web_sales_codex_jobs")
      .select(JOB_SELECT)
      .eq("task_key", "recipe_sns_generate")
      .contains("parameters", { recipeId });
    if (requestedJobId) jobQuery = jobQuery.eq("id", requestedJobId);
    const [{ data: jobs, error: jobsError }, { data: rows, error: generationsError }] = await Promise.all([
      jobQuery.order("created_at", { ascending: false }).limit(requestedJobId ? 1 : 30),
      supabase
        .from("recipe_sns_generations")
        .select(GENERATION_SELECT)
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (jobsError) throw jobsError;
    if (generationsError) throw generationsError;
    const filteredJobs = (jobs || []).filter((row) => String(asObject(row.parameters).recipeId || "") === recipeId);
    const active = filteredJobs.find((row) => ACTIVE_STATUSES.includes(String(row.status) as CodexJobStatus));
    const selected = requestedJobId ? filteredJobs[0] : active || filteredJobs[0];
    const jobStatuses = new Map(filteredJobs.map((row) => [String(row.id), String(row.status)]));
    return NextResponse.json({
      ok: true,
      job: selected ? toJobView(selected as Record<string, unknown>) : null,
      generations: (rows || []).map((row) => toGenerationView(
        row as Record<string, unknown>,
        jobStatuses.get(String(row.job_id)),
      )),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SNS生成履歴を確認できません",
    }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });

  const requestBody = asObject(await request.json().catch(() => null));
  const imageMode = String(requestBody.imageMode || "").trim();
  if (!isRecipeSnsImageMode(imageMode)) {
    return NextResponse.json({ error: "SNS画像生成モードを選択してください" }, { status: 400 });
  }

  const supabase = getWebSalesAutomationServiceClient();
  let createdJobId: string | null = null;
  try {
    const { id: recipeId } = await params;
    const [recipeResult, imageResult, latestGenerationResult, activeResult] = await Promise.all([
      supabase
        .from("recipes")
        .select("id,name,category,series,ec_product_name,ec_product_names_by_site,catchcopy,ec_catchcopies_by_site,product_points,web_description,product_lp_url,ingredient_label,filling_quantity,filling_quantity_unit,storage_method,shelf_life,jan_code,product_code")
        .eq("id", recipeId)
        .single(),
      supabase
        .from("recipe_web_images")
        .select("id,image_url,image_role,sort_order,created_at")
        .eq("recipe_id", recipeId)
        .in("image_role", ["portrait", "gallery"]),
      supabase
        .from("recipe_sns_generations")
        .select("source_image_id,variation_key")
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("web_sales_codex_jobs")
        .select(JOB_SELECT)
        .eq("task_key", "recipe_sns_generate")
        .contains("parameters", { recipeId })
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (recipeResult.error || !recipeResult.data) throw new Error("レシピが見つかりません");
    if (imageResult.error) throw imageResult.error;
    if (latestGenerationResult.error) throw latestGenerationResult.error;
    if (activeResult.error) throw activeResult.error;
    if (activeResult.data?.[0]) {
      return NextResponse.json({
        ok: true,
        reused: true,
        job: toJobView(activeResult.data[0] as Record<string, unknown>),
      });
    }

    const sourceImage = chooseRecipeSnsSourceImage(
      (imageResult.data || []) as RecipeSnsSourceImage[],
      latestGenerationResult.data?.source_image_id,
    );
    if (!sourceImage) {
      return NextResponse.json({ error: "SNS用の画像がありません。EC情報でポートレート画像またはWeb商品画像を登録してください" }, { status: 400 });
    }
    const variationKey = chooseRecipeSnsVariation(latestGenerationResult.data?.variation_key);
    const recipe = recipeResult.data;
    const lpSummary = await fetchCompanyLpSummary(recipe.product_lp_url);
    const generationId = randomUUID();
    const sourceSnapshot = {
      recipeId: recipe.id,
      recipeName: clip(recipe.name, 300),
      category: clip(recipe.category, 100),
      series: clip(recipe.series, 120),
      currentProductName: clip(recipe.ec_product_name, 120),
      currentProductNames: recipe.ec_product_names_by_site || {},
      currentCatchcopy: clip(recipe.catchcopy, 120),
      currentCatchcopies: recipe.ec_catchcopies_by_site || {},
      productPoints: clip(recipe.product_points, 8_000),
      webDescription: clip(recipe.web_description, 12_000),
      ingredientLabel: clip(recipe.ingredient_label, 4_000),
      fillingQuantity: recipe.filling_quantity,
      fillingQuantityUnit: clip(recipe.filling_quantity_unit, 30),
      storageMethod: clip(recipe.storage_method, 100),
      shelfLife: clip(recipe.shelf_life, 100),
      janCode: clip(recipe.jan_code, 32),
      productCode: clip(recipe.product_code, 100),
      productLp: lpSummary,
      sourceImage: { id: sourceImage.id, role: sourceImage.image_role },
      imageMode,
      variationKey,
    };
    const now = new Date().toISOString();
    const parameters = {
      taskKey: "recipe_sns_generate",
      recipeId,
      recipeName: clip(recipe.name, 300),
      generationId,
      imageMode,
      sourceImageUrl: sourceImage.image_url,
      sourceSnapshot,
      platformRules: recipeSnsPlatformRules(),
      model: RECIPE_SNS_MODEL,
      reasoningEffort: RECIPE_SNS_REASONING_EFFORT,
      rulesVersion: RECIPE_SNS_RULES_VERSION,
      executionPolicy: "one_image_compact_packet_then_fresh_skill_session",
      mutationScope: "recipe_sns_generation_only",
    };
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: "recipe_sns_generate",
        channel: null,
        trigger_type: "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: `${imageMode === "creative" ? "クリエイティブ" : imageMode === "arrange" ? "アレンジ" : "通常リサイズ"}の生成待ち`,
        requested_by: session.user?.email || ADMIN_EMAIL,
        parameters,
        priority: 35,
        max_attempts: 1,
        scheduled_at: now,
      })
      .select(JOB_SELECT)
      .single();
    if (jobError || !job) throw jobError || new Error("SNS生成タスクを登録できません");
    createdJobId = job.id;
    const { error: generationError } = await supabase.from("recipe_sns_generations").insert({
      id: generationId,
      job_id: job.id,
      recipe_id: recipeId,
      status: "pending",
      source_image_id: sourceImage.id,
      source_image_url: sourceImage.image_url,
      source_image_role: sourceImage.image_role,
      variation_key: variationKey,
      image_variants: {},
      source_snapshot: sourceSnapshot,
      posts: null,
      model: RECIPE_SNS_MODEL,
      reasoning_effort: RECIPE_SNS_REASONING_EFFORT,
      rules_version: RECIPE_SNS_RULES_VERSION,
      created_by: session.user?.email || ADMIN_EMAIL,
    });
    if (generationError) throw generationError;
    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: "queued",
      message: "専用Skillによる媒体別SNS素材生成を登録しました",
      progress: 0,
      payload: {
        recipeId,
        generationId,
        imageMode,
        sourceImageRole: sourceImage.image_role,
        model: RECIPE_SNS_MODEL,
        rulesVersion: RECIPE_SNS_RULES_VERSION,
      },
    });
    return NextResponse.json({ ok: true, reused: false, job: toJobView(job as Record<string, unknown>) });
  } catch (error) {
    if (createdJobId) {
      try {
        await supabase.from("web_sales_codex_jobs").delete().eq("id", createdJobId);
      } catch {
        // The failed job is harmless; the active-job index prevents duplicate execution.
      }
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SNS生成を開始できません",
    }, { status: 500 });
  }
}
