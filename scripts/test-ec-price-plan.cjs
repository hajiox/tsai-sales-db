const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bridgeSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge.mjs"),
  "utf8",
);
const requiredBridgeVersionSource = fs.readFileSync(
  path.join(__dirname, "..", "lib", "web-sales-codex", "bridge-version.ts"),
  "utf8",
);
const bridgeVersion = bridgeSource.match(/const VERSION = "([^"]+)";/)?.[1];
const requiredBridgeVersion = requiredBridgeVersionSource.match(
  /REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/,
)?.[1];
assert.ok(bridgeVersion, "Bridge runtime version not found");
assert.equal(requiredBridgeVersion, bridgeVersion, "TSA required Bridge version must match the bundled runtime");

function loadFunction(name, nextName) {
  const start = bridgeSource.indexOf(`function ${name}(`);
  const end = bridgeSource.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} source not found`);
  const source = bridgeSource.slice(start, end);
  return new Function(`const resolve = (value) => value; const config = { workspace: "C:\\\\work" }; const EC_PRICE_TARGETS = new Set(["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"]);\n${source}\nreturn ${name};`)();
}

const validatePlan = loadFunction("validateEcPricePlan", "validateEcPriceResultV2");
const validateResult = loadFunction("validateEcPriceResultV2", "planToFinalResult");
const countsTemporaryTabActions = loadFunction("countEcPriceTemporaryTabActions", "isForbiddenEcPriceTabAction");
const detectsForbiddenTabAction = loadFunction("isForbiddenEcPriceTabAction", "terminateChildProcessTree");
const estimateDesktopCompletion = loadFunction("estimateDesktopCompletion", "bridgeTaskLabel");
const ecPriceEventLabel = loadFunction("ecPriceEventLabel", "isForbiddenEcPriceTabAction");
const detectsBrowserSessionContention = loadFunction("isEcPriceBrowserSessionContention", "normalizeEcPriceContentionSummary");
const detectsDuplicateConfirmation = loadFunction("isEcPriceDuplicateConfirmation", "normalizeEcPriceContentionSummary");
const validateJobParameters = loadFunction("validateEcPriceJobParametersV2", "buildEcPricePlanPrompt");

const pricePromptSource = bridgeSource.slice(
  bridgeSource.indexOf("function buildEcPricePlanPrompt("),
  bridgeSource.indexOf("function validateEcPricePlan("),
);
assert.match(pricePromptSource, /SAME-CHROME TAB POLICY/);
assert.match(pricePromptSource, /SAME-CHROME TEMPORARY-TAB FALLBACK/);
assert.match(pricePromptSource, /create exactly one temporary tab.*chrome\.tabs\.new\(\)/i);
assert.match(pricePromptSource, /same logged-in Chrome profile/i);
assert.match(pricePromptSource, /Do not ask the operator to click a Chrome-top cancellation control/i);
assert.match(pricePromptSource, /try the remaining existing matching official tabs/);
assert.doesNotMatch(pricePromptSource, /EXISTING-TAB-ONLY POLICY/);
assert.match(pricePromptSource, /TAB FINALIZATION IS MANDATORY/);
assert.match(pricePromptSource, /only treat a visible official login\/authentication screen.*as signed out/i);
assert.match(pricePromptSource, /OPERATOR AUTHORIZATION/);
assert.match(pricePromptSource, /has no chat reply channel/);
assert.match(pricePromptSource, /Do not ask the operator to reply, confirm again/);
assert.match(pricePromptSource, /save\/submit confirmation.*never waiting_for_user/i);
assert.match(pricePromptSource, /unsaved staged input left by a previously stopped job/);
assert.match(pricePromptSource, /BOUNDED RECOVERY POLICY FOR ALL EC SITES/);
assert.match(pricePromptSource, /Amazon, Rakuten, Yahoo, Mercari Shops, BASE, Qoo10, or TikTok/);
assert.match(pricePromptSource, /newly mandatory field may be changed only when its exact value is explicitly proven/);
assert.match(pricePromptSource, /ABSOLUTE PROHIBITIONS DURING RECOVERY FOR ALL EC SITES/);
assert.match(pricePromptSource, /at most two attempts for one distinct repair-and-save path/);
assert.match(pricePromptSource, /find-lp-source\.ps1 with -FreshClone/);
assert.match(pricePromptSource, /mandatory product LP plan/);
assert.match(pricePromptSource, /AMAZON PRICE-ONLY RULE/);
assert.match(pricePromptSource, /\/interactive\/listing\/workflow\/edit\/offer/);
assert.match(pricePromptSource, /90220/);
assert.match(pricePromptSource, /verified-products\.md/);
assert.match(pricePromptSource, /TASK_JSON\.productMappings/);
assert.match(pricePromptSource, /search every supplied mapped title before reporting not_found/);
assert.match(pricePromptSource, /verified not_found site is not an error/);
assert.match(pricePromptSource, /Process only PLAN_JSON sites with status=planned/);
assert.match(pricePromptSource, /explicitly proves the same product is sold on other marketplaces/);
assert.match(pricePromptSource, /set only 'この商品はAmazon\.co\.jp限定商品ですか？' to 'いいえ'/);
assert.match(pricePromptSource, /Do not change any other catalog attribute/);
assert.doesNotMatch(pricePromptSource, /do not fill or alter that unrelated catalog attribute/);
assert.doesNotMatch(pricePromptSource, /Close temporary tabs/);
assert.doesNotMatch(pricePromptSource, /Never inspect, edit, deploy, or update any company LP/);
assert.match(bridgeSource, /abortOnTabPolicyViolation: false/);
assert.match(bridgeSource, /abortOnTabPolicyViolation: true/);
assert.match(bridgeSource, /maxTemporaryTabs: parameters\.targets\.length/);
assert.match(bridgeSource, /temporaryTabCreations > maxTemporaryTabs/);
assert.doesNotMatch(bridgeSource, /"exec", "--ephemeral"/);
assert.equal(detectsBrowserSessionContention("別のブラウザ作業セッションで使用中です"), true);
assert.equal(detectsBrowserSessionContention("公式ログイン画面が表示されています"), false);
assert.equal(detectsDuplicateConfirmation("「保存を実行」と返信してください"), true);
assert.equal(detectsDuplicateConfirmation("保存後の価格を確認しました"), false);
assert.equal(
  countsTemporaryTabActions({
    type: "item.started",
    item: {
      type: "mcp_tool_call",
      arguments: { code: "const tab = await chrome.tabs.new();" },
    },
  }),
  1,
  "同じChrome内の一時タブ作成を数える",
);
assert.equal(
  detectsForbiddenTabAction({
    type: "item.started",
    item: {
      type: "mcp_tool_call",
      arguments: { code: "const tab = await chrome.tabs.new();" },
    },
  }),
  false,
  "制限内の同一Chrome一時タブは許可する",
);
assert.equal(
  detectsForbiddenTabAction({
    type: "item.started",
    item: {
      type: "mcp_tool_call",
      arguments: { code: "const tab = await browser.tabs.new();" },
    },
  }),
  true,
  "別ブラウザ変数からのタブ作成は拒否する",
);
assert.equal(
  ecPriceEventLabel({
    type: "item.started",
    item: { type: "mcp_tool_call", arguments: { title: "Amazon価格変更を送信" } },
  }),
  "Amazon価格変更を送信",
);

const monitorEstimate = estimateDesktopCompletion({
  status: "running",
  startedAt: "2026-08-21T00:00:00.000Z",
  taskKey: "ec_price_update",
  targets: ["amazon", "rakuten", "yahoo"],
}, 50, "2026-08-21T00:05:00.000Z");
assert.ok(Date.parse(monitorEstimate.estimatedEarliestAt) > Date.parse("2026-08-21T00:05:00.000Z"));
assert.ok(Date.parse(monitorEstimate.estimatedLatestAt) > Date.parse(monitorEstimate.estimatedEarliestAt));
assert.deepEqual(
  estimateDesktopCompletion({ status: "completed" }, 100, "2026-08-21T00:05:00.000Z"),
  { estimatedEarliestAt: null, estimatedLatestAt: null },
);

const monitorSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge-monitor.ps1"),
  "utf8",
);
assert.match(monitorSource, /TSA Codex Bridge 実行モニター/);
assert.match(monitorSource, /完了目安/);
assert.match(monitorSource, /Codex PID/);
assert.match(monitorSource, /目安超過（処理継続中）/);
const installerSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "install-bridge.ps1"),
  "utf8",
);
assert.match(installerSource, /"bridge-monitor\.ps1"/);
assert.match(installerSource, /"launch-bridge-monitor\.ps1"/);
assert.match(installerSource, /IndexOf\(\$monitorPath/);
const monitorLauncherSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "launch-bridge-monitor.ps1"),
  "utf8",
);
assert.match(monitorLauncherSource, /Start-Process/);
assert.match(monitorLauncherSource, /-WindowStyle Normal/);
assert.equal(
  detectsForbiddenTabAction({
    type: "item.started",
    item: {
      type: "mcp_tool_call",
      arguments: { code: "const tabs = await chrome.tabs.list();" },
    },
  }),
  false,
  "既存Chromeタブの一覧取得は許可する",
);

const routeSource = fs.readFileSync(
  path.join(__dirname, "..", "app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "route.ts"),
  "utf8",
);

const recipePriceRouteSource = fs.readFileSync(
  path.join(__dirname, "..", "app", "api", "recipe", "[id]", "ec-price-jobs", "route.ts"),
  "utf8",
);
const recipePriceControlsSource = fs.readFileSync(
  path.join(__dirname, "..", "app", "recipe", "_components", "EcPriceSyncControls.tsx"),
  "utf8",
);
assert.match(recipePriceRouteSource, /EC_PRICE_TAB_CONTENTION_MESSAGE/);
assert.match(recipePriceRouteSource, /同じログイン済みChromeの一時タブへ自動退避/);
assert.doesNotMatch(recipePriceRouteSource, /Chrome上部の「キャンセル」/);
assert.match(recipePriceRouteSource, /EC_PRICE_DUPLICATE_CONFIRMATION_MESSAGE/);
assert.match(recipePriceRouteSource, /operatorAuthorization/);
assert.match(recipePriceRouteSource, /loadEcPriceProductMappings/);
assert.match(recipePriceRouteSource, /findGlobalImmediateEcPriceJob/);
assert.match(recipePriceControlsSource, /hasHydratedJobHistory/);
assert.match(recipePriceControlsSource, /FINAL_STATUSES\.has\(nextJob\.status\).*notifiedJobId\.current = nextJob\.id/);
assert.match(recipePriceRouteSource, /現在「\$\{blockingView\.productName\}」の価格変更を実行中/);
const reservationRouteSource = fs.readFileSync(
  path.join(__dirname, "..", "app", "api", "recipe", "ec-price-reservations", "route.ts"),
  "utf8",
);
assert.match(reservationRouteSource, /tsa_batch_execution_confirmation/);
assert.match(reservationRouteSource, /ecPriceProductMappingsMatch/);

const authorizedJobParameters = {
  recipeId: "00000000-0000-0000-0000-000000000050",
  recipeName: "50食",
  targets: ["amazon"],
  newPriceInclTax: 6588,
  newPriceExTax: 6100,
  siteBaselines: { amazon: 5990 },
  recoveryPlanSites: [],
  productMappings: { amazon: ["  4食   商品  ", "4食 商品"] },
  lpUpdate: false,
  lpUrl: null,
  recipeSnapshot: { recipeId: "00000000-0000-0000-0000-000000000050" },
  operatorAuthorization: {
    executionAuthorized: true,
    source: "tsa_immediate_execution_confirmation",
    authorizedAt: "2026-08-22T04:00:00.000Z",
    authorizedBy: "admin@example.com",
    recipeId: "00000000-0000-0000-0000-000000000050",
    targets: ["amazon"],
    newPriceInclTax: 6588,
  },
};
assert.equal(validateJobParameters(authorizedJobParameters).operatorAuthorization.executionAuthorized, true);
assert.deepEqual(validateJobParameters(authorizedJobParameters).productMappings.amazon, ["4食 商品"]);
assert.throws(
  () => validateJobParameters({ ...authorizedJobParameters, operatorAuthorization: undefined }),
  /実行確認記録/,
);
assert.throws(
  () => validateJobParameters({
    ...authorizedJobParameters,
    operatorAuthorization: { ...authorizedJobParameters.operatorAuthorization, newPriceInclTax: 5990 },
  }),
  /実行確認記録/,
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
    .replace(/ as Record<string, any>/g, "")
    .replace(/ as unknown\[\]/g, "");
  const source = [
    'const EC_PRICE_TARGETS = new Set(["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"]);',
    stripTypes(routeSource.slice(asObjectStart, asObjectEnd)),
    stripTypes(routeSource.slice(start, end)),
  ].join("\n");
  return new Function(`${source}\nreturn ${name};`)();
}

const validateServerPlan = loadRouteFunction("validatedPricePlan", "POST");
const buildSyncRows = loadRouteFunction("priceSyncRows", "POST");

const noLpPlan = {
  required: false,
  url: null,
  status: "not_applicable",
  project_root: null,
  github_repository: "",
  production_branch: "",
  source_commit: "",
  product_evidence: "",
  updates: [],
  message: "対象外",
};
const noLpResult = {
  required: false,
  url: null,
  status: "not_applicable",
  final_prices: [],
  changed_files: [],
  deployment_url: null,
  deployed_commit: null,
  message: "対象外",
};

const baseParameters = {
  targets: ["base"],
  newPriceInclTax: 4550,
  siteBaselines: { base: 4290 },
  recoveryPlanSites: [],
  lpUpdate: false,
  lpUrl: null,
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
  lp: noLpPlan,
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

const mixedParameters = {
  ...baseParameters,
  targets: ["base", "mercari"],
  siteBaselines: { base: 4290, mercari: 4290 },
};
const notFoundMercari = {
  site: "mercari",
  status: "not_found",
  pricing_rule: "standard_price",
  shipping_mode: "not_checked",
  unit_multiplier: 1,
  unit_evidence: "TSAの紐付け名と商品名・容量で公式商品一覧を検索したが一致なし",
  observed_price: null,
  basis_price: null,
  standard_baseline_price: null,
  target_price: null,
  product_identifier: null,
  message: "対象商品なし",
};
const mixedPlan = {
  ...basePlan,
  sites: [basePlan.sites[0], notFoundMercari],
};
assert.equal(validatePlan(mixedPlan, mixedParameters), null);
assert.equal(validateServerPlan(mixedParameters, mixedPlan).status, "ready");
assert.match(
  validatePlan({
    ...mixedPlan,
    sites: [basePlan.sites[0], { ...notFoundMercari, target_price: 4550 }],
  }, mixedParameters),
  /対象商品なし計画/,
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
assert.equal(
  validatePlan({
    ...basePlan,
    sites: [{ ...basePlan.sites[0], unit_evidence: "再読込で同じ販売単位を確認" }],
  }, recoveryParameters),
  null,
  "確定値が同じなら再確認時の説明文差分で回復計画を止めない",
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
  lp: noLpPlan,
};
assert.equal(validatePlan(amazonPlan, amazonParameters), null);

const lpParameters = {
  ...amazonParameters,
  lpUpdate: true,
  lpUrl: "https://example.com/product",
};
const lpPlan = {
  ...amazonPlan,
  lp: {
    required: true,
    url: lpParameters.lpUrl,
    status: "planned",
    project_root: "C:\\work\\lp",
    github_repository: "hajiox/example",
    production_branch: "main",
    source_commit: "1111111111111111111111111111111111111111",
    product_evidence: "商品名・販売単位・公開URLが一致",
    updates: [{
      source_file: "C:\\work\\lp\\app\\page.tsx",
      occurrence_evidence: "対象商品の価格表示",
      pricing_basis: "standard_price",
      observed_price: 4290,
      target_price: 4550,
    }],
    message: "fresh cloneから対象価格を確認",
  },
};
assert.equal(validatePlan(lpPlan, lpParameters), null);
assert.equal(validateServerPlan(lpParameters, lpPlan).status, "ready");
assert.match(
  validatePlan({ ...lpPlan, lp: { ...lpPlan.lp, updates: [{ ...lpPlan.lp.updates[0], target_price: 4600 }] } }, lpParameters),
  /商品LPの目標価格/,
);

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
  lp: noLpPlan,
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
  lp: noLpResult,
};
assert.equal(validateResult(validResult, baseParameters, basePlan), null);
assert.equal(validateResult({
  ...validResult,
  sites: [validResult.sites[0], {
    site: "mercari",
    status: "not_found",
    final_price: null,
    product_identifier: null,
    message: "対象商品なし",
  }],
}, mixedParameters, mixedPlan), null);
const validLpResult = {
  ...validResult,
  sites: [{ ...validResult.sites[0], site: "amazon", product_identifier: "ASIN", final_price: 4550 }],
  lp: {
    required: true,
    url: lpParameters.lpUrl,
    status: "updated",
    final_prices: [4550],
    changed_files: ["C:\\work\\lp\\app\\page.tsx"],
    deployment_url: lpParameters.lpUrl,
    deployed_commit: "2222222222222222222222222222222222222222",
    message: "公開URLで確認済み",
  },
};
assert.equal(validateResult(validLpResult, lpParameters, lpPlan), null);
assert.match(
  validateResult({ ...validLpResult, lp: { ...validLpResult.lp, status: "blocked" } }, lpParameters, lpPlan),
  /完了にできません/,
);
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
