import "server-only";
import registry from "@/lib/ec-price-verified-registry.json";
import type { EcPriceTarget } from "@/lib/ec-price-codex";

const TARGETS: EcPriceTarget[] = [
  "amazon",
  "rakuten",
  "yahoo",
  "mercari",
  "base",
  "qoo10",
  "tiktok",
];

export type EcPriceVerifiedIdentifier = {
  kind: string;
  value: string;
};

export type EcPriceVerifiedIdentifiers = Record<EcPriceTarget, EcPriceVerifiedIdentifier[]>;

export type EcPriceLpSource = {
  host: string;
  githubRepository: string;
  productionBranch: string;
};

function normalizeIdentifier(value: unknown): EcPriceVerifiedIdentifier | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const kind = String(candidate.kind || "").trim().toLowerCase();
  const identifier = String(candidate.value || "").trim();
  if (!/^[a-z][a-z0-9_]{0,49}$/.test(kind) || !identifier || identifier.length > 100) return null;
  return { kind, value: identifier };
}

function uniqueIdentifiers(values: unknown[]) {
  const byKey = new Map<string, EcPriceVerifiedIdentifier>();
  values.forEach((value) => {
    const identifier = normalizeIdentifier(value);
    if (!identifier) return;
    byKey.set(`${identifier.kind}:${identifier.value}`, identifier);
  });
  return [...byKey.values()].sort((left, right) =>
    `${left.kind}:${left.value}`.localeCompare(`${right.kind}:${right.value}`, "en"));
}

export function normalizeEcPriceVerifiedIdentifiers(
  input: unknown,
  targets: EcPriceTarget[],
): EcPriceVerifiedIdentifiers {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return Object.fromEntries(TARGETS.map((target) => [
    target,
    targets.includes(target) && Array.isArray(source[target])
      ? uniqueIdentifiers(source[target] as unknown[])
      : [],
  ])) as EcPriceVerifiedIdentifiers;
}

export function getEcPriceVerifiedIdentifiers(
  janCode: string | null,
  targets: EcPriceTarget[],
) {
  const normalizedJan = String(janCode || "").replace(/\D/g, "");
  const product = registry.products.find((entry) => entry.janCode === normalizedJan);
  return normalizeEcPriceVerifiedIdentifiers(product?.identifiers, targets);
}

export function ecPriceVerifiedIdentifiersMatch(
  left: unknown,
  right: EcPriceVerifiedIdentifiers,
) {
  const normalized = normalizeEcPriceVerifiedIdentifiers(left, TARGETS);
  return TARGETS.every((target) =>
    normalized[target].length === right[target].length
    && normalized[target].every((identifier, index) =>
      identifier.kind === right[target][index].kind
      && identifier.value === right[target][index].value));
}

export function getEcPriceLpSource(lpUrl: string | null): EcPriceLpSource | null {
  if (!lpUrl) return null;
  try {
    const host = new URL(lpUrl).hostname.toLowerCase();
    const source = registry.lpSources.find((entry) => entry.host.toLowerCase() === host);
    if (!source) return null;
    return {
      host,
      githubRepository: source.githubRepository,
      productionBranch: source.productionBranch,
    };
  } catch {
    return null;
  }
}

export function ecPriceLpSourcesMatch(left: unknown, right: EcPriceLpSource | null) {
  if (right === null) return left == null;
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return String(candidate.host || "").toLowerCase() === right.host
    && String(candidate.githubRepository || "") === right.githubRepository
    && String(candidate.productionBranch || "") === right.productionBranch;
}
