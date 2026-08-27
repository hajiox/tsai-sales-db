import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { dispatchRecipePriceTsgNotifications } from "@/lib/recipe-price-tsg-notification";
import { dispatchRecipeProductNameTsgNotifications } from "@/lib/recipe-product-name-tsg-notification";
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
const EC_PRODUCT_NAME_STATUSES = new Set(["updated", "submitted_pending", "not_found", "blocked"]);
const EC_CATCHCOPY_TARGETS = new Set(["rakuten", "yahoo"]);
const EC_CATCHCOPY_STATUSES = new Set(["updated", "submitted_pending", "not_found", "blocked"]);

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
  if (requestedTargets.length === 0 && parameters.lpUpdate === true) return [];
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

  const persistedPlan = asObject(result.plan);
  if (result.validated_plan_checkpoint !== true) {
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

function normalizedProductName(value: unknown, maxLength = 255) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function productNameForTarget(parameters: Record<string, unknown>, target: string) {
  const names = asObject(parameters.newProductNames);
  const commonName = normalizedProductName(parameters.newProductName, 75);
  const targetName = normalizedProductName(names[target], 75);
  return commonName && targetName === commonName ? commonName : "";
}

function validatedProductNamePlan(parametersInput: unknown, planInput: unknown) {
  const parameters = asObject(parametersInput);
  const plan = asObject(planInput);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  const summaryName = normalizedProductName(parameters.newProductName, 75);
  const sites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  if (
    plan.status !== "ready"
    || !summaryName
    || targets.length === 0
    || new Set(targets).size !== targets.length
    || targets.some((target: string) => !EC_PRICE_TARGETS.has(target))
    || names.length !== targets.length
    || new Set(names).size !== names.length
    || targets.some((target: string) => !names.includes(target))
  ) throw new Error("EC商品名変更計画の対象が不正です");
  for (const site of sites) {
    const target = String(site.site || "");
    const targetName = productNameForTarget(parameters, target);
    if (!targetName) throw new Error(`${target}の商品名が保存されていません`);
    if (site.status === "not_found") {
      if (site.observed_name != null || site.target_name != null || site.product_identifier != null || !String(site.message || "").trim()) {
        throw new Error(`${target}の対象商品なし計画が不正です`);
      }
      continue;
    }
    if (
      site.status !== "planned"
      || normalizedProductName(site.target_name) !== targetName
      || !String(site.product_identifier || "").trim()
      || !String(site.message || "").trim()
    ) throw new Error(`${target}の商品名変更計画が確定していません`);
  }
  return plan;
}

function validatedProductNameProgress(parametersInput: unknown, resultInput: unknown) {
  const parameters = asObject(parametersInput);
  const result = asObject(resultInput);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  if (normalizedProductName(result.new_product_name, 75) !== normalizedProductName(parameters.newProductName, 75)) {
    throw new Error("EC商品名変更途中結果が依頼名と一致しません");
  }
  const sites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  if (new Set(names).size !== names.length
    || names.some((target) => !targets.includes(target))
    || sites.some((site) => !EC_PRODUCT_NAME_STATUSES.has(String(site.status)))) {
    throw new Error("EC商品名変更途中結果の対象が不正です");
  }
  for (const site of sites) {
    if (["updated", "submitted_pending"].includes(String(site.status))
      && normalizedProductName(site.final_name) !== productNameForTarget(parameters, String(site.site || ""))) {
      throw new Error(`${site.site}の商品名変更途中結果が依頼名と一致しません`);
    }
  }
  return result;
}

function validatedFinalProductNamePlan(parametersInput: unknown, resultInput: unknown) {
  const parameters = asObject(parametersInput);
  const result = asObject(resultInput);
  const plan = asObject(result.plan);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  const resultSites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const planSites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  if (resultSites.length !== targets.length || planSites.length !== targets.length) {
    throw new Error("EC商品名変更の逐次結果が依頼対象と一致しません");
  }
  for (const target of targets) {
    const resultSite = resultSites.find((site) => site.site === target);
    const planSite = planSites.find((site) => site.site === target);
    if (!resultSite || !planSite) throw new Error(`${target}の逐次結果がありません`);
    if (resultSite.status === "blocked") continue;
    validatedProductNamePlan({ ...parameters, targets: [target] }, {
      status: "ready",
      summary: String(plan.summary || "逐次計画"),
      sites: [planSite],
    });
    if (resultSite.status === "not_found" && planSite.status !== "not_found") {
      throw new Error(`${target}の対象商品なし結果が計画と一致しません`);
    }
    if (["updated", "submitted_pending"].includes(String(resultSite.status)) && planSite.status !== "planned") {
      throw new Error(`${target}の反映結果に検証済み計画がありません`);
    }
  }
  return plan;
}

function validateFinalProductNameResult(
  claimedJob: Record<string, any>,
  submittedResult: Record<string, any> | null,
  status: CodexJobStatus,
) {
  if (!submittedResult) {
    if (status === "failed" || status === "cancelled") return;
    throw new Error("EC商品名変更の最終結果がありません");
  }
  const parameters = asObject(claimedJob.parameters);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  const sites = Array.isArray(submittedResult.sites) ? submittedResult.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  const summaryName = normalizedProductName(parameters.newProductName, 75);
  if (
    submittedResult.status !== status
    || normalizedProductName(submittedResult.new_product_name, 75) !== summaryName
    || names.length !== targets.length
    || new Set(names).size !== names.length
    || targets.some((target: string) => !names.includes(target))
  ) throw new Error("EC商品名変更の最終結果が依頼内容と一致しません");
  if (status === "completed") {
    const planSites = Array.isArray(asObject(submittedResult.plan).sites)
      ? asObject(submittedResult.plan).sites as unknown[]
      : [];
    const incomplete = sites.some((site) => {
      const targetName = productNameForTarget(parameters, String(site.site || ""));
      if (site.status === "updated" && normalizedProductName(site.final_name) === targetName) return false;
      const planned = planSites.map(asObject).find((entry) => entry.site === site.site);
      return site.status !== "not_found" || planned?.status !== "not_found";
    });
    if (incomplete) throw new Error("未確認のECサイトがあるため完了にできません");
  }
}

function productNameSyncRows(
  claimedJob: Record<string, any>,
  submittedResult: unknown,
  jobId: string,
  updatedAt: string,
) {
  const parameters = asObject(claimedJob.parameters);
  const result = asObject(submittedResult);
  const planSites = Array.isArray(asObject(result.plan).sites) ? asObject(result.plan).sites as unknown[] : [];
  const sites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  if (result.validated_plan_checkpoint !== true) throw new Error("サーバー検証済みの商品名計画がありません");
  return sites.flatMap((site) => {
    if (site.status !== "updated") return [];
    const target = String(site.site || "");
    const targetName = productNameForTarget(parameters, target);
    const planned = planSites.map(asObject).find((entry) => entry.site === target);
    if (!planned || planned.status !== "planned") throw new Error(`${target}の商品名計画が見つかりません`);
    if (normalizedProductName(planned.target_name) !== targetName
      || normalizedProductName(site.final_name) !== targetName
      || String(site.product_identifier || "").trim() !== String(planned.product_identifier || "").trim()) {
      throw new Error(`${target}の商品名変更結果が保存済み計画と一致しません`);
    }
    return [{
      recipe_id: String(parameters.recipeId || ""),
      target,
      last_product_name: targetName,
      last_job_id: jobId,
      recipe_snapshot: parameters.recipeSnapshot,
      updated_at: updatedAt,
    }];
  });
}

const EC_CATCHCOPY_MAX_LENGTHS: Record<string, number> = {
  rakuten: 87, yahoo: 30,
};

function normalizedCatchcopy(value: unknown, maxLength = 255) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function catchcopyForTarget(parameters: Record<string, unknown>, target: string) {
  const catchcopies = asObject(parameters.catchcopies);
  const commonCatchcopy = normalizedCatchcopy(catchcopies.rakuten ?? catchcopies.yahoo, 30);
  const targetCatchcopy = normalizedCatchcopy(catchcopies[target], 30);
  return commonCatchcopy && targetCatchcopy === commonCatchcopy ? commonCatchcopy : "";
}

function validatedCatchcopyPlan(parametersInput: unknown, planInput: unknown) {
  const parameters = asObject(parametersInput);
  const plan = asObject(planInput);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  const sites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  if (
    plan.status !== "ready"
    || targets.length === 0
    || new Set(targets).size !== targets.length
    || targets.some((target: string) => !EC_CATCHCOPY_TARGETS.has(target))
    || names.length !== targets.length
    || new Set(names).size !== names.length
    || targets.some((target: string) => !names.includes(target))
  ) throw new Error("ECキャッチコピー変更計画の対象が不正です");
  for (const site of sites) {
    const target = String(site.site || "");
    const targetName = catchcopyForTarget(parameters, target);
    if (!targetName) throw new Error(`${target}のキャッチコピーが保存されていません`);
    if (site.status === "not_found") {
      if (site.observed_catchcopy != null || site.target_catchcopy != null || site.product_identifier != null || !String(site.message || "").trim()) {
        throw new Error(`${target}の対象商品なし計画が不正です`);
      }
      continue;
    }
    if (
      site.status !== "planned"
      || normalizedCatchcopy(site.target_catchcopy, EC_CATCHCOPY_MAX_LENGTHS[target]) !== targetName
      || !String(site.product_identifier || "").trim()
      || !String(site.message || "").trim()
    ) throw new Error(`${target}のキャッチコピー変更計画が確定していません`);
  }
  return plan;
}

function validatedCatchcopyProgress(parametersInput: unknown, resultInput: unknown) {
  const parameters = asObject(parametersInput);
  const result = asObject(resultInput);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  const sites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  if (new Set(names).size !== names.length
    || names.some((target) => !targets.includes(target))
    || sites.some((site) => !EC_CATCHCOPY_STATUSES.has(String(site.status)))) {
    throw new Error("ECキャッチコピー変更途中結果の対象が不正です");
  }
  for (const site of sites) {
    if (["updated", "submitted_pending"].includes(String(site.status))
      && normalizedCatchcopy(site.final_catchcopy, EC_CATCHCOPY_MAX_LENGTHS[String(site.site || "")]) !== catchcopyForTarget(parameters, String(site.site || ""))) {
      throw new Error(`${site.site}のキャッチコピー変更途中結果が依頼名と一致しません`);
    }
  }
  return result;
}

function validatedFinalCatchcopyPlan(parametersInput: unknown, resultInput: unknown) {
  const parameters = asObject(parametersInput);
  const result = asObject(resultInput);
  const plan = asObject(result.plan);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  const resultSites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const planSites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  if (resultSites.length !== targets.length || planSites.length !== targets.length) {
    throw new Error("ECキャッチコピー変更の逐次結果が依頼対象と一致しません");
  }
  for (const target of targets) {
    const resultSite = resultSites.find((site) => site.site === target);
    const planSite = planSites.find((site) => site.site === target);
    if (!resultSite || !planSite) throw new Error(`${target}の逐次結果がありません`);
    if (resultSite.status === "blocked") continue;
    validatedCatchcopyPlan({ ...parameters, targets: [target] }, {
      status: "ready",
      summary: String(plan.summary || "逐次計画"),
      sites: [planSite],
    });
    if (resultSite.status === "not_found" && planSite.status !== "not_found") {
      throw new Error(`${target}の対象商品なし結果が計画と一致しません`);
    }
    if (["updated", "submitted_pending"].includes(String(resultSite.status)) && planSite.status !== "planned") {
      throw new Error(`${target}の反映結果に検証済み計画がありません`);
    }
  }
  return plan;
}

function validateFinalCatchcopyResult(
  claimedJob: Record<string, any>,
  submittedResult: Record<string, any> | null,
  status: CodexJobStatus,
) {
  if (!submittedResult) {
    if (status === "failed" || status === "cancelled") return;
    throw new Error("ECキャッチコピー変更の最終結果がありません");
  }
  const parameters = asObject(claimedJob.parameters);
  const targets = Array.isArray(parameters.targets) ? parameters.targets.map(String) : [];
  const sites = Array.isArray(submittedResult.sites) ? submittedResult.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  if (
    submittedResult.status !== status
    || names.length !== targets.length
    || new Set(names).size !== names.length
    || targets.some((target: string) => !names.includes(target))
  ) throw new Error("ECキャッチコピー変更の最終結果が依頼内容と一致しません");
  if (status === "completed") {
    const planSites = Array.isArray(asObject(submittedResult.plan).sites)
      ? asObject(submittedResult.plan).sites as unknown[]
      : [];
    const incomplete = sites.some((site) => {
      const targetName = catchcopyForTarget(parameters, String(site.site || ""));
      if (site.status === "updated" && normalizedCatchcopy(site.final_catchcopy, EC_CATCHCOPY_MAX_LENGTHS[String(site.site || "")]) === targetName) return false;
      const planned = planSites.map(asObject).find((entry) => entry.site === site.site);
      return site.status !== "not_found" || planned?.status !== "not_found";
    });
    if (incomplete) throw new Error("未確認のECサイトがあるため完了にできません");
  }
}

function catchcopySyncRows(
  claimedJob: Record<string, any>,
  submittedResult: unknown,
  jobId: string,
  updatedAt: string,
) {
  const parameters = asObject(claimedJob.parameters);
  const result = asObject(submittedResult);
  const planSites = Array.isArray(asObject(result.plan).sites) ? asObject(result.plan).sites as unknown[] : [];
  const sites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  if (result.validated_plan_checkpoint !== true) throw new Error("サーバー検証済みのキャッチコピー計画がありません");
  return sites.flatMap((site) => {
    if (site.status !== "updated") return [];
    const target = String(site.site || "");
    const targetName = catchcopyForTarget(parameters, target);
    const planned = planSites.map(asObject).find((entry) => entry.site === target);
    if (!planned || planned.status !== "planned") throw new Error(`${target}のキャッチコピー計画が見つかりません`);
    if (normalizedCatchcopy(planned.target_catchcopy, EC_CATCHCOPY_MAX_LENGTHS[target]) !== targetName
      || normalizedCatchcopy(site.final_catchcopy, EC_CATCHCOPY_MAX_LENGTHS[target]) !== targetName
      || String(site.product_identifier || "").trim() !== String(planned.product_identifier || "").trim()) {
      throw new Error(`${target}のキャッチコピー変更結果が保存済み計画と一致しません`);
    }
    return [{
      recipe_id: String(parameters.recipeId || ""),
      target,
      last_catchcopy: targetName,
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
  if (status === "completed") {
    const planSites = Array.isArray(asObject(submittedResult.plan).sites)
      ? asObject(submittedResult.plan).sites as unknown[]
      : [];
    const incomplete = sites.some((site) => {
      if (site.status === "updated") return false;
      const planned = planSites.map(asObject).find((entry) => entry.site === site.site);
      return site.status !== "not_found" || planned?.status !== "not_found";
    });
    if (incomplete) throw new Error("未確認のECサイトがあるため完了にできません");
  }
  const lp = asObject(submittedResult.lp);
  const lpRequired = parameters.lpUpdate === true;
  const lpUrl = String(parameters.lpUrl || "").trim();
  if (lpRequired) {
    if (lp.required !== true || String(lp.url || "").trim() !== lpUrl) {
      throw new Error("商品LPの最終結果が依頼内容と一致しません");
    }
    if (status === "completed" && lp.status !== "updated") {
      throw new Error("商品LPが未反映のため完了にできません");
    }
    if (lp.status === "updated") {
      const plannedLp = asObject(asObject(submittedResult.plan).lp);
      const plannedPrices = [...new Set((Array.isArray(plannedLp.updates) ? plannedLp.updates : [])
        .map((update) => Number(asObject(update).target_price))
        .filter((price) => Number.isInteger(price) && price > 0))].sort((a, b) => a - b);
      const finalPrices = [...new Set((Array.isArray(lp.final_prices) ? lp.final_prices : [])
        .map(Number)
        .filter((price) => Number.isInteger(price) && price > 0))].sort((a, b) => a - b);
      if (
        plannedPrices.length === 0
        || plannedPrices.length !== finalPrices.length
        || plannedPrices.some((price, index) => price !== finalPrices[index])
        || !isHttpUrl(lp.deployment_url)
        || !/^[0-9a-f]{40}$/i.test(String(lp.deployed_commit || "").trim())
      ) throw new Error("商品LPの公開価格確認が保存済み計画と一致しません");
    }
  } else if (lp.required !== false || lp.status !== "not_applicable" || lp.url != null || !Array.isArray(lp.final_prices) || lp.final_prices.length !== 0 || !Array.isArray(lp.changed_files) || lp.changed_files.length !== 0 || lp.deployment_url != null || lp.deployed_commit != null) {
    throw new Error("商品LP対象外の最終結果が不正です");
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
  const lpRequired = parameters.lpUpdate === true;
  if (
    plan.status !== "ready"
    || !Number.isInteger(standardPrice)
    || standardPrice <= 0
    || (requestedTargets.length > 0 && (!Number.isInteger(referencePrice) || referencePrice <= 0))
    || (requestedTargets.length === 0 && !lpRequired)
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
    if (site.status === "not_found") {
      if (
        site.observed_price != null
        || site.basis_price != null
        || site.standard_baseline_price != null
        || site.target_price != null
        || site.product_identifier != null
        || !String(site.unit_evidence || "").trim()
        || !String(site.message || "").trim()
      ) throw new Error(`${target}の対象商品なし計画が不正です`);
      continue;
    }
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
      for (const field of ["pricing_rule", "shipping_mode", "unit_multiplier", "basis_price", "standard_baseline_price", "target_price", "product_identifier"]) {
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
  const lp = asObject(plan.lp);
  const lpUrl = String(parameters.lpUrl || "").trim();
  if (lpRequired) {
    if (
      lp.required !== true
      || lp.status !== "planned"
      || String(lp.url || "").trim() !== lpUrl
      || !String(lp.project_root || "").trim()
      || !String(lp.github_repository || "").trim()
      || !String(lp.production_branch || "").trim()
      || !/^[0-9a-f]{40}$/i.test(String(lp.source_commit || "").trim())
      || !String(lp.product_evidence || "").trim()
      || !Array.isArray(lp.updates)
      || lp.updates.length === 0
    ) throw new Error("商品LPの更新計画が確定していません");
    for (const updateInput of lp.updates) {
      const update = asObject(updateInput);
      const pricingBasis = String(update.pricing_basis || "");
      const observedPrice = Number(update.observed_price);
      const targetPrice = Number(update.target_price);
      const expectedTarget = pricingBasis === "standard_price"
        ? standardPrice
        : Number(sites.find((site) => site.site === pricingBasis)?.target_price);
      if (
        !String(update.source_file || "").trim()
        || !String(update.occurrence_evidence || "").trim()
        || !Number.isInteger(observedPrice)
        || observedPrice <= 0
        || !Number.isInteger(targetPrice)
        || targetPrice !== expectedTarget
      ) throw new Error("商品LPの価格変更計画が不正です");
    }
  } else if (
    lp.required !== false
    || lp.status !== "not_applicable"
    || lp.url != null
    || String(lp.github_repository || "")
    || String(lp.production_branch || "")
    || String(lp.source_commit || "")
    || !Array.isArray(lp.updates)
    || lp.updates.length !== 0
  ) {
    throw new Error("商品LP対象外の計画が不正です");
  }
  return plan;
}

function isHttpUrl(value: unknown) {
  try {
    return ["http:", "https:"].includes(new URL(String(value || "").trim()).protocol);
  } catch {
    return false;
  }
}

function notApplicableLpPlan() {
  return {
    required: false,
    url: null,
    status: "not_applicable",
    project_root: null,
    github_repository: "",
    production_branch: "",
    source_commit: "",
    product_evidence: "",
    updates: [],
    message: "対象外",
  };
}

function validatedFinalPricePlan(parametersInput: unknown, submittedResultInput: unknown) {
  const parameters = asObject(parametersInput);
  const submittedResult = asObject(submittedResultInput);
  const plan = asObject(submittedResult.plan);
  const requestedTargets = Array.isArray(parameters.targets)
    ? parameters.targets.map((target: unknown) => String(target))
    : [];
  const resultSites = Array.isArray(submittedResult.sites) ? submittedResult.sites.map(asObject) : [];
  const planSites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  const resultNames = resultSites.map((site) => String(site.site || ""));
  const planNames = planSites.map((site) => String(site.site || ""));
  const referencePrice = Number(plan.reference_standard_price);
  if (
    (requestedTargets.length > 0 && (!Number.isInteger(referencePrice) || referencePrice <= 0))
    || resultNames.length !== requestedTargets.length
    || planNames.length !== requestedTargets.length
    || new Set(resultNames).size !== resultNames.length
    || new Set(planNames).size !== planNames.length
    || requestedTargets.some((target: string) => !resultNames.includes(target) || !planNames.includes(target))
  ) throw new Error("価格変更の逐次計画が依頼対象と一致しません");

  const siteBaselines = asObject(parameters.siteBaselines);
  const recoveryPlanSites = Array.isArray(parameters.recoveryPlanSites)
    ? parameters.recoveryPlanSites.map(asObject)
    : [];
  for (const target of requestedTargets) {
    const resultSite = resultSites.find((site) => site.site === target);
    const planSite = planSites.find((site) => site.site === target);
    if (!resultSite || !planSite) throw new Error(`${target}の逐次結果がありません`);
    if (resultSite.status === "blocked") continue;
    const scopedParameters = {
      ...parameters,
      targets: [target],
      siteBaselines: { [target]: siteBaselines[target] ?? null },
      recoveryPlanSites: recoveryPlanSites.filter((site) => site.site === target),
      lpUpdate: false,
      lpUrl: null,
    };
    validatedPricePlan(scopedParameters, {
      status: "ready",
      summary: String(plan.summary || "逐次計画"),
      reference_standard_price: referencePrice,
      sites: [planSite],
      lp: notApplicableLpPlan(),
    });
    if (resultSite.status === "not_found" && planSite.status !== "not_found") {
      throw new Error(`${target}の対象商品なし結果が計画と一致しません`);
    }
    if (["updated", "submitted_pending"].includes(String(resultSite.status)) && planSite.status !== "planned") {
      throw new Error(`${target}の反映結果に検証済み計画がありません`);
    }
  }

  const resultLp = asObject(submittedResult.lp);
  if (parameters.lpUpdate === true && resultLp.status === "updated") {
    validatedPricePlan({ ...parameters, targets: [], siteBaselines: {}, recoveryPlanSites: [] }, {
      status: "ready",
      summary: String(plan.summary || "商品LP逐次計画"),
      reference_standard_price: referencePrice,
      sites: [],
      lp: asObject(plan.lp),
    });
  }
  return plan;
}

function validatedEcPriceProgress(parametersInput: unknown, resultInput: unknown) {
  const parameters = asObject(parametersInput);
  const result = asObject(resultInput);
  const requestedTargets = Array.isArray(parameters.targets)
    ? parameters.targets.map((target: unknown) => String(target))
    : [];
  if (Number(result.new_standard_price) !== Number(parameters.newPriceInclTax)) {
    throw new Error("価格変更途中結果の標準価格が依頼と一致しません");
  }
  const sites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const names = sites.map((site) => String(site.site || ""));
  if (
    new Set(names).size !== names.length
    || names.some((target) => !requestedTargets.includes(target))
    || sites.some((site) => !["updated", "submitted_pending", "not_found", "blocked"].includes(String(site.status)))
  ) throw new Error("価格変更途中結果の対象が不正です");
  const lp = asObject(result.lp);
  if (parameters.lpUpdate === true && lp.url != null && String(lp.url) !== String(parameters.lpUrl || "")) {
    throw new Error("価格変更途中結果の商品LPが依頼と一致しません");
  }
  return result;
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
        const eventType = String(body.eventType || "");
        if (eventType === "ec_price_plan_saved") {
          const plan = validatedPricePlan(claimedJob.parameters, submittedResult.plan);
          submittedResult = { ...submittedResult, plan, validated_plan_checkpoint: true };
        } else if (eventType === "ec_price_progress_checkpoint") {
          submittedResult = validatedEcPriceProgress(claimedJob.parameters, submittedResult);
        } else {
          return NextResponse.json({ error: "Invalid EC price checkpoint" }, { status: 400 });
        }
      } else {
        const plan = validatedFinalPricePlan(claimedJob.parameters, submittedResult);
        submittedResult = {
          ...submittedResult,
          plan,
          validated_plan_checkpoint: true,
        };
      }
    }
    if (claimedJob.task_key === "ec_product_name_update" && submittedResult) {
      if (!isFinal) {
        const eventType = String(body.eventType || "");
        if (eventType === "ec_product_name_plan_saved") {
          const plan = validatedProductNamePlan(claimedJob.parameters, submittedResult.plan);
          submittedResult = { ...submittedResult, plan, validated_plan_checkpoint: true };
        } else if (eventType === "ec_product_name_progress_checkpoint") {
          submittedResult = validatedProductNameProgress(claimedJob.parameters, submittedResult);
        } else {
          return NextResponse.json({ error: "Invalid EC product name checkpoint" }, { status: 400 });
        }
      } else {
        const plan = validatedFinalProductNamePlan(claimedJob.parameters, submittedResult);
        submittedResult = { ...submittedResult, plan, validated_plan_checkpoint: true };
      }
    }
    if (claimedJob.task_key === "ec_catchcopy_update" && submittedResult) {
      if (!isFinal) {
        const eventType = String(body.eventType || "");
        if (eventType === "ec_catchcopy_progress_checkpoint") {
          submittedResult = validatedCatchcopyProgress(claimedJob.parameters, submittedResult);
        } else {
          return NextResponse.json({ error: "Invalid EC catchcopy checkpoint" }, { status: 400 });
        }
      } else {
        const plan = validatedFinalCatchcopyPlan(claimedJob.parameters, submittedResult);
        submittedResult = { ...submittedResult, plan, validated_plan_checkpoint: true };
      }
    }

    let successfulSites: Record<string, any>[] = [];
    let tsgNotification: {
      claimed: number;
      posted: number;
      failed: number;
      error?: string;
    } | null = null;
    if (claimedJob.task_key === "ec_price_update" && isFinal) {
      validateFinalPriceResult(claimedJob, submittedResult, status);
      successfulSites = priceSyncRows(claimedJob, submittedResult, id, now);
    }
    if (claimedJob.task_key === "ec_product_name_update" && isFinal) {
      validateFinalProductNameResult(claimedJob, submittedResult, status);
      successfulSites = productNameSyncRows(claimedJob, submittedResult, id, now);
    }
    if (claimedJob.task_key === "ec_catchcopy_update" && isFinal) {
      validateFinalCatchcopyResult(claimedJob, submittedResult, status);
      successfulSites = catchcopySyncRows(claimedJob, submittedResult, id, now);
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
      if (status === "completed") {
        try {
          const jobParameters = asObject(claimedJob.parameters);
          const recipeId = String(jobParameters.recipeId || "");
          const batchId = String(jobParameters.batchId || "").trim();
          const dispatched = await dispatchRecipePriceTsgNotifications(supabase, {
            ...(batchId ? { batchId } : { recipeId }),
            limit: 5,
          });
          tsgNotification = {
            claimed: dispatched.claimed,
            posted: dispatched.posted,
            failed: dispatched.failed,
          };
        } catch (notificationError) {
          // EC/LP completion is authoritative. The durable TSG outbox retries hourly.
          tsgNotification = {
            claimed: 0,
            posted: 0,
            failed: 1,
            error: notificationError instanceof Error
              ? notificationError.message
              : "TSG価格変更報告を再試行待ちにしました",
          };
        }
      }
    } else if (claimedJob.task_key === "ec_product_name_update" && isFinal) {
      const { data: completed, error: completeError } = await supabase.rpc("complete_ec_product_name_codex_job", {
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
      if (status === "completed") {
        try {
          const jobParameters = asObject(claimedJob.parameters);
          const recipeId = String(jobParameters.recipeId || "");
          const batchId = String(jobParameters.batchId || "").trim();
          const dispatched = await dispatchRecipeProductNameTsgNotifications(supabase, {
            ...(batchId ? { batchId } : { recipeId }),
            limit: 5,
          });
          tsgNotification = {
            claimed: dispatched.claimed,
            posted: dispatched.posted,
            failed: dispatched.failed,
          };
        } catch (notificationError) {
          tsgNotification = {
            claimed: 0,
            posted: 0,
            failed: 1,
            error: notificationError instanceof Error
              ? notificationError.message
              : "TSG商品名変更報告を再試行待ちにしました",
          };
        }
      }
    } else if (claimedJob.task_key === "ec_catchcopy_update" && isFinal) {
      const { data: completed, error: completeError } = await supabase.rpc("complete_ec_catchcopy_codex_job", {
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
    return NextResponse.json({ ok: true, tsgNotification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job update failed" },
      { status: 400 },
    );
  }
}
