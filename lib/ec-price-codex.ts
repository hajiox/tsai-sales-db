export const EC_PRICE_TARGETS = [
  { id: "amazon", label: "Amazon" },
  { id: "rakuten", label: "楽天" },
  { id: "yahoo", label: "Yahoo" },
  { id: "mercari", label: "メルカリ" },
  { id: "base", label: "BASE" },
  { id: "qoo10", label: "Qoo10" },
  { id: "tiktok", label: "TikTok" },
] as const;

export type EcPriceTarget = (typeof EC_PRICE_TARGETS)[number]["id"];

const TARGET_IDS = new Set<string>(EC_PRICE_TARGETS.map((target) => target.id));

export function normalizeEcPriceTargets(input: unknown): EcPriceTarget[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((value) => String(value).trim().toLowerCase())
        .filter((value): value is EcPriceTarget => TARGET_IDS.has(value)),
    ),
  );
}

export function getEcPriceTargetLabel(targets: EcPriceTarget[]) {
  if (targets.length === EC_PRICE_TARGETS.length) return "全ECサイト";
  const labels = new Map(EC_PRICE_TARGETS.map((target) => [target.id, target.label]));
  return targets.map((target) => labels.get(target) || target).join("・");
}

export type EcPriceJobSiteResult = {
  site: EcPriceTarget;
  status: "updated" | "submitted_pending" | "not_found" | "blocked";
  final_price: number | null;
  product_identifier: string | null;
  message: string;
};

export type EcPriceJobLpResult = {
  required: boolean;
  url: string | null;
  status: "updated" | "not_applicable" | "not_found" | "blocked";
  final_prices: number[];
  changed_files: string[];
  deployment_url: string | null;
  deployed_commit: string | null;
  message: string;
};

export type EcPriceJobView = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  isReserved?: boolean;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  targets: EcPriceTarget[];
  newPriceInclTax: number;
  summary: string | null;
  planValidated: boolean;
  sites: EcPriceJobSiteResult[];
  lp: EcPriceJobLpResult | null;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  retryScope?: EcPriceRetryScope;
};

export type EcPriceRetryScope = {
  targets: EcPriceTarget[];
  verificationOnlyTargets: EcPriceTarget[];
  lpUpdate: boolean;
};

export function getEcPriceRetryTargets(
  targetsInput: unknown,
  sitesInput: unknown,
  planValidated: boolean,
) {
  const targets = normalizeEcPriceTargets(targetsInput);
  if (!planValidated) return targets;
  const sites = Array.isArray(sitesInput) ? sitesInput.map(asObject) : [];
  return targets.filter((target) => {
    const site = sites.find((candidate) => candidate.site === target);
    return !site || site.status === "blocked" || site.status === "submitted_pending";
  });
}

// Retries contain only their own targets. Keep the latest result for each
// attempted target in this exact price revision, rather than treating the
// latest LP-only result as completion of the earlier EC work.
export function getEcPriceRetryScope(jobsInput: unknown, sourceInput: unknown): EcPriceRetryScope {
  const source = asObject(sourceInput);
  const sourceParameters = asObject(source.parameters);
  const sourceSnapshot = asObject(sourceParameters.recipeSnapshot);
  const snapshotKeys = Object.keys(sourceSnapshot);
  const jobs = (Array.isArray(jobsInput) ? jobsInput : []).map(asObject)
    .filter((job) => {
      const parameters = asObject(job.parameters);
      const snapshot = asObject(parameters.recipeSnapshot);
      return snapshotKeys.length > 0
        && parameters.recipeId === sourceParameters.recipeId
        && Number(parameters.newPriceInclTax) === Number(sourceParameters.newPriceInclTax)
        && (parameters.priceRevisionId || null) === (sourceParameters.priceRevisionId || null)
        && Object.keys(snapshot).length === snapshotKeys.length
        && snapshotKeys.every((key) => snapshot[key] === sourceSnapshot[key]);
    })
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
  const siteStates = new Map<EcPriceTarget, { retry: boolean; verificationOnly: boolean }>();
  let lpUpdate: boolean | null = null;
  for (const job of jobs) {
    const parameters = asObject(job.parameters);
    const result = asObject(job.result);
    const targets = normalizeEcPriceTargets(parameters.targets);
    const sites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
    const retryTargets = getEcPriceRetryTargets(targets, sites, result.validated_plan_checkpoint === true);
    for (const target of targets) {
      if (siteStates.has(target)) continue;
      const site = sites.find((candidate) => candidate.site === target);
      siteStates.set(target, {
        retry: retryTargets.includes(target),
        verificationOnly: site?.status === "submitted_pending"
          || normalizeEcPriceTargets(parameters.verificationOnlyTargets).includes(target),
      });
    }
    if (lpUpdate === null && parameters.lpUpdate === true) {
      lpUpdate = Boolean(sourceSnapshot.productLpUrl) && ecPriceLpResultFromUnknown(result.lp)?.status !== "updated";
    }
  }
  const targets = EC_PRICE_TARGETS.map(({ id }) => id).filter((target) => siteStates.get(target)?.retry);
  return {
    targets,
    verificationOnlyTargets: targets.filter((target) => siteStates.get(target)?.verificationOnly),
    lpUpdate: lpUpdate === true,
  };
}

