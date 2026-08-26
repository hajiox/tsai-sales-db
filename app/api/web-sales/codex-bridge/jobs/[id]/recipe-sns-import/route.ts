import { NextResponse } from "next/server";
import {
  RECIPE_SNS_MODEL,
  RECIPE_SNS_PLATFORMS,
  RECIPE_SNS_REASONING_EFFORT,
  RECIPE_SNS_RULES_VERSION,
  isRecipeSnsImageMode,
  isRecipeSnsPlatform,
  mergeRecipeSnsTargetResult,
  validateRecipeSnsAiResult,
  validateRecipeSnsBridgeResult,
  validateRecipeSnsTargetBridgeResult,
  type RecipeSnsAiResult,
  type RecipeSnsBridgeResult,
  type RecipeSnsTargetBridgeResult,
  type RecipeSnsPlatform,
} from "@/lib/recipe-sns";
import {
  deleteRecipeSnsImages,
  publishRecipeSnsImageVariants,
} from "@/lib/recipe-sns-server";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uuid(value: unknown) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let publishedUrls: string[] = [];
  try {
    const { id } = await params;
    const body = asObject(await request.json());
    const workerId = normalizeWorkerId(body.workerId);
    const model = String(body.model || "").trim();
    const reasoningEffort = String(body.reasoningEffort || "").trim();
    const rulesVersion = String(body.rulesVersion || "").trim();
    const requestedMode = String(body.imageMode || "").trim();
    if (model !== RECIPE_SNS_MODEL
      || reasoningEffort !== RECIPE_SNS_REASONING_EFFORT
      || rulesVersion !== RECIPE_SNS_RULES_VERSION
      || !isRecipeSnsImageMode(requestedMode)) {
      return NextResponse.json({ error: "SNS生成モデル、画像モード、またはルール版が依頼内容と一致しません" }, { status: 409 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,requested_by,parameters")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "recipe_sns_generate") {
      return NextResponse.json({ error: "SNS素材生成タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }

    const parameters = asObject(job.parameters);
    const sourceSnapshot = asObject(parameters.sourceSnapshot);
    const targetPlatform = isRecipeSnsPlatform(parameters.targetPlatform) ? parameters.targetPlatform : null;
    const bodyTargetPlatform = isRecipeSnsPlatform(body.targetPlatform) ? body.targetPlatform : null;
    if (String(parameters.model || "") !== model
      || String(parameters.reasoningEffort || "") !== reasoningEffort
      || String(parameters.rulesVersion || "") !== rulesVersion
      || String(parameters.imageMode || "") !== requestedMode
      || targetPlatform !== bodyTargetPlatform
      || JSON.stringify(parameters.sourceSnapshot) !== JSON.stringify(body.sourceSnapshot)) {
      return NextResponse.json({ error: "SNS生成元の商品情報が依頼時点と一致しません" }, { status: 409 });
    }
    const result = targetPlatform
      ? validateRecipeSnsTargetBridgeResult(body.data, requestedMode, targetPlatform)
      : validateRecipeSnsBridgeResult(body.data, requestedMode);
    if (result.variation_key !== String(sourceSnapshot.variationKey || "")) {
      return NextResponse.json({ error: "SNS投稿の訴求軸が依頼内容と一致しません" }, { status: 409 });
    }
    const generationId = uuid(parameters.generationId);
    if (!generationId) return NextResponse.json({ error: "SNS生成履歴IDが不正です" }, { status: 409 });

    const { data: generation, error: generationError } = await supabase
      .from("recipe_sns_generations")
      .select("id,recipe_id,status,image_variants,posts,created_at,completed_at")
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

    let baseGeneration: Record<string, unknown> | null = null;
    if (targetPlatform) {
      const baseGenerationId = uuid(parameters.baseGenerationId);
      if (!baseGenerationId) {
        return NextResponse.json({ error: "個別再生成の基準履歴IDが不正です" }, { status: 409 });
      }
      const { data, error } = await supabase
        .from("recipe_sns_generations")
        .select("id,recipe_id,status,image_variants,posts")
        .eq("id", baseGenerationId)
        .eq("recipe_id", generation.recipe_id)
        .eq("status", "completed")
        .single();
      if (error || !data?.posts) {
        return NextResponse.json({ error: "個別再生成の基準履歴を確認できません" }, { status: 409 });
      }
      const baseVariants = asObject(data.image_variants);
      if (RECIPE_SNS_PLATFORMS.some((platform) => !String(asObject(baseVariants[platform.id]).url || "").trim())) {
        return NextResponse.json({ error: "個別再生成の基準履歴に4媒体の画像が揃っていません" }, { status: 409 });
      }
      baseGeneration = data as Record<string, unknown>;
    }

    const artifactIds = asObject(body.imageArtifactIds);
    const requestedPlatforms = targetPlatform
      ? RECIPE_SNS_PLATFORMS.filter((platform) => platform.id === targetPlatform)
      : [...RECIPE_SNS_PLATFORMS];
    const requestedArtifacts = requestedPlatforms.map((platform) => ({
      platform,
      artifactId: uuid(artifactIds[platform.id]),
    }));
    if (requestedArtifacts.some((entry) => !entry.artifactId)) {
      return NextResponse.json({ error: `${requestedPlatforms.length}媒体分のSNS画像artifactが揃っていません` }, { status: 409 });
    }
    const uniqueArtifactIds = [...new Set(requestedArtifacts.map((entry) => entry.artifactId))];
    const expectedArtifactCount = requestedMode === "normal" ? 1 : requestedPlatforms.length;
    if (uniqueArtifactIds.length !== expectedArtifactCount) {
      return NextResponse.json({ error: "SNS画像artifactの媒体対応が正しくありません" }, { status: 409 });
    }
    const { data: artifacts, error: artifactError } = await supabase
      .from("web_sales_codex_artifacts")
      .select("id,artifact_type,file_name,storage_path,content_type,byte_size")
      .eq("job_id", id)
      .eq("artifact_type", "screenshot")
      .in("id", uniqueArtifactIds);
    if (artifactError) throw artifactError;
    if ((artifacts || []).length !== expectedArtifactCount) {
      return NextResponse.json({ error: "このジョブのSNS画像artifactを確認できません" }, { status: 409 });
    }

    const artifactMap = new Map((artifacts || []).map((artifact) => [String(artifact.id), artifact]));
    const downloadedBuffers = new Map<string, Buffer>();
    const sourceBuffers: Partial<Record<RecipeSnsPlatform, Buffer>> = {};
    for (const entry of requestedArtifacts) {
      const artifact = artifactMap.get(entry.artifactId);
      const fileName = String(artifact?.file_name || "").toLowerCase();
      const supportedContentType = new Set(["image/jpeg", "image/png", "image/webp"])
        .has(String(artifact?.content_type || "").toLowerCase());
      const expectedName = requestedMode === "normal"
        ? /^source-image\.(?:jpe?g|png|webp)$/.test(fileName)
        : requestedMode === "creative"
          ? fileName === `final-${entry.platform.id}.jpg`
          : new RegExp(`^input-${entry.platform.id}\\.(?:jpe?g|png|webp)$`).test(fileName);
      if (!artifact
        || !expectedName
        || !supportedContentType
        || Number(artifact.byte_size) <= 0
        || Number(artifact.byte_size) > 25 * 1024 * 1024) {
        return NextResponse.json({ error: `${entry.platform.label}画像artifactの検証に失敗しました` }, { status: 409 });
      }
      let sourceBuffer = downloadedBuffers.get(entry.artifactId);
      if (!sourceBuffer) {
        const { data: imageBlob, error: downloadError } = await supabase.storage
          .from("web-sales-codex")
          .download(String(artifact.storage_path));
        if (downloadError || !imageBlob) throw downloadError || new Error(`${entry.platform.label}画像を取得できません`);
        sourceBuffer = Buffer.from(await imageBlob.arrayBuffer());
        downloadedBuffers.set(entry.artifactId, sourceBuffer);
      }
      sourceBuffers[entry.platform.id] = sourceBuffer;
    }

    const published = await publishRecipeSnsImageVariants(
      String(generation.recipe_id),
      generationId,
      requestedMode,
      sourceBuffers,
      requestedPlatforms.map((platform) => platform.id),
    );
    publishedUrls = published.uploadedUrls;
    let storedResult: RecipeSnsAiResult;
    let storedImageVariants: Record<string, unknown> = published.variants;
    if (targetPlatform) {
      const targetResult = result as RecipeSnsTargetBridgeResult;
      const baseResult = validateRecipeSnsAiResult(baseGeneration?.posts);
      storedResult = mergeRecipeSnsTargetResult(baseResult, targetResult);
      storedImageVariants = {
        ...asObject(baseGeneration?.image_variants),
        ...published.variants,
      };
    } else {
      const { generated_images: _localGeneratedImages, ...fullResult } = result as RecipeSnsBridgeResult;
      void _localGeneratedImages;
      storedResult = fullResult;
    }
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("recipe_sns_generations")
      .update({
        status: "completed",
        image_variants: storedImageVariants,
        posts: storedResult,
        completed_at: now,
        error_message: null,
      })
      .eq("id", generationId)
      .eq("job_id", id)
      .eq("status", "pending");
    if (updateError) throw updateError;
    publishedUrls = [];
    return NextResponse.json({
      ok: true,
      reused: false,
      generationId,
      createdAt: generation.created_at,
      completedAt: now,
      imageVariants: storedImageVariants,
      model,
      reasoningEffort,
      rulesVersion,
      ...storedResult,
    });
  } catch (error) {
    await deleteRecipeSnsImages(publishedUrls);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SNS素材を保存できません",
    }, { status: 500 });
  }
}
