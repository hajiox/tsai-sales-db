export const EC_CATCHCOPY_TARGETS = [
  { id: "rakuten", label: "楽天" },
  { id: "yahoo", label: "Yahoo" },
] as const;

export type EcCatchcopyTarget = (typeof EC_CATCHCOPY_TARGETS)[number]["id"];
export type EcCatchcopiesBySite = Partial<Record<EcCatchcopyTarget, string>>;

export type EcCatchcopyRule = {
  platformMaxLength: number;
  generationMaxLength: number;
  fieldName: string;
  guidance: string;
};

export const EC_CATCHCOPY_AI_MODEL = "gpt-5.6-sol";
export const EC_CATCHCOPY_AI_REASONING_EFFORT = "medium";
export const EC_CATCHCOPY_AI_RULES_VERSION = "2026-08-25.1";

export const EC_CATCHCOPY_RULES: Record<EcCatchcopyTarget, EcCatchcopyRule> = {
  rakuten: {
    platformMaxLength: 87,
    generationMaxLength: 60,
    fieldName: "キャッチコピー",
    guidance: "商品の具体的な魅力を自然な一文で伝え、事実のない特典・受賞・限定表現を使わない",
  },
  yahoo: {
    platformMaxLength: 30,
    generationMaxLength: 30,
    fieldName: "キャッチコピー（headline）",
    guidance: "検索対象になるため、商品を特定できる重要語と魅力を全角30文字以内へ絞る",
  },
};

export type EcCatchcopyAiSuggestion = {
  catchcopy: string;
  selected_keywords: string[];
  rationale: string;
  cautions: string[];
};

export type EcCatchcopyAiResult = {
  overall_analysis: string;
  source_gaps: string[];
  suggestions: Record<EcCatchcopyTarget, EcCatchcopyAiSuggestion>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clippedText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeEcCatchcopyTargets(value: unknown): EcCatchcopyTarget[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<EcCatchcopyTarget>(EC_CATCHCOPY_TARGETS.map(({ id }) => id));
  return [...new Set(value.map((entry) => String(entry || "").trim().toLowerCase()))]
    .filter((entry): entry is EcCatchcopyTarget => allowed.has(entry as EcCatchcopyTarget));
}

export function getEcCatchcopyTargetLabel(targets: EcCatchcopyTarget[]) {
  return EC_CATCHCOPY_TARGETS
    .filter(({ id }) => targets.includes(id))
    .map(({ label }) => label)
    .join("・");
}

export function normalizeEcCatchcopyForTarget(target: EcCatchcopyTarget, value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EC_CATCHCOPY_RULES[target].platformMaxLength);
}

export function normalizeEcCatchcopiesBySite(value: unknown, fallback: unknown = ""): EcCatchcopiesBySite {
  const source = asObject(value);
  const fallbackValue = String(fallback ?? "").replace(/\s+/g, " ").trim();
  return Object.fromEntries(EC_CATCHCOPY_TARGETS.flatMap(({ id }) => {
    const candidate = normalizeEcCatchcopyForTarget(id, source[id] ?? fallbackValue);
    return candidate ? [[id, candidate]] : [];
  })) as EcCatchcopiesBySite;
}

export function ecCatchcopyMapsEqual(left: unknown, right: unknown, fallback: unknown = "") {
  const leftValues = normalizeEcCatchcopiesBySite(left, fallback);
  const rightValues = normalizeEcCatchcopiesBySite(right, fallback);
  return EC_CATCHCOPY_TARGETS.every(({ id }) => leftValues[id] === rightValues[id]);
}

