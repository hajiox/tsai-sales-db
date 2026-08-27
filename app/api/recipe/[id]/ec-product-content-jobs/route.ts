import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  EC_PRODUCT_CONTENT_MAX_CHARACTERS,
  buildEcProductContents,
  ecProductContentCharacterCount,
  ecProductContentJobViewFromRow,
  ecProductContentValuesEqual,
  normalizeEcProductContentTargets,
} from "@/lib/ec-product-content-codex";
import {
  buildEcProductContentRecipeSnapshot,
  ecProductContentSnapshotsMatch,
  ecProductContentTargetMapsMatch,
} from "@/lib/ec-product-content-job-server";
import { loadEcPriceProductMappings } from "@/lib/ec-price-product-mappings";
import { getEcPriceVerifiedIdentifiers } from "@/lib/ec-price-verified-registry";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";
const ACTIVE_STATUSES = ["queued", "running"];
const FINAL_RETRY_STATUSES = new Set(["waiting_for_user", "needs_review", "failed", "completed"]);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const { id: recipeId } = await params;
    const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
    const supabase = getWebSalesAutomationServiceClient();
    let query = supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,progress,current_step,error_message,parameters,result,started_at,updated_at,created_at,completed_at")
      .eq("task_key", "ec_product_content_update");
    query = jobId ? query.eq("id", jobId) : query.contains("parameters", { recipeId });
    const { data, error } = await query.order("created_at", { ascending: false }).limit(jobId ? 1 : 50);
    if (error) throw error;
    const jobs = (data || []).filter((row) => String(asObject(row.parameters).recipeId || "") === recipeId);
    if (jobId) {
      const job = ecProductContentJobViewFromRow(jobs[0]);
      if (!job) return NextResponse.json({ error: "商品文章反映タスクが見つかりません" }, { status: 404 });
      return NextResponse.json({ ok: true, job });
    }
    const views = jobs.flatMap((row) => {
      const view = ecProductContentJobViewFromRow(row);
      return view ? [view] : [];
    });
    const active = views.find((job) => ACTIVE_STATUSES.includes(job.status));
    return NextResponse.json({
      ok: true,
      activeJob: active || null,
      latestJob: views[0] || null,
      history: views.filter((job) => job.sites.length > 0),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "商品文章反映履歴を確認できません" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const { id: recipeId } = await params;
    const body = asObject(await request.json());
    const retryFromId = String(body.retryUnfinishedFromJobId || "").trim();
    const rawTargets = Array.isArray(body.targets) ? body.targets : [];
    let targets = normalizeEcProductContentTargets(rawTargets);
    if (!retryFromId && (targets.length === 0 || targets.length !== rawTargets.length)) {
      return NextResponse.json({ error: "反映先ECを選択してください" }, { status: 400 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,product_points,web_description,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });
    if (recipe.is_intermediate) return NextResponse.json({ error: "中間加工品はEC商品文章反映の対象外です" }, { status: 400 });

    const recipeSnapshot = buildEcProductContentRecipeSnapshot(recipe as Record<string, unknown>);
    const totalCharacters = ecProductContentCharacterCount(recipeSnapshot.productPoints, recipeSnapshot.webDescription);
    if (!recipeSnapshot.productPoints && !recipeSnapshot.webDescription) {
      return NextResponse.json({ error: "商品ポイントまたはWeb商品説明を保存してください" }, { status: 400 });
    }
    if (totalCharacters > EC_PRODUCT_CONTENT_MAX_CHARACTERS) {
      return NextResponse.json({ error: "商品ポイントとWeb商品説明を合計500文字以内へ調整して保存してください" }, { status: 400 });
    }
    if (!ecProductContentSnapshotsMatch(body.expectedRecipeSnapshot, recipeSnapshot)) {
      return NextResponse.json({ error: "確認後に商品文章または商品情報が変わりました。再読込してください" }, { status: 409 });
    }

    if (retryFromId) {
      const { data: source, error } = await supabase
        .from("web_sales_codex_jobs")
        .select("id,status,parameters,result")
        .eq("id", retryFromId)
        .eq("task_key", "ec_product_content_update")
        .maybeSingle();
      if (error) throw error;
      const sourceParameters = asObject(source?.parameters);
      const sourceResult = asObject(source?.result);
      const sourceTargets = normalizeEcProductContentTargets(sourceParameters.targets);
      const expectedTargetContents = buildEcProductContents(sourceTargets, recipeSnapshot.productPoints, recipeSnapshot.webDescription);
      if (!source
        || String(sourceParameters.recipeId || "") !== recipeId
        || !FINAL_RETRY_STATUSES.has(String(source.status || ""))
        || !ecProductContentSnapshotsMatch(sourceParameters.recipeSnapshot, recipeSnapshot)
        || !ecProductContentTargetMapsMatch(sourceParameters.targetContents, expectedTargetContents, sourceTargets)) {
        return NextResponse.json({ error: "再実行元の商品文章が現在の保存内容と一致しません" }, { status: 409 });
      }
      const sourceSites = Array.isArray(sourceResult.sites) ? sourceResult.sites.map(asObject) : [];
      targets = sourceTargets.filter((target) => {
        const site = sourceSites.find((entry) => entry.site === target);
        return !site || site.status === "blocked" || site.status === "submitted_pending";
      });
      if (targets.length === 0) return NextResponse.json({ error: "再実行が必要なECはありません" }, { status: 409 });
    }

    const targetContents = buildEcProductContents(targets, recipeSnapshot.productPoints, recipeSnapshot.webDescription);
    const expectedContents = asObject(body.expectedTargetContents);
    if (!retryFromId && !targets.every((target) => ecProductContentValuesEqual(expectedContents[target], targetContents[target]))) {
      return NextResponse.json({ error: "画面で確認した媒体別文章が現在の保存内容と一致しません" }, { status: 409 });
    }

    const { data: activeRows, error: activeError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id")
      .eq("task_key", "ec_product_content_update")
      .contains("parameters", { recipeId })
      .in("status", ACTIVE_STATUSES)
      .limit(1);
    if (activeError) throw activeError;
    if (activeRows?.[0]) return NextResponse.json({ error: "この商品の文章反映がすでに実行中です" }, { status: 409 });

    const productMappings = await loadEcPriceProductMappings(supabase, recipeSnapshot.linkedProductId, targets);
    const verifiedProductIdentifiers = getEcPriceVerifiedIdentifiers(recipeSnapshot.janCode, targets);
    const now = new Date().toISOString();
    const parameters = {
      taskKey: "ec_product_content_update",
      targets,
      ...recipeSnapshot,
      recipeSnapshot,
      targetContents,
      totalCharacters,
      productMappings,
      verifiedProductIdentifiers,
      retryUnfinishedFromJobId: retryFromId || null,
      executionPolicy: "signed_in_browser_isolated_codex",
      mutationScope: "product_points_and_description_only",
      operatorAuthorization: {
        executionAuthorized: true,
        source: "tsa_immediate_execution_confirmation",
        authorizedAt: now,
        authorizedBy: session.user?.email || ADMIN_EMAIL,
        recipeId,
        targets,
        targetContents,
      },
    };
    const { data: job, error: insertError } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: "ec_product_content_update",
        channel: null,
        trigger_type: retryFromId ? "retry" : "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: "事務所PCのEC商品文章反映開始待ち",
        parameters,
        requested_by: session.user?.email || ADMIN_EMAIL,
        priority: 50,
        max_attempts: 1,
        scheduled_at: now,
      })
      .select("id,task_key,status,progress,current_step,error_message,parameters,result,started_at,updated_at,created_at,completed_at")
      .single();
    if (insertError || !job) throw insertError || new Error("商品文章反映タスクを登録できません");
    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: "queued",
      message: "EC商品文章反映を実行待ちに登録しました",
      progress: 0,
      payload: { recipeId, targets, totalCharacters },
    });
    return NextResponse.json({ ok: true, job: ecProductContentJobViewFromRow(job) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "商品文章反映タスクを登録できません" }, { status: 500 });
  }
}
