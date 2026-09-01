import assert from "node:assert/strict";
import { shouldPreserveExistingEcProfit } from "../lib/ec-profit-import-policy.ts";

assert.equal(shouldPreserveExistingEcProfit("complete", "partial"), true);
assert.equal(shouldPreserveExistingEcProfit("partial", "needs_review"), true);
assert.equal(shouldPreserveExistingEcProfit("partial", "needs_review", {
  existingHasOfficialSource: false,
}), false, "an official import must replace a ratio-based estimate");
assert.equal(shouldPreserveExistingEcProfit("partial", "needs_review", {
  existingHasOfficialSource: true,
}), true, "a weaker retry must not replace an official partial import");
assert.equal(shouldPreserveExistingEcProfit("partial", "partial"), false);
assert.equal(shouldPreserveExistingEcProfit("needs_review", "partial"), false);
assert.equal(shouldPreserveExistingEcProfit("needs_review", "complete"), false);

console.log("EC profit import coverage policy checks passed.");