export function validateEcCatchcopyAiResult(value: unknown): EcCatchcopyAiResult {
  const result = asObject(value);
  const suggestions = asObject(result.suggestions);
  const normalized = {} as Record<EcCatchcopyTarget, EcCatchcopyAiSuggestion>;
  for (const { id } of EC_CATCHCOPY_TARGETS) {
    const candidate = asObject(suggestions[id]);
    const rawCatchcopy = String(candidate.catchcopy ?? "").replace(/\s+/g, " ").trim();
    const catchcopy = normalizeEcCatchcopyForTarget(id, rawCatchcopy);
    if (!catchcopy || catchcopy !== rawCatchcopy) {
      throw new Error(`${id}のキャッチコピーが空欄または文字数上限を超えています`);
    }
    normalized[id] = {
      catchcopy,
      selected_keywords: Array.isArray(candidate.selected_keywords)
        ? candidate.selected_keywords.map((item) => clippedText(item, 80)).filter(Boolean).slice(0, 10)
        : [],
      rationale: clippedText(candidate.rationale, 500),
      cautions: Array.isArray(candidate.cautions)
        ? candidate.cautions.map((item) => clippedText(item, 200)).filter(Boolean).slice(0, 8)
        : [],
    };
  }
  return {
    overall_analysis: clippedText(result.overall_analysis, 1200),
    source_gaps: Array.isArray(result.source_gaps)
      ? result.source_gaps.map((item) => clippedText(item, 200)).filter(Boolean).slice(0, 12)
      : [],
    suggestions: normalized,
  };
}

export type EcCatchcopyJobSiteResult = {
  site: EcCatchcopyTarget;
  status: "updated" | "submitted_pending" | "not_found" | "blocked";
  final_catchcopy: string | null;
  product_identifier: string | null;
  message: string;
};

export type EcCatchcopyJobView = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  targets: EcCatchcopyTarget[];
  catchcopies: EcCatchcopiesBySite;
  summary: string | null;
  sites: EcCatchcopyJobSiteResult[];
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export type EcCatchcopyHistorySite = {
  site: EcCatchcopyTarget;
  status: EcCatchcopyJobSiteResult["status"];
  previousCatchcopy: string | null;
  newCatchcopy: string;
  finalCatchcopy: string | null;
  productIdentifier: string | null;
  message: string;
};

export type EcCatchcopyHistoryEntry = {
  id: string;
  status: EcCatchcopyJobView["status"];
  catchcopies: EcCatchcopiesBySite;
  summary: string | null;
  sites: EcCatchcopyHistorySite[];
  createdAt: string;
  completedAt: string | null;
};

function nullableCatchcopy(value: unknown, target?: EcCatchcopyTarget) {
  const text = target
    ? normalizeEcCatchcopyForTarget(target, value)
    : String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 87);
  return text || null;
}

export function ecCatchcopyHistoryEntryFromJob(value: unknown): EcCatchcopyHistoryEntry | null {
  const job = asObject(value);
  const parameters = asObject(job.parameters);
  const result = asObject(job.result);
  const plan = asObject(result.plan);
  const planSites = Array.isArray(plan.sites) ? plan.sites.map(asObject) : [];
  const resultSites = Array.isArray(result.sites) ? result.sites.map(asObject) : [];
  const targets = normalizeEcCatchcopyTargets(parameters.targets);
  const catchcopies = normalizeEcCatchcopiesBySite(parameters.catchcopies);
  const allowedStatuses = new Set<EcCatchcopyJobSiteResult["status"]>([
    "updated", "submitted_pending", "not_found", "blocked",
  ]);
  const sites = targets.flatMap((site): EcCatchcopyHistorySite[] => {
    const planned = planSites.find((entry) => entry.site === site);
    const final = resultSites.find((entry) => entry.site === site);
    const status = String(final?.status || "") as EcCatchcopyJobSiteResult["status"];
    if (!planned || !final || !allowedStatuses.has(status) || !catchcopies[site]) return [];
    return [{
      site,
      status,
      previousCatchcopy: nullableCatchcopy(planned.observed_catchcopy, site),
      newCatchcopy: nullableCatchcopy(planned.target_catchcopy, site) || catchcopies[site]!,
      finalCatchcopy: nullableCatchcopy(final.final_catchcopy, site),
      productIdentifier: String(final.product_identifier || planned.product_identifier || "").trim() || null,
      message: String(final.message || "").trim(),
    }];
  });
  const id = String(job.id || "").trim();
  const createdAt = String(job.created_at || "").trim();
  if (!id || !createdAt || sites.length === 0) return null;
  return {
    id,
    status: String(job.status || "needs_review") as EcCatchcopyJobView["status"],
    catchcopies,
    summary: result.summary ? String(result.summary) : null,
    sites,
    createdAt,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

export function ecCatchcopyHistoryFromJobs(value: unknown): EcCatchcopyHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((job) => {
    const entry = ecCatchcopyHistoryEntryFromJob(job);
    return entry ? [entry] : [];
  });
}
