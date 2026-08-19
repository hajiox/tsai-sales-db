import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  isCodexBridgeAuthorized,
  normalizeWorkerId,
} from "@/lib/web-sales-codex/server";
import type { CodexJobStatus } from "@/lib/web-sales-codex/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINAL_STATUSES: CodexJobStatus[] = [
  "waiting_for_user",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
];
const EC_PRICE_TARGETS = new Set(["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"]);

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function priceSyncRows(
  claimedJob: Record<string, any>,
  submittedResult: unknown,
  jobId: string,
  updatedAt: string,
) {
  const parameters = asObject(claimedJob.parameters);
  const requestedTargets = Array.isArray(parameters.targets)
    ? parameters.targets.map((target: unknown) => String(target))
    : [];
  if (
    requestedTargets.length === 0
    || new Set(requestedTargets).size !== requestedTargets.length
    || requestedTargets.some((target: string) => !EC_PRICE_TARGETS.has(target))
  ) throw new Error("価格変更タスクの対象ECが不正です");

  const result = asObject(submittedResult);
  const resultSites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const successfulResultSites = resultSites.filter(
    (site) => site.status === "updated" || site.status === "submitted_pending",
  );
  if (successfulResultSites.length === 0) return [];
  const resultNames = resultSites.map((site) => String(site.site || ""));
  if (
    resultNames.length !== requestedTargets.length
    || new Set(resultNames).size !== resultNames.length
    || resultNames.some((target) => !requestedTargets.includes(target))
    || requestedTargets.some((target: string) => !resultNames.includes(target))
  ) throw new Error("価格変更結果の対象ECが依頼内容と一致しません");

  const persistedPlan = asObject(asObject(claimedJob.result).plan);
  if (asObject(claimedJob.result).validated_plan_checkpoint !== true) {
    throw new Error("サーバー検証済みの価格計画がありません");
  }
  const planSites = Array.isArray(persistedPlan.sites) ? persistedPlan.sites.map(asObject) : [];
  const standardPrice = Number(parameters.newPriceInclTax);
  if (!Number.isInteger(standardPrice) || standardPrice <= 0) {
    throw new Error("価格変更タスクの標準価格が不正です");
  }

  return resultSites.flatMap((entry) => {
    const target = String(entry.site || "");
    const successful = entry.status === "updated" || entry.status === "submitted_pending";
    if (!successful) return [];
    const plannedMatches = planSites.filter((site) => site.site === target && site.status === "planned");
    if (plannedMatches.length !== 1) throw new Error(`${target}の保存済み価格計画が見つかりません`);
    const planned = plannedMatches[0];
    const rule = String(planned.pricing_rule || "");
    const basisPrice = Number(planned.basis_price);
    const targetPrice = Number(planned.target_price);
    const baselinePrice = Number(planned.standard_baseline_price);
    const unitMultiplier = Number(planned.unit_multiplier);
    const shippingMode = String(planned.shipping_mode || "");
    if (
      !Number.isInteger(basisPrice)
      || basisPrice <= 0
      || !Number.isInteger(targetPrice)
      || targetPrice <= 0
      || !Number.isInteger(unitMultiplier)
      || unitMultiplier <= 0
      || unitMultiplier > 100
    ) {
      throw new Error(`${target}の保存済み価格計画が不正です`);
    }
    if ((target === "base" || target === "tiktok") && !["included", "excluded"].includes(shippingMode)) {
      throw new Error(`${target}の送料条件が不正です`);
    }
    if (rule === "delta_from_reference") {
      if (
        !Number.isInteger(baselinePrice)
        || baselinePrice <= 0
        || targetPrice !== basisPrice + (standardPrice - baselinePrice) * unitMultiplier
      ) throw new Error(`${target}の差額価格計画が不正です`);
    } else if (
      rule !== "standard_price"
      || unitMultiplier !== 1
      || targetPrice !== standardPrice
      || ((target === "base" || target === "tiktok") && shippingMode === "excluded")
    ) {
      throw new Error(`${target}の目標価格が依頼価格と一致しません`);
    }
    const finalPrice = Number(entry.final_price);
    if (!Number.isInteger(finalPrice) || finalPrice !== targetPrice) {
      throw new Error(`${target}の最終価格が保存済み目標価格と一致しません`);
    }
    if (
      !String(entry.product_identifier || "").trim()
      || String(entry.product_identifier).trim() !== String(planned.product_identifier || "").trim()
    ) throw new Error(`${target}の商品識別子が保存済み計画と一致しません`);

    // submitted_pending is not a verified saved price. Advancing the baseline
    // before a reload-confirmed update can make the next BASE delta incorrect.
    if (entry.status !== "updated") return [];
    return [{
      recipe_id: String(parameters.recipeId || ""),
      target,
      last_standard_price_incl_tax: standardPrice,
      last_site_price: finalPrice,
      last_job_id: jobId,
      recipe_snapshot: parameters.recipeSnapshot,
      updated_at: updatedAt,
    }];
  });
}

