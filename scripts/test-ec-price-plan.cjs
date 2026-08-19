const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bridgeSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge.mjs"),
  "utf8",
);

function loadFunction(name, nextName) {
  const start = bridgeSource.indexOf(`function ${name}(`);
  const end = bridgeSource.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} source not found`);
  const source = bridgeSource.slice(start, end);
  return new Function(`${source}\nreturn ${name};`)();
}

const validatePlan = loadFunction("validateEcPricePlan", "validateEcPriceResultV2");
const validateResult = loadFunction("validateEcPriceResultV2", "planToFinalResult");

const routeSource = fs.readFileSync(
  path.join(__dirname, "..", "app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "route.ts"),
  "utf8",
);

function loadRouteFunction(name, nextName) {
  const asObjectStart = routeSource.indexOf("function asObject(");
  const asObjectEnd = routeSource.indexOf("function priceSyncRows(", asObjectStart);
  const start = routeSource.indexOf(`function ${name}(`);
  const end = routeSource.indexOf(`export async function ${nextName}(`, start);
  assert.ok(asObjectStart >= 0 && asObjectEnd > asObjectStart && start >= 0 && end > start, `${name} route source not found`);
  const stripTypes = (source) => source
    .replace(/: Record<string, any> \| null/g, "")
    .replace(/: unknown/g, "")
    .replace(/: string/g, "")
    .replace(/: CodexJobStatus/g, "")
    .replace(/: Record<string, any>\[\]/g, "")
    .replace(/: Record<string, any>/g, "")
    .replace(/ as Record<string, any>/g, "");
  const source = [
    'const EC_PRICE_TARGETS = new Set(["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"]);',
    stripTypes(routeSource.slice(asObjectStart, asObjectEnd)),
    stripTypes(routeSource.slice(start, end)),
  ].join("\n");
  return new Function(`${source}\nreturn ${name};`)();
}

const validateServerPlan = loadRouteFunction("validatedPricePlan", "POST");
const buildSyncRows = loadRouteFunction("priceSyncRows", "POST");

const baseParameters = {
  targets: ["base"],
  newPriceInclTax: 4550,
  siteBaselines: { base: 4290 },
  recoveryPlanSites: [],
};
const basePlan = {
  status: "ready",
  summary: "planned",
  reference_standard_price: 4290,
  sites: [{
    site: "base",
    status: "planned",
    pricing_rule: "delta_from_reference",
    shipping_mode: "excluded",
    unit_multiplier: 1,
    unit_evidence: "BASEの商品詳細で単品を確認",
    observed_price: 3990,
    basis_price: 3990,
    standard_baseline_price: 4290,
    target_price: 4250,
    product_identifier: "base-item",
    message: "差額260円",
  }],
};

assert.equal(validatePlan(basePlan, baseParameters), null);
assert.equal(validateServerPlan(baseParameters, basePlan).status, "ready");
assert.match(
  validatePlan({ ...basePlan, sites: [{ ...basePlan.sites[0], pricing_rule: "standard_price", target_price: 4550 }] }, baseParameters),
  /送料別商品/,
);
assert.throws(
  () => validateServerPlan(baseParameters, { ...basePlan, status: "needs_review" }),
  /対象または標準価格/,
);
assert.throws(
  () => validateServerPlan(baseParameters, {
    ...basePlan,
    sites: [{ ...basePlan.sites[0], pricing_rule: "standard_price", target_price: 4550 }],
  }),
  /目標価格/,
);
assert.match(
  validatePlan({ ...basePlan, sites: [{ ...basePlan.sites[0], target_price: 4550 }] }, baseParameters),
  /販売単位別価格計算/,
);
assert.match(
  validatePlan({ ...basePlan, sites: [{ ...basePlan.sites[0], product_identifier: null }] }, baseParameters),
  /商品識別子/,
);

const recoveryParameters = {
  ...baseParameters,
  recoveryPlanSites: [{ ...basePlan.sites[0] }],
};
assert.equal(
  validatePlan({
    ...basePlan,
    sites: [{ ...basePlan.sites[0], observed_price: 4250 }],
  }, recoveryParameters),
  null,
);
assert.match(
  validatePlan({
    ...basePlan,
    sites: [{ ...basePlan.sites[0], observed_price: 4300 }],
  }, recoveryParameters),
  /競合/,
);

const amazonParameters = {
  targets: ["amazon"],
  newPriceInclTax: 4550,
  siteBaselines: { amazon: 4290 },
  recoveryPlanSites: [],
};
const amazonPlan = {
  status: "ready",
  summary: "planned",
  reference_standard_price: 4290,
  sites: [{
    site: "amazon",
    status: "planned",
    pricing_rule: "standard_price",
    shipping_mode: "not_checked",
    unit_multiplier: 1,
    unit_evidence: "Amazon商品詳細でレシピと同じ1商品を確認",
    observed_price: 4290,
    basis_price: 4290,
    standard_baseline_price: 4290,
    target_price: 4550,
    product_identifier: "ASIN",
    message: "standard",
  }],
};
assert.equal(validatePlan(amazonPlan, amazonParameters), null);

const mercariParameters = {
  targets: ["mercari"],
  newPriceInclTax: 730,
  siteBaselines: { mercari: 700 },
  recoveryPlanSites: [],
};
const mercariTwoPackPlan = {
  status: "ready",
  summary: "2個セット",
  reference_standard_price: 700,
  sites: [{
    site: "mercari",
    status: "planned",
    pricing_rule: "delta_from_reference",
    shipping_mode: "included",
    unit_multiplier: 2,
    unit_evidence: "商品名と商品詳細に2個セットと明記",
    observed_price: 1700,
    basis_price: 1700,
    standard_baseline_price: 700,
    target_price: 1760,
    product_identifier: "mercari-two-pack",
    message: "単品差額30円×2個",
  }],
};
assert.equal(validatePlan(mercariTwoPackPlan, mercariParameters), null);
assert.equal(validateServerPlan(mercariParameters, mercariTwoPackPlan).status, "ready");
assert.match(
  validatePlan({
    ...mercariTwoPackPlan,
    sites: [{ ...mercariTwoPackPlan.sites[0], target_price: 1730 }],
  }, mercariParameters),
  /販売単位別価格計算/,
);
assert.match(
  validatePlan({
    ...mercariTwoPackPlan,
    sites: [{ ...mercariTwoPackPlan.sites[0], pricing_rule: "standard_price", target_price: 730 }],
  }, mercariParameters),
  /販売単位/,
);

const validResult = {
  status: "completed",
  summary: "updated",
  new_standard_price: 4550,
  sites: [{
    site: "base",
    status: "updated",
    final_price: 4250,
    product_identifier: "base-item",
    message: "verified",
  }],
};
assert.equal(validateResult(validResult, baseParameters, basePlan), null);
assert.match(
  validateResult({
    ...validResult,
    sites: [{ ...validResult.sites[0], final_price: 4550 }],
  }, baseParameters, basePlan),
  /保存済み目標価格/,
);
assert.match(
  validateResult({
    ...validResult,
    sites: [{ ...validResult.sites[0], product_identifier: "different-item" }],
  }, baseParameters, basePlan),
  /商品識別子/,
);

const claimedBaseJob = {
  parameters: {
    ...baseParameters,
    recipeId: "00000000-0000-0000-0000-000000000001",
    recipeSnapshot: { recipeId: "00000000-0000-0000-0000-000000000001" },
  },
  result: { plan: basePlan, validated_plan_checkpoint: true },
};
assert.equal(
  buildSyncRows(claimedBaseJob, validResult, "00000000-0000-0000-0000-000000000010", "2026-08-19T00:00:00.000Z").length,
  1,
);
assert.equal(
  buildSyncRows(claimedBaseJob, {
    ...validResult,
    sites: [{ ...validResult.sites[0], status: "submitted_pending" }],
  }, "00000000-0000-0000-0000-000000000010", "2026-08-19T00:00:00.000Z").length,
  0,
);
assert.throws(
  () => buildSyncRows(
    { ...claimedBaseJob, result: { plan: basePlan } },
    validResult,
    "00000000-0000-0000-0000-000000000010",
    "2026-08-19T00:00:00.000Z",
  ),
  /サーバー検証済み/,
);

console.log("EC price plan and result safety tests passed.");
