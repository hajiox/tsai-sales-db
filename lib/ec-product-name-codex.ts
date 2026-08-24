import {
  EC_PRICE_TARGETS,
  getEcPriceTargetLabel,
  normalizeEcPriceTargets,
  type EcPriceTarget,
} from "@/lib/ec-price-codex";

export const EC_PRODUCT_NAME_TARGETS = EC_PRICE_TARGETS;
export type EcProductNameTarget = EcPriceTarget;
export const normalizeEcProductNameTargets = normalizeEcPriceTargets;
export const getEcProductNameTargetLabel = getEcPriceTargetLabel;

export type EcProductNameJobSiteResult = {
  site: EcProductNameTarget;
  status: "updated" | "submitted_pending" | "not_found" | "blocked";
  final_name: string | null;
  product_identifier: string | null;
  message: string;
};

export type EcProductNameJobView = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  targets: EcProductNameTarget[];
  newProductName: string;
  summary: string | null;
  sites: EcProductNameJobSiteResult[];
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export type EcProductNameHistorySite = {
  site: EcProductNameTarget;
  status: EcProductNameJobSiteResult["status"];
  previousName: string | null;
  newName: string;
  finalName: string | null;
  productIdentifier: string | null;
  message: string;
};

export type EcProductNameHistoryEntry = {
  id: string;
  status: EcProductNameJobView["status"];
  newProductName: string;
  summary: string | null;
  sites: EcProductNameHistorySite[];
  createdAt: string;
  completedAt: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableName(value: unknown) {
  const name = String(value ?? "").trim();
  return name ? name.slice(0, 200) : null;
}

export function ecProductNameHistoryEntryFromJob(value: unknown): EcProductNameHistoryEntry | null {
  const job = asObject(value);
  const parameters = asObject(job.parameters);
  const result = asObject(job.result);
  const plan = asObject(result.plan);
  const planSites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  const resultSites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const targets = normalizeEcProductNameTargets(parameters.targets);
  const newProductName = nullableName(parameters.newProductName);
  const allowedStatuses = new Set<EcProductNameJobSiteResult["status"]>([
    "updated",
    "submitted_pending",
    "not_found",
    "blocked",
  ]);
  if (!newProductName) return null;

  const sites = targets.flatMap((site): EcProductNameHistorySite[] => {
    const planned = planSites.find((entry) => entry.site === site);
    const final = resultSites.find((entry) => entry.site === site);
    const status = String(final?.status || "") as EcProductNameJobSiteResult["status"];
    if (!planned || !final || !allowedStatuses.has(status)) return [];
    return [{
      site,
      status,
      previousName: nullableName(planned.observed_name),
      newName: nullableName(planned.target_name) || newProductName,
      finalName: nullableName(final.final_name),
      productIdentifier: nullableName(final.product_identifier || planned.product_identifier),
      message: String(final.message || "").trim(),
    }];
  });
  if (sites.length === 0) return null;

  const id = String(job.id || "").trim();
  const createdAt = String(job.created_at || "").trim();
  if (!id || !createdAt) return null;
  return {
    id,
    status: String(job.status || "needs_review") as EcProductNameJobView["status"],
    newProductName,
    summary: result.summary ? String(result.summary) : null,
    sites,
    createdAt,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

export function ecProductNameHistoryFromJobs(value: unknown): EcProductNameHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((job) => {
    const entry = ecProductNameHistoryEntryFromJob(job);
    return entry ? [entry] : [];
  });
}