function validateFinalPriceResult(
  claimedJob: Record<string, any>,
  submittedResult: Record<string, any> | null,
  status: CodexJobStatus,
) {
  if (!submittedResult) {
    if (status === "failed" || status === "cancelled") return;
    throw new Error("価格変更の最終結果がありません");
  }
  const parameters = asObject(claimedJob.parameters);
  const requestedTargets = Array.isArray(parameters.targets)
    ? parameters.targets.map((target: unknown) => String(target))
    : [];
  const sites = Array.isArray(submittedResult.sites) ? submittedResult.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  if (
    submittedResult.status !== status
    || Number(submittedResult.new_standard_price) !== Number(parameters.newPriceInclTax)
    || names.length !== requestedTargets.length
    || new Set(names).size !== names.length
    || names.some((target) => !requestedTargets.includes(target))
    || requestedTargets.some((target: string) => !names.includes(target))
  ) throw new Error("価格変更の最終結果が依頼内容と一致しません");
  if (status === "completed" && sites.some((site) => site.status !== "updated")) {
    throw new Error("未確認のECサイトがあるため完了にできません");
  }
}

function validatedPricePlan(parametersInput: unknown, planInput: unknown) {
  const parameters = asObject(parametersInput);
  const requestedTargets = Array.isArray(parameters.targets)
    ? parameters.targets.map((target: unknown) => String(target))
    : [];
  const plan = asObject(planInput);
  const sites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  const standardPrice = Number(parameters.newPriceInclTax);
  const referencePrice = Number(plan.reference_standard_price);
  if (
    plan.status !== "ready"
    || !Number.isInteger(standardPrice)
    || standardPrice <= 0
    || !Number.isInteger(referencePrice)
    || referencePrice <= 0
    || requestedTargets.length === 0
    || new Set(requestedTargets).size !== requestedTargets.length
    || requestedTargets.some((target: string) => !EC_PRICE_TARGETS.has(target))
    || names.length !== requestedTargets.length
    || new Set(names).size !== names.length
    || names.some((target) => !requestedTargets.includes(target))
    || requestedTargets.some((target: string) => !names.includes(target))
  ) throw new Error("価格計画の対象または標準価格が不正です");

  const siteBaselines = asObject(parameters.siteBaselines);
  const recoverySites = Array.isArray(parameters.recoveryPlanSites)
    ? parameters.recoveryPlanSites.map(asObject)
    : [];
  for (const site of sites) {
    const target = String(site.site || "");
    const observed = Number(site.observed_price);
    const basis = Number(site.basis_price);
    const targetPrice = Number(site.target_price);
    const baseline = site.standard_baseline_price == null ? null : Number(site.standard_baseline_price);
    const rule = String(site.pricing_rule || "");
    const productIdentifier = String(site.product_identifier || "").trim();
    const unitMultiplier = Number(site.unit_multiplier);
    const unitEvidence = String(site.unit_evidence || "").trim();
    const shippingMode = String(site.shipping_mode || "");
    if (
      site.status !== "planned"
      || !Number.isInteger(observed)
      || observed <= 0
      || !Number.isInteger(basis)
      || basis <= 0
      || !Number.isInteger(targetPrice)
      || targetPrice <= 0
      || !productIdentifier
      || !Number.isInteger(unitMultiplier)
      || unitMultiplier <= 0
      || unitMultiplier > 100
      || !unitEvidence
    ) throw new Error(`${target}の価格計画が確定していません`);
    if (!["included", "excluded", "not_checked"].includes(shippingMode)) {
      throw new Error(`${target}の送料条件が不正です`);
    }
    if ((target === "base" || target === "tiktok") && shippingMode === "not_checked") {
      throw new Error(`${target}の送料条件が確認されていません`);
    }
    if (rule === "delta_from_reference") {
      const suppliedBaseline = siteBaselines[target] == null ? null : Number(siteBaselines[target]);
      const expectedBaseline = suppliedBaseline || referencePrice;
      if (
        !Number.isInteger(baseline)
        || (baseline ?? 0) <= 0
        || baseline !== expectedBaseline
        || targetPrice !== basis + (standardPrice - (baseline ?? 0)) * unitMultiplier
      ) throw new Error(`${target}の差額価格計画が不正です`);
    } else if (
      rule !== "standard_price"
      || unitMultiplier !== 1
      || targetPrice !== standardPrice
      || ((target === "base" || target === "tiktok") && shippingMode === "excluded")
    ) {
      throw new Error(`${target}の目標価格が依頼価格と一致しません`);
    }
    const recovery = recoverySites.find((entry) => entry.site === target);
    if (recovery) {
      for (const field of ["pricing_rule", "shipping_mode", "unit_multiplier", "unit_evidence", "basis_price", "standard_baseline_price", "target_price", "product_identifier"]) {
        if ((recovery[field] ?? null) !== (site[field] ?? null)) {
          throw new Error(`${target}の保存済み価格計画が変更されています`);
        }
      }
      if (observed !== basis && observed !== targetPrice) {
        throw new Error(`${target}の現在価格が保存済み計画と競合しています`);
      }
    } else if (observed !== basis) {
      throw new Error(`${target}の現在価格と基準価格が一致しません`);
    }
  }
  return plan;
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
    const body = await request.json();
    const workerId = normalizeWorkerId(body.workerId);
    const status = String(body.status || "running") as CodexJobStatus;
    if (!["running", ...FINAL_STATUSES].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const progress = Math.max(0, Math.min(100, Number(body.progress) || 0));
    const message = String(body.message || body.currentStep || "").slice(0, 4000);
    const now = new Date().toISOString();
    const isFinal = FINAL_STATUSES.includes(status);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: claimedJob, error: claimedJobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,parameters,result")
      .eq("id", id)
      .eq("worker_id", workerId)
      .single();
    if (claimedJobError || !claimedJob) throw claimedJobError || new Error("Job not found for worker");
    if (claimedJob.status !== "running") {
      if (isFinal && claimedJob.status === status) return NextResponse.json({ ok: true, reused: true });
      return NextResponse.json({ error: "Job is no longer running" }, { status: 409 });
    }

    let submittedResult = Object.prototype.hasOwnProperty.call(body, "result")
      ? asObject(body.result)
      : null;
    if (claimedJob.task_key === "ec_price_update" && submittedResult) {
      if (!isFinal) {
        if (String(body.eventType || "") !== "ec_price_plan_saved") {
          return NextResponse.json({ error: "Invalid EC price checkpoint" }, { status: 400 });
        }
        const plan = validatedPricePlan(claimedJob.parameters, submittedResult.plan);
        submittedResult = { ...submittedResult, plan, validated_plan_checkpoint: true };
      } else if (asObject(claimedJob.result).validated_plan_checkpoint === true) {
        submittedResult = {
          ...submittedResult,
          plan: asObject(claimedJob.result).plan,
          validated_plan_checkpoint: true,
        };
      }
    }

    let successfulSites: Record<string, any>[] = [];
    if (claimedJob.task_key === "ec_price_update" && isFinal) {
      validateFinalPriceResult(claimedJob, submittedResult, status);
      successfulSites = priceSyncRows(claimedJob, submittedResult, id, now);
    }

    const updates: Record<string, any> = {
      status,
      progress: isFinal && status === "completed" ? 100 : progress,
      current_step: String(body.currentStep || message || "処理中").slice(0, 500),
      error_message: body.errorMessage ? String(body.errorMessage).slice(0, 4000) : null,
      heartbeat_at: now,
      lease_expires_at: isFinal ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      completed_at: isFinal ? now : null,
      updated_at: now,
    };
    if (submittedResult) {
      updates.result = submittedResult;
    }
    if (claimedJob.task_key === "ec_price_update" && isFinal) {
      const { data: completed, error: completeError } = await supabase.rpc("complete_ec_price_codex_job", {
        p_job_id: id,
        p_worker_id: workerId,
        p_status: status,
        p_progress: updates.progress,
        p_current_step: updates.current_step,
        p_error_message: updates.error_message,
        p_result: submittedResult,
        p_completed_at: now,
        p_sync_rows: successfulSites,
      });
      if (completeError) throw completeError;
      if (!completed) return NextResponse.json({ error: "Job is no longer running" }, { status: 409 });
    } else {
      const { data: job, error } = await supabase
        .from("web_sales_codex_jobs")
        .update(updates)
        .eq("id", id)
        .eq("worker_id", workerId)
        .eq("status", "running")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!job) return NextResponse.json({ error: "Job is no longer running" }, { status: 409 });
    }

    await supabase.from("web_sales_codex_job_events").insert({
      job_id: id,
      event_type: String(body.eventType || status).slice(0, 80),
      message,
      progress: updates.progress,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    });

    if (isFinal) {
      await supabase
        .from("web_sales_codex_workers")
        .update({
          status: status === "failed" ? "error" : "online",
          current_job_id: null,
          last_error: status === "failed" ? updates.error_message : null,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", workerId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job update failed" },
      { status: 400 },
    );
  }
}
