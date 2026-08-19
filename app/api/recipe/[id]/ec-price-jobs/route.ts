import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { normalizeEcPriceTargets, type EcPriceJobView } from "@/lib/ec-price-codex";
import {
  buildEcPriceRecipeSnapshot,
  ecPriceRecipeIdentitiesMatch,
  ecPriceSnapshotsMatch,
  type EcPriceRecipeSnapshot,
} from "@/lib/ec-price-job-server";
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sameTargets(left: unknown, right: string[]) {
  const normalized = normalizeEcPriceTargets(left).sort();
  const expected = [...right].sort();
  return normalized.length === expected.length && normalized.every((target, index) => target === expected[index]);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toJobView(job: Record<string, unknown>): EcPriceJobView {
  const parameters = asObject(job.parameters);
  const result = asObject(job.result);
  const sites = Array.isArray(result.sites) ? result.sites : [];
  return {
    id: String(job.id),
    status: String(job.status) as EcPriceJobView["status"],
    progress: Number(job.progress) || 0,
    currentStep: String(job.current_step || "実行待ち"),
    errorMessage: job.error_message ? String(job.error_message) : null,
    targets: normalizeEcPriceTargets(parameters.targets),
    newPriceInclTax: Number(parameters.newPriceInclTax) || 0,
    summary: result.summary ? String(result.summary) : null,
    sites: sites as EcPriceJobView["sites"],
    createdAt: String(job.created_at || ""),
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

function jobMatchesRequest(
  job: Record<string, unknown>,
  newPriceInclTax: number,
  targets: string[],
  recipeSnapshot: EcPriceRecipeSnapshot,
) {
  const parameters = asObject(job.parameters);
  return Number(parameters.newPriceInclTax) === newPriceInclTax
    && sameTargets(parameters.targets, targets)
    && ecPriceSnapshotsMatch(parameters.recipeSnapshot, recipeSnapshot);
}

async function resolveExistingJob(input: {
  supabase: ReturnType<typeof getWebSalesAutomationServiceClient>;
  active: Record<string, unknown>;
  dispatchMode: EcPriceDispatchMode;
  newPriceInclTax: number;
  targets: string[];
  recipeSnapshot: EcPriceRecipeSnapshot;
}) {
  const { supabase, active, dispatchMode, newPriceInclTax, targets, recipeSnapshot } = input;
  if (!jobMatchesRequest(active, newPriceInclTax, targets, recipeSnapshot)) {
    return NextResponse.json(
      { error: "この商品の別の価格変更が実行中または予約済みです。完了または取消後に再実行してください" },
      { status: 409 },
    );
  }

  const activeParameters = asObject(active.parameters);
  const reserved = isReservedEcPriceJob(active.status, activeParameters);
  if (dispatchMode === "reserved") {
    if (!reserved) {
      return NextResponse.json(
        { error: "この商品の価格変更はすでに実行待ちです" },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      reused: true,
      reserved: true,
      job: toJobView(active),
    });
  }

  if (!reserved) {
    return NextResponse.json({ ok: true, reused: true, reserved: false, job: toJobView(active) });
  }

  const releasedAt = new Date().toISOString();
  const { data: promoted, error } = await supabase
    .from("web_sales_codex_jobs")
    .update({
      parameters: {
        ...activeParameters,
        dispatchMode: "immediate",
        releasedAt,
      },
      scheduled_at: releasedAt,
      current_step: "事務所PCの価格改定開始待ち",
      updated_at: releasedAt,
    })
    .eq("id", String(active.id))
    .eq("status", "queued")
    .contains("parameters", { dispatchMode: "reserved" })
    .select("id,status,progress,current_step,error_message,parameters,result,scheduled_at,created_at,completed_at")
    .maybeSingle();
  if (error) throw error;
  if (!promoted) {
    return NextResponse.json(
      { error: "予約の実行状態が変わりました。画面を再読込してください" },
      { status: 409 },
    );
  }
  await supabase.from("web_sales_codex_job_events").insert({
    job_id: promoted.id,
    event_type: "queued",
    message: "予約した価格変更を今すぐ実行へ移しました",
    progress: 0,
  });
  return NextResponse.json({
    ok: true,
    reused: false,
    promoted: true,
    reserved: false,
    job: toJobView(promoted),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const { id: recipeId } = await params;
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
  if (!jobId) return NextResponse.json({ error: "jobIdが必要です" }, { status: 400 });

  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("web_sales_codex_jobs")
    .select("id,task_key,status,progress,current_step,error_message,parameters,result,created_at,completed_at")
    .eq("id", jobId)
    .eq("task_key", "ec_price_update")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || String(asObject(data.parameters).recipeId || "") !== recipeId) {
    return NextResponse.json({ error: "価格変更タスクが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job: toJobView(data) });
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
    const requestedTargets = Array.isArray(body.targets) ? body.targets : [];
    const targets = normalizeEcPriceTargets(body.targets);
    const dispatchMode = normalizeEcPriceDispatchMode(body.dispatchMode);
    if (targets.length === 0 || targets.length !== requestedTargets.length) {
      return NextResponse.json({ error: "反映先ECを選択してください" }, { status: 400 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,selling_price,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) {
      return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });
    }
    if (recipe.is_intermediate) {
      return NextResponse.json({ error: "中間加工品はEC価格反映の対象外です" }, { status: 400 });
    }

    const recipeSnapshot = buildEcPriceRecipeSnapshot(recipe as Record<string, unknown>);
    const { newPriceExTax, newPriceInclTax } = recipeSnapshot;
    if (!Number.isFinite(newPriceExTax) || newPriceExTax <= 0 || newPriceInclTax <= 0) {
      return NextResponse.json({ error: "保存済み販売価格が正しくありません" }, { status: 400 });
    }
    const expectedPriceInclTax = positiveInteger(body.expectedPriceInclTax);
    const expectedRecipeSnapshot = buildEcPriceRecipeSnapshot(asObject(body.expectedRecipeSnapshot));
    if (
      expectedPriceInclTax !== newPriceInclTax
      || !ecPriceSnapshotsMatch(expectedRecipeSnapshot, recipeSnapshot)
    ) {
      return NextResponse.json(
        { error: "確認後に販売価格または商品情報が変わりました。画面を再読込して確認し直してください" },
        { status: 409 },
      );
    }

    const { data: activeRows, error: activeError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,status,progress,current_step,error_message,parameters,result,scheduled_at,created_at,completed_at")
      .eq("task_key", "ec_price_update")
      .contains("parameters", { recipeId })
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    if (activeError) throw activeError;
    const active = activeRows?.[0];
    if (active) {
      return resolveExistingJob({
        supabase,
        active: active as Record<string, unknown>,
        dispatchMode,
        newPriceInclTax,
        targets,
        recipeSnapshot,
      });
    }

    const { data: revisionRows, error: revisionError } = await supabase
      .from("recipe_ec_price_revisions")
      .select("id,previous_price_incl_tax,new_price_incl_tax,recipe_snapshot,created_at")
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: true });
    if (revisionError) throw revisionError;
    const revisions = (revisionRows || []).filter((revision) =>
      ecPriceRecipeIdentitiesMatch(revision.recipe_snapshot, recipeSnapshot),
    );
    const currentRevision = [...revisions].reverse().find(
      (revision) => Number(revision.new_price_incl_tax) === newPriceInclTax,
    );
    const earliestTrackedStandardPrice = positiveInteger(revisions[0]?.previous_price_incl_tax);

    const { data: syncRows, error: syncError } = await supabase
      .from("recipe_ec_price_sync_state")
      .select("target,last_standard_price_incl_tax,last_site_price,last_job_id,recipe_snapshot")
      .eq("recipe_id", recipeId)
      .in("target", targets);
    if (syncError) throw syncError;
    const trackedSiteBaselines = Object.fromEntries(targets.map((target) => {
      const state = (syncRows || []).find((row) =>
        row.target === target && ecPriceRecipeIdentitiesMatch(row.recipe_snapshot, recipeSnapshot),
      );
      return [target, positiveInteger(state?.last_standard_price_incl_tax) || earliestTrackedStandardPrice];
    }));

    const { data: historyRows, error: historyError } = await supabase
      .from("web_sales_codex_jobs")
      .select("parameters,result,status,created_at")
      .eq("task_key", "ec_price_update")
      .contains("parameters", { recipeId })
      .order("created_at", { ascending: false })
      .limit(200);
    if (historyError) throw historyError;
    const campaignReferenceStandardPrice = (() => {
      for (const history of historyRows || []) {
        const historyParameters = asObject(history.parameters);
        const historyResult = asObject(history.result);
        if (historyResult.validated_plan_checkpoint !== true) continue;
        const sameRevision = (historyParameters.priceRevisionId || null) === (currentRevision?.id || null);
        if (
          !sameRevision
          || Number(historyParameters.newPriceInclTax) !== newPriceInclTax
          || !ecPriceSnapshotsMatch(historyParameters.recipeSnapshot, recipeSnapshot)
        ) continue;
        const referencePrice = positiveInteger(asObject(historyResult.plan).reference_standard_price);
        if (referencePrice) return referencePrice;
      }
      return null;
    })();
    const siteBaselines = Object.fromEntries(targets.map((target) => [
      target,
      positiveInteger(trackedSiteBaselines[target]) || campaignReferenceStandardPrice,
    ]));
    const recoveryPlanSites = targets.flatMap((target) => {
      for (const history of historyRows || []) {
        const historyParameters = asObject(history.parameters);
        const historyResult = asObject(history.result);
        if (historyResult.validated_plan_checkpoint !== true) continue;
        const sameRevision = (historyParameters.priceRevisionId || null) === (currentRevision?.id || null);
        if (
          !sameRevision
          || Number(historyParameters.newPriceInclTax) !== newPriceInclTax
          || !ecPriceSnapshotsMatch(historyParameters.recipeSnapshot, recipeSnapshot)
        ) continue;
        const plan = asObject(historyResult.plan);
        const sites = Array.isArray(plan.sites) ? plan.sites : [];
        const site = sites.find((entry) => asObject(entry).site === target);
        const siteObject = asObject(site);
        if (
          siteObject.status === "planned"
          && positiveInteger(siteObject.target_price)
          && positiveInteger(siteObject.basis_price)
        ) {
          return [siteObject];
        }
      }
      return [];
    });

    const parameters = {
      taskKey: "ec_price_update",
      targets,
      ...recipeSnapshot,
      recipeSnapshot,
      priceRevisionId: currentRevision?.id || null,
      siteBaselines,
      recoveryPlanSites,
      newPriceExTax,
      newPriceInclTax,
      lpUpdate: false,
      dispatchMode,
      executionPolicy: "signed_in_browser_isolated_codex",
    };

    const isReservation = dispatchMode === "reserved";

    const { data: job, error: insertError } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: "ec_price_update",
        channel: null,
        trigger_type: "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: isReservation ? "一括実行の予約済み" : "事務所PCの価格改定開始待ち",
        parameters,
        requested_by: session.user?.email || ADMIN_EMAIL,
        priority: 50,
        max_attempts: 1,
        scheduled_at: isReservation ? EC_PRICE_RESERVATION_SCHEDULED_AT : new Date().toISOString(),
      })
      .select("id,status,progress,current_step,error_message,parameters,result,scheduled_at,created_at,completed_at")
      .single();
    if (insertError?.code === "23505") {
      const { data: existingRows } = await supabase
        .from("web_sales_codex_jobs")
        .select("id,status,progress,current_step,error_message,parameters,result,scheduled_at,created_at,completed_at")
        .eq("task_key", "ec_price_update")
        .contains("parameters", { recipeId })
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1);
      if (existingRows?.[0]) {
        return resolveExistingJob({
          supabase,
          active: existingRows[0] as Record<string, unknown>,
          dispatchMode,
          newPriceInclTax,
          targets,
          recipeSnapshot,
        });
      }
    }
    if (insertError || !job) throw insertError || new Error("価格変更タスクを登録できません");

    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: isReservation ? "reserved" : "queued",
      message: isReservation
        ? `${targets.join("・")}の価格変更を一括実行予約へ登録しました`
        : `${targets.join("・")}の価格変更を実行待ちに登録しました`,
      progress: 0,
      payload: { recipeId, targets, newPriceInclTax },
    });

    return NextResponse.json({
      ok: true,
      reused: false,
      reserved: isReservation,
      job: toJobView(job),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "価格変更タスクを登録できません" },
      { status: 500 },
    );
  }
}
