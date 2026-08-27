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

export type EcProductNamesBySite = Partial<Record<EcProductNameTarget, string>>;

export type EcProductNameRule = {
  platformMaxLength: number;
  generationMaxLength: number;
  guidance: string;
};

export const EC_PRODUCT_NAME_AI_MODEL = "gpt-5.6-sol";
export const EC_PRODUCT_NAME_AI_REASONING_EFFORT = "medium";
export const EC_PRODUCT_NAME_AI_RULES_VERSION = "2026-08-27.1";
export const EC_COMMON_PRODUCT_NAME_MAX_LENGTH = 75;

export type EcProductNameAiSuggestion = {
  name: string;
  selected_keywords: string[];
  rationale: string;
  cautions: string[];
};

export type EcProductNameAiResult = {
  overall_analysis: string;
  source_gaps: string[];
  suggestion: EcProductNameAiSuggestion;
};

export const EC_PRODUCT_NAME_RULES: Record<EcProductNameTarget, EcProductNameRule> = {
  amazon: {
    platformMaxLength: 75,
    generationMaxLength: 75,
    guidance: "主要検索語と商品種別を前半へ置き、販促文句・重複語・記号の乱用を避ける",
  },
  rakuten: {
    platformMaxLength: 127,
    generationMaxLength: 110,
    guidance: "商品を特定できる語を前半へ置き、自然な日本語で検索語を補完する",
  },
  yahoo: {
    platformMaxLength: 75,
    generationMaxLength: 75,
    guidance: "検索対象となる商品名に重要語を絞り、読みやすさと商品同定を優先する",
  },
  mercari: {
    platformMaxLength: 130,
    generationMaxLength: 65,
    guidance: "推奨65文字以内で、商品名・内容量・主要特徴を簡潔に示す",
  },
  base: {
    platformMaxLength: 255,
    generationMaxLength: 120,
    guidance: "一覧と検索の双方で伝わる自然な名称にし、絵文字や機種依存文字を使わない",
  },
  qoo10: {
    platformMaxLength: 100,
    generationMaxLength: 100,
    guidance: "商品種別と差別化要素を前半へ置き、無関係な検索語や販促表現を入れない",
  },
  tiktok: {
    platformMaxLength: 255,
    generationMaxLength: 150,
    guidance: "40〜150文字を目安にブランド・商品種別・内容量・根拠のある特徴を明確にする",
  },
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clippedText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function validateEcProductNameAiResult(value: unknown): EcProductNameAiResult {
  const result = asObject(value);
  let candidate = asObject(result.suggestion);
  if (Object.keys(candidate).length === 0) {
    const legacySuggestions = asObject(result.suggestions);
    const legacyCandidates = EC_PRODUCT_NAME_TARGETS.map(({ id }) => asObject(legacySuggestions[id]));
    const legacyNames = legacyCandidates.map((entry) => normalizeCommonEcProductName(entry.name));
    if (!legacyNames[0] || legacyNames.some((name) => name !== legacyNames[0])) {
      throw new Error("全ECで統一する商品名候補がありません");
    }
    candidate = legacyCandidates[0];
  }
  const rawName = String(candidate.name ?? "").replace(/\s+/g, " ").trim();
  const name = normalizeCommonEcProductName(rawName);
  if (!name || name !== rawName) {
    throw new Error(`共通商品名が空欄または${EC_COMMON_PRODUCT_NAME_MAX_LENGTH}文字上限を超えています`);
  }
  return {
    overall_analysis: clippedText(result.overall_analysis, 1200),
    source_gaps: Array.isArray(result.source_gaps)
      ? result.source_gaps.map((item) => clippedText(item, 200)).filter(Boolean).slice(0, 12)
      : [],
    suggestion: {
      name,
      selected_keywords: Array.isArray(candidate.selected_keywords)
        ? candidate.selected_keywords.map((item) => clippedText(item, 80)).filter(Boolean).slice(0, 10)
        : [],
      rationale: clippedText(candidate.rationale, 500),
      cautions: Array.isArray(candidate.cautions)
        ? candidate.cautions.map((item) => clippedText(item, 200)).filter(Boolean).slice(0, 8)
        : [],
    },
  };
}

export function normalizeCommonEcProductName(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EC_COMMON_PRODUCT_NAME_MAX_LENGTH);
}

export function buildUnifiedEcProductNames(value: unknown): EcProductNamesBySite {
  const name = normalizeCommonEcProductName(value);
  if (!name) return {};
  return Object.fromEntries(
    EC_PRODUCT_NAME_TARGETS.map(({ id }) => [id, name]),
  ) as EcProductNamesBySite;
}

export function normalizeEcProductNameForTarget(target: EcProductNameTarget, value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EC_PRODUCT_NAME_RULES[target].platformMaxLength);
}

export function normalizeEcProductNamesBySite(
  value: unknown,
  fallback: unknown = "",
): EcProductNamesBySite {
  const source = asObject(value);
  const fallbackName = String(fallback ?? "").replace(/\s+/g, " ").trim();
  return Object.fromEntries(EC_PRODUCT_NAME_TARGETS.flatMap(({ id }) => {
    const candidate = normalizeEcProductNameForTarget(id, source[id] ?? fallbackName);
    return candidate ? [[id, candidate]] : [];
  })) as EcProductNamesBySite;
}

export function resolveEcProductNameForTarget(
  target: EcProductNameTarget,
  value: unknown,
  fallback: unknown = "",
) {
  const source = asObject(value);
  return normalizeEcProductNameForTarget(target, source[target] ?? fallback);
}

export function ecProductNameMapsEqual(left: unknown, right: unknown, fallback: unknown = "") {
  const leftNames = normalizeEcProductNamesBySite(left, fallback);
  const rightNames = normalizeEcProductNamesBySite(right, fallback);
  return EC_PRODUCT_NAME_TARGETS.every(({ id }) => leftNames[id] === rightNames[id]);
}

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
  newProductNames: EcProductNamesBySite;
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
  newProductNames: EcProductNamesBySite;
  summary: string | null;
  sites: EcProductNameHistorySite[];
  createdAt: string;
  completedAt: string | null;
};

function nullableName(value: unknown) {
  const name = String(value ?? "").trim();
  return name ? name.slice(0, 255) : null;
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
  const newProductNames = normalizeEcProductNamesBySite(parameters.newProductNames, newProductName);
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
      newName: nullableName(planned.target_name) || newProductNames[site] || newProductName,
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
    newProductNames,
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
