export const EC_PRODUCT_CONTENT_TARGETS = [
  { id: "amazon", label: "Amazon" },
  { id: "rakuten", label: "楽天" },
  { id: "yahoo", label: "Yahoo" },
  { id: "mercari", label: "メルカリ" },
  { id: "base", label: "BASE" },
  { id: "qoo10", label: "Qoo10" },
  { id: "tiktok", label: "TikTok" },
] as const;

export type EcProductContentTarget = (typeof EC_PRODUCT_CONTENT_TARGETS)[number]["id"];
export type EcProductContentFieldLayout = "separate" | "combined";
export type EcProductContentMarkerStyle = "check" | "square";

export const EC_PRODUCT_CONTENT_MAX_CHARACTERS = 500;
export const EC_PRODUCT_CONTENT_AI_MODEL = "gpt-5.6-sol";
export const EC_PRODUCT_CONTENT_AI_REASONING_EFFORT = "medium";
export const EC_PRODUCT_CONTENT_RULES_VERSION = "2026-08-27.1";

const SQUARE_MARKER_TARGETS = new Set<EcProductContentTarget>(["rakuten", "yahoo"]);

export type EcProductContentTargetValue = {
  fieldLayout: EcProductContentFieldLayout;
  markerStyle: EcProductContentMarkerStyle;
  productPoints: string;
  webDescription: string;
  combinedContent: string | null;
};