export type EcPriceHistorySite = {
  site: EcPriceTarget;
  status: EcPriceJobSiteResult["status"];
  previousPrice: number;
  newPrice: number;
  finalPrice: number | null;
  productIdentifier: string | null;
  message: string;
};

export type EcPriceHistoryEntry = {
  id: string;
  status: EcPriceJobView["status"];
  newStandardPrice: number;
  summary: string | null;
  sites: EcPriceHistorySite[];
  lp: EcPriceJobLpResult | null;
  createdAt: string;
  completedAt: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function ecPriceLpResultFromUnknown(value: unknown): EcPriceJobLpResult | null {
  const lp = asObject(value);
  const status = String(lp.status || "") as EcPriceJobLpResult["status"];
  if (!["updated", "not_applicable", "not_found", "blocked"].includes(status)) return null;
  return {
    required: lp.required === true,
    url: String(lp.url || "").trim() || null,
    status,
    final_prices: Array.isArray(lp.final_prices)
      ? lp.final_prices
        .map((price) => positiveInteger(price))
        .filter((price): price is number => price !== null)
      : [],
    changed_files: Array.isArray(lp.changed_files)
      ? lp.changed_files.map((file) => String(file).trim()).filter(Boolean)
      : [],
    deployment_url: String(lp.deployment_url || "").trim() || null,
    deployed_commit: String(lp.deployed_commit || "").trim() || null,
    message: String(lp.message || "").trim(),
  };
}

export function ecPriceHistoryEntryFromJob(value: unknown): EcPriceHistoryEntry | null {
  const job = asObject(value);
  const parameters = asObject(job.parameters);
  const result = asObject(job.result);
  const plan = asObject(result.plan);
  const planSites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  const resultSites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const targets = normalizeEcPriceTargets(parameters.targets);
  const allowedSiteStatuses = new Set<EcPriceJobSiteResult["status"]>([
    "updated",
    "submitted_pending",
    "not_found",
    "blocked",
  ]);

  const sites = targets.flatMap((site): EcPriceHistorySite[] => {
    const planned = planSites.find((entry) => entry.site === site);
    const final = resultSites.find((entry) => entry.site === site);
    const previousPrice = positiveInteger(planned?.basis_price);
    const newPrice = positiveInteger(planned?.target_price);
    const siteStatus = String(final?.status || "") as EcPriceJobSiteResult["status"];
    if (!planned || !final || !previousPrice || !newPrice || !allowedSiteStatuses.has(siteStatus)) return [];

    const finalPrice = positiveInteger(final.final_price);
    const productIdentifier = String(final.product_identifier || planned.product_identifier || "").trim() || null;
    return [{
      site,
      status: siteStatus,
      previousPrice,
      newPrice,
      finalPrice,
      productIdentifier,
      message: String(final.message || "").trim(),
    }];
  });
  if (sites.length === 0) return null;

  const id = String(job.id || "").trim();
  const createdAt = String(job.created_at || "").trim();
  const newStandardPrice = positiveInteger(parameters.newPriceInclTax);
  if (!id || !createdAt || !newStandardPrice) return null;

  return {
    id,
    status: String(job.status || "needs_review") as EcPriceJobView["status"],
    newStandardPrice,
    summary: result.summary ? String(result.summary) : null,
    sites,
    lp: ecPriceLpResultFromUnknown(result.lp),
    createdAt,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

export function ecPriceHistoryFromJobs(value: unknown): EcPriceHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((job) => {
    const entry = ecPriceHistoryEntryFromJob(job);
    return entry ? [entry] : [];
  });
}
