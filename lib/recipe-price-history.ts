export type PreviousRecipePrice = {
  previousPriceExTax: number;
  previousPriceInclTax: number;
  changedAt: string;
};

export type RecipePriceRevision = PreviousRecipePrice & {
  id: string;
  newPriceExTax: number;
  newPriceInclTax: number;
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

export function recipePriceRevisionFromRow(value: unknown): RecipePriceRevision | null {
  const revision = asRecord(value);
  const previousPrice = previousRecipePriceFromRevision(revision);
  if (!revision || !previousPrice) return null;

  const id = typeof revision.id === "string" ? revision.id.trim() : "";
  const newPriceExTax = Number(revision.new_price_ex_tax);
  const newPriceInclTax = Number(revision.new_price_incl_tax);
  if (
    !id
    || !Number.isFinite(newPriceExTax)
    || newPriceExTax <= 0
    || !Number.isInteger(newPriceInclTax)
    || newPriceInclTax <= 0
  ) {
    return null;
  }

  return { id, ...previousPrice, newPriceExTax, newPriceInclTax };
}

export function recipePriceHistoryFromRows(value: unknown): RecipePriceRevision[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const revision = recipePriceRevisionFromRow(row);
    return revision ? [revision] : [];
  });
}
