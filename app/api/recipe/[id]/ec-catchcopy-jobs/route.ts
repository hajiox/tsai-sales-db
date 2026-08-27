import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  buildUnifiedEcCatchcopies,
  ecCatchcopyHistoryFromJobs,
  ecCatchcopyMapsEqual,
  normalizeEcCatchcopyTargets,
  type EcCatchcopiesBySite,
  type EcCatchcopyJobView,
} from "@/lib/ec-catchcopy-codex";
import {
  buildEcCatchcopyRecipeSnapshot,
  ecCatchcopyRecipeIdentitiesMatch,
  ecCatchcopySnapshotsMatch,
  normalizeFallbackCatchcopy,
  type EcCatchcopyRecipeSnapshot,
} from "@/lib/ec-catchcopy-job-server";
import { loadEcPriceProductMappings } from "@/lib/ec-price-product-mappings";
import { getEcPriceVerifiedIdentifiers } from "@/lib/ec-price-verified-registry";
import {
  EC_PRICE_RESERVATION_SCHEDULED_AT,
  isReservedEcPriceJob,
  normalizeEcPriceDispatchMode,
  type EcPriceDispatchMode,
} from "@/lib/ec-price-reservations";

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
function sameTargets(left: unknown, right: string[]) {
  const normalized = normalizeEcCatchcopyTargets(left).sort();
  const expected = [...right].sort();
  return normalized.length === expected.length
    && normalized.every((target, index) => target === expected[index]);
}

function compactMessage(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-3).join(" / ").slice(0, 600);
}

