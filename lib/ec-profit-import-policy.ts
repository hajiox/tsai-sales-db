export type EcProfitCoverageLevel = "complete" | "partial" | "needs_review";

const COVERAGE_RANK: Record<EcProfitCoverageLevel, number> = {
  needs_review: 1,
  partial: 2,
  complete: 3,
};

export function shouldPreserveExistingEcProfit(
  existing: EcProfitCoverageLevel,
  incoming: EcProfitCoverageLevel,
  options: { existingHasOfficialSource?: boolean } = {},
) {
  // Ratio-based estimates have no source job. A lower-coverage official import
  // must still replace them so verified deductions are not hidden by a rank.
  if (options.existingHasOfficialSource === false) return false;
  return COVERAGE_RANK[existing] > COVERAGE_RANK[incoming];
}
