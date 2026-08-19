export type PreviousRecipePrice = {
  previousPriceExTax: number;
  previousPriceInclTax: number;
  changedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function previousRecipePriceFromRevision(value: unknown): PreviousRecipePrice | null {
  const revision = asRecord(value);
  if (!revision) return null;

  const previousPriceExTax = Number(revision.previous_price_ex_tax);
  const previousPriceInclTax = Number(revision.previous_price_incl_tax);
  const changedAt = typeof revision.created_at === "string" ? revision.created_at : "";
  if (
    !Number.isFinite(previousPriceExTax)
    || previousPriceExTax <= 0
    || !Number.isInteger(previousPriceInclTax)
    || previousPriceInclTax <= 0
    || !changedAt
  ) {
    return null;
  }

  return { previousPriceExTax, previousPriceInclTax, changedAt };
}
