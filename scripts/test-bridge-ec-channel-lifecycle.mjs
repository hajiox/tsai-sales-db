import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ecJobLifecycleStop, isRetiredEcArchiveJob } from "../tools/tsa-codex-bridge/ec-channel-lifecycle.mjs";

for (const channel of ["mercari", "qoo10", "tiktok"]) {
  for (const task_key of ["web_sales_import", "ec_profit_import", "ad_cost_import"]) {
    // A September request must never restart a retired shop's live acquisition.
    assert.ok(ecJobLifecycleStop({ task_key, channel, period_start: "2026-09-01", period_end: "2026-09-30" }));
    assert.ok(ecJobLifecycleStop({ task_key, channel, period_start: "2026-10-01", period_end: "2026-10-10" }));
  }
  assert.equal(isRetiredEcArchiveJob({ task_key: "web_sales_import", channel, period_start: "2026-09-01", period_end: "2026-09-30" }), true);
  assert.equal(isRetiredEcArchiveJob({ task_key: "ec_profit_import", channel, period_start: "2026-09-01", period_end: "2026-10-01" }), false);
  assert.equal(isRetiredEcArchiveJob({ task_key: "web_sales_import", channel, period_start: "2026-02-30", period_end: "2026-09-30" }), false);
  assert.ok(ecJobLifecycleStop({ task_key: "ec_product_register", parameters: { target: channel } }));
  assert.ok(ecJobLifecycleStop({ task_key: "ec_price_update", parameters: { targets: ["amazon", channel] } }));
  assert.ok(ecJobLifecycleStop({ task_key: "ec_product_name_update", parameters: { targets: [channel] } }));
  assert.ok(ecJobLifecycleStop({ task_key: "ec_product_content_update", parameters: { targets: [channel] } }));
  assert.ok(ecJobLifecycleStop({ task_key: "recipe_reviews_collect" }, { sources: [{ channel }] }));
  assert.equal(ecJobLifecycleStop({ task_key: "recipe_reviews_analyze", channel }), null);
  assert.equal(ecJobLifecycleStop({ task_key: "web_sales_analysis", channel }), null);
}
for (const channel of ["amazon", "rakuten", "yahoo", "base"]) {
  assert.equal(ecJobLifecycleStop({ task_key: "web_sales_import", channel }), null);
  assert.equal(ecJobLifecycleStop({ task_key: "ec_price_update", parameters: { targets: [channel] } }), null);
}
assert.ok(ecJobLifecycleStop({ task_key: "web_sales_import", channel: "makeshop", period_start: "2026-09-01", period_end: "2026-09-30" }));
assert.ok(ecJobLifecycleStop({ task_key: "recipe_reviews_collect" }, { sources: [{ channel: "makeshop" }] }));
assert.equal(isRetiredEcArchiveJob({ task_key: "web_sales_import", channel: "makeshop", period_start: "2026-09-01", period_end: "2026-09-30" }), false);

const bridge = readFileSync(new URL("../tools/tsa-codex-bridge/bridge.mjs", import.meta.url), "utf8");
const entry = bridge.slice(bridge.indexOf("async function executeJob(job)"), bridge.indexOf('if (job.task_key === "connection_test")'));
assert.ok(entry.indexOf("tryReuseSalesArtifacts") < entry.indexOf("stopInactiveEcJob"));
assert.ok(entry.indexOf("tryReuseEcProfitJson") < entry.indexOf("stopInactiveEcJob"));
assert.doesNotMatch(entry, /acquireQoo10OfficialSales|spawnSkillCodex/);
assert.match(bridge, /if \(collecting && await stopInactiveEcJob\(job, packet\)\) return;/);
const validatorSource = bridge.slice(bridge.indexOf("function validateEcProductNameGenerateJobParameters"), bridge.indexOf("async function executeEcProductNameGenerateJob"));
const limits = { amazon: 75, rakuten: 127, yahoo: 75, base: 255, mercari: 130, qoo10: 100, tiktok: 255 };
const validateName = vm.runInNewContext(`(${validatorSource.trim()})`, {
  EC_PRICE_TARGETS: new Set(Object.keys(limits)), ACTIVE_EC_PRODUCT_TARGETS: new Set(["amazon", "rakuten", "yahoo", "base"]),
  EC_PRODUCT_NAME_MAX_LENGTHS: limits, EC_COMMON_PRODUCT_NAME_MAX_LENGTH: 75,
  acceptsTaskModelParameters: () => true, taskModelPolicy: () => ({}),
});
function namePacket(targets) {
  return { recipeId: "recipe", sourceSnapshot: { recipeId: "recipe" }, rulesVersion: "2026-08-27.1",
    siteRules: Object.fromEntries(targets.map((site) => [site, { platformMaxLength: limits[site], preferredMaxLength: 75, guidance: "saved rule" }])),
    unifiedRule: { exactSameValueForAllSites: true, maxLength: 75, targets: targets.map((id) => ({ id })) } };
}
assert.equal(validateName(namePacket(["amazon", "rakuten", "yahoo", "base"])).unifiedRule.targets.length, 4);
assert.equal(validateName(namePacket(Object.keys(limits))).unifiedRule.targets.length, 7);
assert.throws(() => validateName(namePacket(["amazon", "qoo10"])), /全EC共通商品名/);
assert.throws(() => validateName(namePacket(["amazon", "rakuten", "yahoo", "base", "makeshop"])), /全EC共通商品名/);
console.log("Bridge retired-channel policy tests passed");