function toJobView(job: Record<string, unknown>): EcCatchcopyJobView {
  const parameters = asObject(job.parameters);
  const result = asObject(job.result);
  return {
    id: String(job.id || ""),
    status: String(job.status) as EcCatchcopyJobView["status"],
    progress: Number(job.progress) || 0,
    currentStep: String(job.current_step || "実行待ち"),
    errorMessage: compactMessage(job.error_message),
    targets: normalizeEcCatchcopyTargets(parameters.targets),
    catchcopies: buildUnifiedEcCatchcopies(asObject(parameters.catchcopies).rakuten || asObject(parameters.catchcopies).yahoo),
    summary: compactMessage(result.summary),
    sites: (Array.isArray(result.sites) ? result.sites : []) as EcCatchcopyJobView["sites"],
    createdAt: String(job.created_at || ""),
    startedAt: job.started_at ? String(job.started_at) : null,
    heartbeatAt: job.heartbeat_at ? String(job.heartbeat_at) : null,
    updatedAt: job.updated_at ? String(job.updated_at) : null,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

function jobMatchesRequest(
  job: Record<string, unknown>,
  catchcopies: EcCatchcopiesBySite,
  targets: string[],
  recipeSnapshot: EcCatchcopyRecipeSnapshot,
) {
  const parameters = asObject(job.parameters);
  return ecCatchcopyMapsEqual(parameters.catchcopies, catchcopies)
    && sameTargets(parameters.targets, targets)
    && ecCatchcopySnapshotsMatch(parameters.recipeSnapshot, recipeSnapshot);
}

async function resolveExistingJob(input: {
  supabase: ReturnType<typeof getWebSalesAutomationServiceClient>;
  active: Record<string, unknown>;
  dispatchMode: EcPriceDispatchMode;
  catchcopies: EcCatchcopiesBySite;
  targets: string[];
  recipeSnapshot: EcCatchcopyRecipeSnapshot;
  authorizedBy: string;
}) {
  const { supabase, active, dispatchMode, catchcopies, targets, recipeSnapshot, authorizedBy } = input;
  if (!jobMatchesRequest(active, catchcopies, targets, recipeSnapshot)) {
    return NextResponse.json(
      { error: "この商品の別のキャッチコピー変更が実行中または予約済みです。完了または取消後に再実行してください" },
      { status: 409 },
    );
  }
  const activeParameters = asObject(active.parameters);
  const reserved = isReservedEcPriceJob(active.status, activeParameters);
  if (dispatchMode === "reserved") {
    if (!reserved) return NextResponse.json({ error: "このキャッチコピー変更はすでに実行待ちです" }, { status: 409 });
    return NextResponse.json({ ok: true, reused: true, reserved: true, job: toJobView(active) });
  }
  if (!reserved) return NextResponse.json({ ok: true, reused: true, reserved: false, job: toJobView(active) });

  const releasedAt = new Date().toISOString();
  const { data: promoted, error } = await supabase
    .from("web_sales_codex_jobs")
    .update({
      parameters: {
        ...activeParameters,
        dispatchMode: "immediate",
        releasedAt,
        operatorAuthorization: {
          executionAuthorized: true,
          source: "tsa_immediate_execution_confirmation",
          authorizedAt: releasedAt,
          authorizedBy,
          recipeId: String(activeParameters.recipeId || ""),
          targets,
          catchcopies,
        },
      },
      scheduled_at: releasedAt,
      current_step: "事務所PCのECキャッチコピー変更開始待ち",
      updated_at: releasedAt,
    })
    .eq("id", String(active.id))
    .eq("status", "queued")
    .contains("parameters", { dispatchMode: "reserved" })
    .select("id,status,progress,current_step,error_message,parameters,result,scheduled_at,created_at,completed_at")
    .maybeSingle();
  if (error) throw error;
  if (!promoted) return NextResponse.json({ error: "予約状態が変わりました。再読込してください" }, { status: 409 });
  return NextResponse.json({ ok: true, promoted: true, reserved: false, job: toJobView(promoted) });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const { id: recipeId } = await params;
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
  const supabase = getWebSalesAutomationServiceClient();
  let query = supabase
    .from("web_sales_codex_jobs")
    .select("id,task_key,status,progress,current_step,error_message,parameters,result,started_at,heartbeat_at,updated_at,created_at,completed_at")
    .eq("task_key", "ec_catchcopy_update");
  query = jobId ? query.eq("id", jobId) : query.contains("parameters", { recipeId });
  const { data, error } = await query.order("created_at", { ascending: false }).limit(jobId ? 1 : 50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const jobs = (data || []).filter((row) => String(asObject(row.parameters).recipeId || "") === recipeId);
  if (jobId) {
    if (!jobs[0]) return NextResponse.json({ error: "キャッチコピー変更タスクが見つかりません" }, { status: 404 });
    return NextResponse.json({ ok: true, job: toJobView(jobs[0] as Record<string, unknown>) });
  }
  const active = jobs.find((row) => ACTIVE_STATUSES.includes(String(row.status)));
  return NextResponse.json({
    ok: true,
    activeJob: active ? toJobView(active as Record<string, unknown>) : null,
    latestJob: jobs[0] ? toJobView(jobs[0] as Record<string, unknown>) : null,
    history: ecCatchcopyHistoryFromJobs(jobs),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const { id: recipeId } = await params;
    const body = await request.json();
    const retryFromId = String(body.retryUnfinishedFromJobId || "").trim();
    let requestedTargets = Array.isArray(body.targets) ? body.targets : [];
    let targets = normalizeEcCatchcopyTargets(body.targets);
    const dispatchMode = normalizeEcPriceDispatchMode(body.dispatchMode);
    if (!retryFromId && (targets.length === 0 || targets.length !== requestedTargets.length)) {
      return NextResponse.json({ error: "反映先ECを選択してください" }, { status: 400 });
    }
    if (retryFromId && dispatchMode !== "immediate") {
      return NextResponse.json({ error: "未完了だけの再実行は今すぐ実行してください" }, { status: 400 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,catchcopy,ec_catchcopies_by_site,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });
    if (recipe.is_intermediate) return NextResponse.json({ error: "中間加工品はECキャッチコピー反映の対象外です" }, { status: 400 });

    const recipeSnapshot = buildEcCatchcopyRecipeSnapshot(recipe as Record<string, unknown>);
    const catchcopies = buildUnifiedEcCatchcopies(recipeSnapshot.fallbackCatchcopy);
    if (targets.some((target) => !catchcopies[target])) {
      return NextResponse.json({ error: "選択したECのキャッチコピーを保存してください" }, { status: 400 });
    }
    if (normalizeFallbackCatchcopy(body.expectedCatchcopy) !== recipeSnapshot.fallbackCatchcopy
      || !ecCatchcopyMapsEqual(body.expectedCatchcopies, catchcopies, recipeSnapshot.fallbackCatchcopy)
      || !ecCatchcopySnapshotsMatch(body.expectedRecipeSnapshot, recipeSnapshot)) {
      return NextResponse.json(
        { error: "確認後にEC用キャッチコピーまたは商品情報が変わりました。再読込して確認し直してください" },
        { status: 409 },
      );
    }

    let inheritedBatchId: string | null = null;
    let inheritedRevisionId: string | null = null;
    if (retryFromId) {
      const { data: source, error } = await supabase
        .from("web_sales_codex_jobs")
        .select("id,status,parameters,result")
        .eq("id", retryFromId)
        .eq("task_key", "ec_catchcopy_update")
        .maybeSingle();
      if (error) throw error;
      const sourceParams = asObject(source?.parameters);
      const sourceResult = asObject(source?.result);
      if (!source
        || String(sourceParams.recipeId || "") !== recipeId
        || !FINAL_RETRY_STATUSES.has(String(source.status || ""))
        || !ecCatchcopyMapsEqual(sourceParams.catchcopies, catchcopies, recipeSnapshot.fallbackCatchcopy)
        || !ecCatchcopySnapshotsMatch(sourceParams.recipeSnapshot, recipeSnapshot)) {
        return NextResponse.json({ error: "再実行元のキャッチコピー・商品情報が現在のレシピと一致しません" }, { status: 409 });
      }
      const sourceSites = Array.isArray(sourceResult.sites) ? sourceResult.sites.map(asObject) : [];
      targets = normalizeEcCatchcopyTargets(sourceParams.targets).filter((target) => {
        const site = sourceSites.find((entry) => entry.site === target);
        return !site || site.status === "blocked" || site.status === "submitted_pending";
      });
      requestedTargets = [...targets];
      if (targets.length === 0) return NextResponse.json({ error: "再実行が必要なECはありません" }, { status: 409 });
      const batchId = String(sourceParams.batchId || "").trim();
      inheritedBatchId = /^[0-9a-f-]{36}$/i.test(batchId) ? batchId : null;
      inheritedRevisionId = String(sourceParams.catchcopyRevisionId || "").trim() || null;
    }

    const productMappings = await loadEcPriceProductMappings(supabase, recipeSnapshot.linkedProductId, targets);
    const verifiedProductIdentifiers = getEcPriceVerifiedIdentifiers(recipeSnapshot.janCode, targets);
    const { data: activeRows, error: activeError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,status,progress,current_step,error_message,parameters,result,scheduled_at,created_at,completed_at")
      .eq("task_key", "ec_catchcopy_update")
      .contains("parameters", { recipeId })
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    if (activeError) throw activeError;
    if (activeRows?.[0]) {
      return resolveExistingJob({
        supabase,
        active: activeRows[0] as Record<string, unknown>,
        dispatchMode,
        catchcopies,
        targets,
        recipeSnapshot,
        authorizedBy: session.user?.email || ADMIN_EMAIL,
      });
    }

    let revisionId = inheritedRevisionId;
    if (!revisionId) {
      const { data: revisionRows, error } = await supabase
        .from("recipe_ec_catchcopy_revisions")
        .select("id,new_catchcopies,recipe_snapshot,created_at")
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const revision = (revisionRows || []).find((row) =>
        ecCatchcopyMapsEqual(row.new_catchcopies, catchcopies, recipeSnapshot.fallbackCatchcopy)
        && ecCatchcopyRecipeIdentitiesMatch(row.recipe_snapshot, recipeSnapshot));
      revisionId = revision?.id || null;
      if (!revisionId) {
        const { data: inserted, error: insertRevisionError } = await supabase
          .from("recipe_ec_catchcopy_revisions")
          .insert({
            recipe_id: recipeId,
            previous_catchcopies: catchcopies,
            new_catchcopies: catchcopies,
            recipe_snapshot: recipeSnapshot,
          })
          .select("id")
          .single();
        if (insertRevisionError || !inserted) throw insertRevisionError || new Error("キャッチコピー履歴を作成できません");
        revisionId = inserted.id;
      }
    }

    const now = new Date().toISOString();
    const reserved = dispatchMode === "reserved";
    const parameters = {
      taskKey: "ec_catchcopy_update",
      targets,
      ...recipeSnapshot,
      recipeSnapshot,
      catchcopyRevisionId: revisionId,
      productMappings,
      verifiedProductIdentifiers,
      catchcopies,
      retryUnfinishedFromJobId: retryFromId || null,
      dispatchMode,
      ...(inheritedBatchId ? { batchId: inheritedBatchId } : {}),
      executionPolicy: "signed_in_browser_isolated_codex",
      mutationScope: "ec_catchcopy_only",
      operatorAuthorization: {
        executionAuthorized: !reserved,
        source: reserved ? "tsa_reservation_confirmation" : "tsa_immediate_execution_confirmation",
        authorizedAt: now,
        authorizedBy: session.user?.email || ADMIN_EMAIL,
        recipeId,
        targets,
        catchcopies,
      },
    };
    const { data: job, error: insertError } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: "ec_catchcopy_update",
        channel: null,
        trigger_type: "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: reserved ? "一括実行の予約済み" : "事務所PCのECキャッチコピー変更開始待ち",
        parameters,
        requested_by: session.user?.email || ADMIN_EMAIL,
        priority: 50,
        max_attempts: 1,
        scheduled_at: reserved ? EC_PRICE_RESERVATION_SCHEDULED_AT : now,
      })
      .select("id,status,progress,current_step,error_message,parameters,result,scheduled_at,created_at,completed_at")
      .single();
    if (insertError || !job) throw insertError || new Error("キャッチコピー変更タスクを登録できません");
    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: reserved ? "reserved" : "queued",
      message: reserved ? "ECキャッチコピー変更を一括実行予約へ登録しました" : "ECキャッチコピー変更を実行待ちに登録しました",
      progress: 0,
      payload: { recipeId, targets, catchcopies },
    });
    return NextResponse.json({ ok: true, reserved, job: toJobView(job) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "キャッチコピー変更タスクを登録できません" },
      { status: 500 },
    );
  }
}

