import { createHash, randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  recipeSnsDestinationUrlFromSnapshot,
  validateRecipeSnsAiResult,
  type RecipeSnsPlatform,
} from "@/lib/recipe-sns";
import {
  RECIPE_SNS_PUBLISH_MODEL,
  RECIPE_SNS_PUBLISH_PROTOCOL_VERSION,
  RECIPE_SNS_PUBLISH_REASONING_EFFORT,
  RECIPE_SNS_PUBLISH_RULES_VERSION,
  buildRecipeSnsPublishSnapshot,
  normalizeRecipeSnsPublishPosts,
  normalizeRecipeSnsPublishTargets,
  validateRecipeSnsPublishResult,
  type RecipeSnsPublicationView,
} from "@/lib/recipe-sns-publish";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";
const MAX_SCHEDULE_DAYS = 180;
const PUBLICATION_SELECT = "id,job_id,generation_id,status,targets,scheduled_at,platform_results,error_message,created_at,started_at,completed_at";
const JOB_SELECT = "id,status,progress,current_step,error_message,started_at,completed_at,updated_at";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function compact(value: unknown, max = 1_000) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

function parseSchedule(value: unknown) {
  const requested = String(value ?? "").trim();
  const now = Date.now();
  if (!requested) return new Date(now).toISOString();
  const timestamp = Date.parse(requested);
  if (!Number.isFinite(timestamp)) throw new Error("予約日時が正しくありません");
  if (timestamp < now - 60_000) throw new Error("過去の日時には予約できません");
  if (timestamp > now + MAX_SCHEDULE_DAYS * 86_400_000) {
    throw new Error(`予約できるのは${MAX_SCHEDULE_DAYS}日先までです`);
  }
  return new Date(timestamp).toISOString();
}

function publicationStatus(publication: Record<string, unknown>, job: Record<string, unknown> | undefined) {
  const stored = String(publication.status || "queued") as RecipeSnsPublicationView["status"];
  const jobStatus = String(job?.status || "");
  if (jobStatus === "running") return "running";
  if (jobStatus === "queued") {
    return Date.parse(String(publication.scheduled_at || "")) > Date.now() + 30_000 ? "scheduled" : "queued";
  }
  if (["waiting_for_user", "needs_review", "failed", "cancelled"].includes(jobStatus)) {
    return jobStatus as RecipeSnsPublicationView["status"];
  }
  return stored;
}

