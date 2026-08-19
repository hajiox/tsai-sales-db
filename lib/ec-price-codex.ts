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

export type EcPriceJobView = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  targets: EcPriceTarget[];
  newPriceInclTax: number;
  summary: string | null;
  sites: EcPriceJobSiteResult[];
  createdAt: string;
  completedAt: string | null;
};
