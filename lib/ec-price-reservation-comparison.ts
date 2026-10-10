import { normalizeEcPriceTargets, type EcPriceTarget } from "@/lib/ec-price-codex";

export type EcPriceReservationComparison = {
  targets: EcPriceTarget[];
  previousPriceInclTax: number | null;
  newPriceInclTax: number;
  differenceInclTax: number | null;
  changePercent: number | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function getEcPriceReservationComparisons(parameters: unknown): EcPriceReservationComparison[] {
  const source = asObject(parameters);
  const targets = normalizeEcPriceTargets(source.targets);
  const siteBaselines = asObject(source.siteBaselines);
  const newPriceInclTax = positiveInteger(source.newPriceInclTax) ?? 0;
  const groups = new Map<number | null, EcPriceReservationComparison>();

  for (const target of targets) {
    // The reservation locks this pre-change standard price. A later recipe edit
    // or EC sync must not change the comparison shown for this reservation.
    const previousPriceInclTax = positiveInteger(siteBaselines[target]);
    const existing = groups.get(previousPriceInclTax);
    if (existing) {
      existing.targets.push(target);
      continue;
    }
    const differenceInclTax = previousPriceInclTax !== null && newPriceInclTax > 0
      ? newPriceInclTax - previousPriceInclTax
      : null;
    groups.set(previousPriceInclTax, {
      targets: [target],
      previousPriceInclTax,
      newPriceInclTax,
      differenceInclTax,
      changePercent: differenceInclTax !== null && previousPriceInclTax !== null
        ? differenceInclTax / previousPriceInclTax * 100
        : null,
    });
  }

  return [...groups.values()];
}
