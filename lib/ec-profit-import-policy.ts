export type EcProfitCoverageLevel = "complete" | "partial" | "needs_review";

const COVERAGE_RANK: Record<EcProfitCoverageLevel, number> = {
  needs_review: 1,
  partial: 2,
  complete: 3,
};

export function shouldPreserveExistingEcProfit(
  existing: EcProfitCoverageLevel,
  incoming: EcProfitCoverageLevel,
) {
  return COVERAGE_RANK[existing] > COVERAGE_RANK[incoming];
}