export type EcProductContentAiResult = {
  product_points: string;
  web_description: string;
  total_characters: number;
  preserved_facts: string[];
  removed_or_condensed: string[];
  rationale: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clippedText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeEcProductContentText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toSquareProductPoints(value: unknown) {
  return normalizeEcProductContentText(value)
    .replace(/✅\uFE0F?/g, "■")
    .replace(/☑\uFE0F?/g, "■");
}

export function toCheckProductPoints(value: unknown) {
  return toSquareProductPoints(value).replace(/■/g, "✅️");
}

export function ecProductContentCharacterCount(productPoints: unknown, webDescription: unknown) {
  return toSquareProductPoints(productPoints).length + normalizeEcProductContentText(webDescription).length;
}

export function normalizeEcProductContentTargets(value: unknown): EcProductContentTarget[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<EcProductContentTarget>(EC_PRODUCT_CONTENT_TARGETS.map(({ id }) => id));
  return [...new Set(value.map((entry) => String(entry || "").trim().toLowerCase()))]
    .filter((entry): entry is EcProductContentTarget => allowed.has(entry as EcProductContentTarget));
}

export function getEcProductContentTargetLabel(targets: EcProductContentTarget[]) {
  return EC_PRODUCT_CONTENT_TARGETS
    .filter(({ id }) => targets.includes(id))
    .map(({ label }) => label)
    .join("・");
}

export function buildEcProductContentForTarget(
  target: EcProductContentTarget,
  productPointsInput: unknown,
  webDescriptionInput: unknown,
): EcProductContentTargetValue {
  const canonicalPoints = toSquareProductPoints(productPointsInput);
  const webDescription = normalizeEcProductContentText(webDescriptionInput);
  const markerStyle: EcProductContentMarkerStyle = SQUARE_MARKER_TARGETS.has(target) ? "square" : "check";
  const productPoints = markerStyle === "square" ? canonicalPoints : toCheckProductPoints(canonicalPoints);
  const fieldLayout: EcProductContentFieldLayout = target === "amazon" ? "separate" : "combined";
  return {
    fieldLayout,
    markerStyle,
    productPoints,
    webDescription,
    combinedContent: fieldLayout === "combined"
      ? [productPoints, webDescription].filter(Boolean).join("\n\n")
      : null,
  };
}

export function buildEcProductContents(
  targets: EcProductContentTarget[],
  productPoints: unknown,
  webDescription: unknown,
) {
  return Object.fromEntries(targets.map((target) => [
    target,
    buildEcProductContentForTarget(target, productPoints, webDescription),
  ])) as Record<EcProductContentTarget, EcProductContentTargetValue>;
}

export function ecProductContentValuesEqual(left: unknown, right: unknown) {
  const a = asObject(left);
  const b = asObject(right);
  return a.fieldLayout === b.fieldLayout
    && a.markerStyle === b.markerStyle
    && normalizeEcProductContentText(a.productPoints) === normalizeEcProductContentText(b.productPoints)
    && normalizeEcProductContentText(a.webDescription) === normalizeEcProductContentText(b.webDescription)
    && normalizeEcProductContentText(a.combinedContent) === normalizeEcProductContentText(b.combinedContent);
}

export function validateEcProductContentAiResult(value: unknown): EcProductContentAiResult {
  const result = asObject(value);
  const productPoints = toSquareProductPoints(result.product_points);
  const webDescription = normalizeEcProductContentText(result.web_description);
  const totalCharacters = ecProductContentCharacterCount(productPoints, webDescription);
  if (!productPoints && !webDescription) throw new Error("調整後の商品ポイントと商品説明が空欄です");
  if (totalCharacters > EC_PRODUCT_CONTENT_MAX_CHARACTERS) {
    throw new Error(`調整後の合計が${EC_PRODUCT_CONTENT_MAX_CHARACTERS}文字を超えています`);
  }
  return {
    product_points: productPoints,
    web_description: webDescription,
    total_characters: totalCharacters,
    preserved_facts: Array.isArray(result.preserved_facts)
      ? result.preserved_facts.map((item) => clippedText(item, 200)).filter(Boolean).slice(0, 20)
      : [],
    removed_or_condensed: Array.isArray(result.removed_or_condensed)
      ? result.removed_or_condensed.map((item) => clippedText(item, 200)).filter(Boolean).slice(0, 20)
      : [],
    rationale: clippedText(result.rationale, 1000),
  };
}

export type EcProductContentJobSiteResult = {
  site: EcProductContentTarget;
  status: "updated" | "submitted_pending" | "not_found" | "blocked";
  finalProductPoints: string | null;
  finalWebDescription: string | null;
  finalCombinedContent: string | null;
  productIdentifier: string | null;
  message: string;
};

export type EcProductContentJobView = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  targets: EcProductContentTarget[];
  summary: string | null;
  sites: EcProductContentJobSiteResult[];
  createdAt: string;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export function ecProductContentJobViewFromRow(value: unknown): EcProductContentJobView | null {
  const row = asObject(value);
  const parameters = asObject(row.parameters);
  const result = asObject(row.result);
  const targets = normalizeEcProductContentTargets(parameters.targets);
  const allowedStatuses = new Set(["updated", "submitted_pending", "not_found", "blocked"]);
  const sites = Array.isArray(result.sites) ? result.sites.flatMap((entry): EcProductContentJobSiteResult[] => {
    const site = asObject(entry);
    const target = String(site.site || "") as EcProductContentTarget;
    const status = String(site.status || "") as EcProductContentJobSiteResult["status"];
    if (!targets.includes(target) || !allowedStatuses.has(status)) return [];
    return [{
      site: target,
      status,
      finalProductPoints: site.final_product_points == null ? null : normalizeEcProductContentText(site.final_product_points),
      finalWebDescription: site.final_web_description == null ? null : normalizeEcProductContentText(site.final_web_description),
      finalCombinedContent: site.final_combined_content == null ? null : normalizeEcProductContentText(site.final_combined_content),
      productIdentifier: String(site.product_identifier || "").trim() || null,
      message: String(site.message || "").trim(),
    }];
  }) : [];
  const id = String(row.id || "").trim();
  if (!id) return null;
  return {
    id,
    status: String(row.status || "queued") as EcProductContentJobView["status"],
    progress: Math.max(0, Math.min(100, Number(row.progress) || 0)),
    currentStep: String(row.current_step || "実行待ち"),
    errorMessage: row.error_message ? String(row.error_message) : null,
    targets,
    summary: result.summary ? String(result.summary) : null,
    sites,
    createdAt: String(row.created_at || ""),
    startedAt: row.started_at ? String(row.started_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}
