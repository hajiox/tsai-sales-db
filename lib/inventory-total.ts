// Only calculated stocktake amounts. Never apply this to unit prices or quantities.
export function truncateInventoryYen(value: number): number {
  if (!Number.isFinite(value)) return value;
  const nearest = Math.round(value);
  const normalized = Math.abs(value - nearest) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 2 ? nearest : value;
  return Math.trunc(normalized) || 0;
}