function toPublicationView(
  publication: Record<string, unknown>,
  job: Record<string, unknown> | undefined,
): RecipeSnsPublicationView {
  const targets = normalizeRecipeSnsPublishTargets(publication.targets);
  let platformResults: RecipeSnsPublicationView["platformResults"] = [];
  const rawResults = Array.isArray(publication.platform_results) ? publication.platform_results : [];
  if (rawResults.length === targets.length && targets.length > 0) {
    try {
      platformResults = validateRecipeSnsPublishResult({
        status: rawResults.every((entry) => ["published", "already_published"].includes(String(asObject(entry).status || "")))
          ? "completed"
          : rawResults.some((entry) => ["published", "already_published"].includes(String(asObject(entry).status || "")))
            ? "needs_review"
            : rawResults.some((entry) => String(asObject(entry).status || "") === "blocked")
              ? "waiting_for_user"
              : "needs_review",
        publication_id: publication.id,
        platforms: rawResults,
        summary: "保存済みSNS投稿結果",
      }, {
        publicationId: String(publication.id || ""),
        targets,
      }).platforms;
    } catch {
      platformResults = [];
    }
  }
  return {
    id: String(publication.id || ""),
    jobId: String(publication.job_id || ""),
    generationId: String(publication.generation_id || ""),
    status: publicationStatus(publication, job),
    targets,
    scheduledAt: String(publication.scheduled_at || ""),
    progress: Math.max(0, Math.min(100, Number(job?.progress) || 0)),
    currentStep: String(job?.current_step || (publicationStatus(publication, job) === "scheduled" ? "予約時刻を待っています" : "投稿待ち")),
    errorMessage: compact(job?.error_message || publication.error_message, 4_000),
    platformResults,
    createdAt: String(publication.created_at || ""),
    startedAt: job?.started_at ? String(job.started_at) : publication.started_at ? String(publication.started_at) : null,
    completedAt: job?.completed_at ? String(job.completed_at) : publication.completed_at ? String(publication.completed_at) : null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  try {
    const { id: recipeId } = await params;
    if (!isUuid(recipeId)) return NextResponse.json({ error: "レシピIDが正しくありません" }, { status: 400 });
    const supabase = getWebSalesAutomationServiceClient();
    const { data: publications, error: publicationError } = await supabase
      .from("recipe_sns_publications")
      .select(PUBLICATION_SELECT)
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (publicationError) throw publicationError;
    const jobIds = (publications || []).map((row) => String(row.job_id)).filter(Boolean);
    const { data: jobs, error: jobError } = jobIds.length
      ? await supabase.from("web_sales_codex_jobs").select(JOB_SELECT).in("id", jobIds)
      : { data: [], error: null };
    if (jobError) throw jobError;
    const jobsById = new Map((jobs || []).map((job) => [String(job.id), job as Record<string, unknown>]));
    return NextResponse.json({
      ok: true,
      publications: (publications || []).map((publication) => toPublicationView(
        publication as Record<string, unknown>,
        jobsById.get(String(publication.job_id)),
      )),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SNS投稿履歴を確認できません",
    }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  try {
    const { id: recipeId } = await params;
    const body = asObject(await request.json().catch(() => null));
    const generationId = String(body.generationId || "").trim();
    const rawTargets = Array.isArray(body.targets) ? body.targets.map(String) : [];
    const targets = normalizeRecipeSnsPublishTargets(rawTargets);
    if (!isUuid(recipeId) || !isUuid(generationId)) throw new Error("投稿対象のレシピまたは生成履歴が正しくありません");
    if (targets.length === 0) throw new Error("投稿先SNSを選択してください");
    if (rawTargets.length !== targets.length || new Set(rawTargets).size !== rawTargets.length) {
      throw new Error("投稿先SNSの指定が正しくありません");
    }
    const scheduledAt = parseSchedule(body.scheduledAt);
    if (body.cleanupMalformedOwnAttemptAuthorized !== true) {
      throw new Error("不完全投稿の自動削除を含む実行確認が必要です");
    }
    const requestedBy = session.user?.email || ADMIN_EMAIL;
    const authorizedAt = new Date().toISOString();
    const supabase = getWebSalesAutomationServiceClient();
    const [{ data: recipe, error: recipeError }, { data: generation, error: generationError }] = await Promise.all([
      supabase.from("recipes").select("id,name").eq("id", recipeId).single(),
      supabase
        .from("recipe_sns_generations")
        .select("id,recipe_id,status,image_variants,source_snapshot,posts")
        .eq("id", generationId)
        .eq("recipe_id", recipeId)
        .eq("status", "completed")
        .single(),
    ]);
    if (recipeError || !recipe) throw new Error("レシピが見つかりません");
    if (generationError || !generation) throw new Error("完了済みSNS素材が見つかりません");
    const storedPosts = validateRecipeSnsAiResult(generation.posts);
    const sourceSnapshot = asObject(generation.source_snapshot);
    const destinationUrl = recipeSnsDestinationUrlFromSnapshot(sourceSnapshot);
    const posts = normalizeRecipeSnsPublishPosts(body.posts || storedPosts.posts, targets, destinationUrl);
    const rawVariants = asObject(generation.image_variants);
    const imageUrls = Object.fromEntries(targets.map((target) => [
      target,
      String(asObject(rawVariants[target]).url || "").trim(),
    ])) as Partial<Record<RecipeSnsPlatform, string>>;
    const publicationId = randomUUID();
    const snapshot = buildRecipeSnsPublishSnapshot({
      publicationId,
      recipeId,
      generationId,
      recipeName: String(recipe.name || ""),
      targets,
      scheduledAt,
      requestedBy,
      authorizedAt,
      cleanupMalformedOwnAttemptAuthorized: true,
      imageUrls,
      posts,
    });
    const immediateBucket = Math.floor(Date.now() / 120_000);
    const scheduleIdentity = Date.parse(scheduledAt) > Date.now() + 30_000 ? scheduledAt : `immediate:${immediateBucket}`;
    const idempotencyKey = createHash("sha256").update(JSON.stringify({
      recipeId,
      generationId,
      targets,
      scheduleIdentity,
      platforms: snapshot.platforms,
    })).digest("hex");
    const jobParameters = {
      taskKey: "recipe_sns_publish",
      protocolVersion: RECIPE_SNS_PUBLISH_PROTOCOL_VERSION,
      publicationId,
      recipeId,
      generationId,
      targets,
      scheduledAt,
      snapshot,
      model: RECIPE_SNS_PUBLISH_MODEL,
      reasoningEffort: RECIPE_SNS_PUBLISH_REASONING_EFFORT,
      rulesVersion: RECIPE_SNS_PUBLISH_RULES_VERSION,
      executionPolicy: "one_fresh_skill_session_adaptive_official_ui_one_platform_at_a_time",
      mutationScope: "authorized_social_posts_only",
    };
    const { data, error } = await supabase.rpc("enqueue_recipe_sns_publication", {
      p_publication_id: publicationId,
      p_recipe_id: recipeId,
      p_generation_id: generationId,
      p_targets: targets,
      p_scheduled_at: scheduledAt,
      p_payload: snapshot,
      p_idempotency_key: idempotencyKey,
      p_requested_by: requestedBy,
      p_job_parameters: jobParameters,
    });
    if (error) throw error;
    const queued = Array.isArray(data) ? data[0] : data;
    if (!queued?.publication_id || !queued?.job_id) throw new Error("SNS投稿を登録できませんでした");
    return NextResponse.json({
      ok: true,
      publicationId: queued.publication_id,
      jobId: queued.job_id,
      reused: queued.reused === true,
      scheduledAt,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SNS投稿を登録できません",
    }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  try {
    const { id: recipeId } = await params;
    const body = asObject(await request.json().catch(() => null));
    const publicationId = String(body.publicationId || "").trim();
    if (!isUuid(recipeId) || !isUuid(publicationId)) throw new Error("取消対象が正しくありません");
    const supabase = getWebSalesAutomationServiceClient();
    const { data: cancelled, error } = await supabase.rpc("cancel_recipe_sns_publication", {
      p_publication_id: publicationId,
      p_recipe_id: recipeId,
      p_cancelled_by: session.user?.email || ADMIN_EMAIL,
    });
    if (error) throw error;
    if (!cancelled) return NextResponse.json({ error: "実行開始後の投稿は取り消せません" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SNS投稿予約を取り消せません",
    }, { status: 400 });
  }
}
