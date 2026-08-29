const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bridgeSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge.mjs"),
  "utf8",
);
const monitorStateFileSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "monitor-state-file.cjs"),
  "utf8",
);
const requiredBridgeVersionSource = fs.readFileSync(
  path.join(__dirname, "..", "lib", "web-sales-codex", "bridge-version.ts"),
  "utf8",
);
const verifiedRegistry = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "lib", "ec-price-verified-registry.json"),
  "utf8",
));
const bridgeVersion = bridgeSource.match(/const VERSION = "([^"]+)";/)?.[1];
const requiredBridgeVersion = requiredBridgeVersionSource.match(
  /REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/,
)?.[1];
assert.ok(bridgeVersion, "Bridge runtime version not found");
assert.equal(requiredBridgeVersion, bridgeVersion, "TSA required Bridge version must match the bundled runtime");
assert.match(bridgeSource, /ecPriceProtocolVersion: 3/);
const verifiedFourPack = verifiedRegistry.products.find((product) => product.janCode === "4571318633625");
assert.ok(verifiedFourPack, "オーション麺4食の確定識別子が必要です");
assert.deepEqual(
  verifiedFourPack.identifiers.amazon,
  [{ kind: "asin", value: "B0BYV7DRDS" }, { kind: "sku", value: "YG-XN24-7D2K" }],
);
assert.deepEqual(verifiedFourPack.identifiers.mercari, [
  { kind: "product_id", value: "S2fzMSKZZMSQczXxU2R7HT" },
  { kind: "sku", value: "YG-XN24-7D2K" },
]);
assert.deepEqual(verifiedFourPack.identifiers.qoo10, [{ kind: "product_number", value: "1166048679" }]);
const verifiedFiftyPack = verifiedRegistry.products.find((product) => product.janCode === "4571318633120");
assert.ok(verifiedFiftyPack, "オーション麺50食の確定識別子が必要です");
assert.deepEqual(verifiedFiftyPack.identifiers.rakuten, [{ kind: "product_management_number", value: "10000029" }]);
assert.deepEqual(verifiedFiftyPack.identifiers.tiktok, [
  { kind: "base_product_id", value: "121847320" },
  { kind: "product_id", value: "1732857167447033086" },
]);
assert.deepEqual(
  verifiedRegistry.lpSources.find((source) => source.host === "buta.aizubrandhall-lp2.com"),
  { host: "buta.aizubrandhall-lp2.com", githubRepository: "hajiox/BUTA", productionBranch: "main" },
);

function loadFunction(name, nextName) {
  const start = bridgeSource.indexOf(`function ${name}(`);
  const end = bridgeSource.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} source not found`);
  const source = bridgeSource.slice(start, end);
  return new Function("resolve", "isAbsolute", `const config = { workspace: "C:\\\\work" }; const EC_PRICE_TARGETS = new Set(["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"]);\n${source}\nreturn ${name};`)(path.win32.resolve, path.win32.isAbsolute);
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
const currentLpTargetPrices = loadFunction("ecPriceLpCurrentTargetPrices", "positiveEcPriceInteger");

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
assert.match(pricePromptSource, /TASK_JSON\.verifiedProductIdentifiers/);
assert.match(pricePromptSource, /optional seller-side storage\/delivery field that is blank/);
assert.match(pricePromptSource, /must never be returned as not_found/);
assert.match(pricePromptSource, /TASK_JSON\.lpSource is a server allow-listed source/);
assert.match(pricePromptSource, /ExpectedGithubRepository/);
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
assert.match(bridgeSource, /executeSingleEcPriceSite/);
assert.match(bridgeSource, /executeSingleEcPriceLp/);
assert.ok(
  bridgeSource.indexOf("ecPriceLpCurrentTargetPrices(plan)") < bridgeSource.indexOf('const writeOutput = join(workDir, "ec-price-lp-result.json")'),
  "変更不要のLPはAI書込工程を起動する前に公開確認する",
);
assert.match(bridgeSource, /eventType: "ec_price_progress_checkpoint"/);
assert.match(bridgeSource, /maxTemporaryTabs: 1/);
assert.match(bridgeSource, /maxTemporaryTabs: 0/);
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
assert.match(monitorSource, /Codex Bridge 統合モニター/);
assert.match(monitorSource, /TSA/);
assert.match(monitorSource, /TSG/);
assert.match(monitorSource, /DocScanner/);
assert.match(monitorSource, /完了目安/);
assert.match(monitorSource, /Codex PID/);
assert.match(monitorSource, /目安超過（処理継続中）/);
assert.match(monitorSource, /foregroundActivated/);
assert.match(monitorSource, /monitorPid/);
assert.match(monitorSource, /Local\\CodexBridgeUnifiedMonitor/);
assert.match(monitorSource, /Bridge状態ファイルがありません/);
assert.match(monitorSource, /応答停止/);
assert.match(monitorSource, /モニターを閉じてもBridgeジョブは停止しません/);
assert.doesNotMatch(monitorSource, /Clear-Host/);
assert.match(monitorSource, /SetConsoleMode/);
assert.match(monitorSource, /-band \(-bnot 0x40\)/);
assert.match(monitorSource, /SetWindowPos/);
assert.match(monitorSource, /broughtForward/);
assert.match(monitorSource, /\[System\.IO\.FileStream\]::new/);
assert.match(monitorSource, /\[System\.IO\.FileShare\]::Delete/);
assert.match(monitorSource, /\[System\.Text\.UTF8Encoding\]::new\(\$false, \$true\)/);
assert.doesNotMatch(monitorSource, /Get-Content\s+-LiteralPath/);
const installerSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "install-bridge.ps1"),
  "utf8",
);
assert.match(installerSource, /"bridge-monitor\.ps1"/);
assert.match(installerSource, /"launch-bridge-monitor\.ps1"/);
assert.match(installerSource, /"monitor-window-placement\.ps1"/);
assert.match(installerSource, /"bridge-monitor-state\.schema\.json"/);
assert.match(installerSource, /Codex Bridge Monitor/);
assert.match(installerSource, /Stop-VerifiedMonitor/);
assert.match(installerSource, /CommandLine\.IndexOf\(\$_/);
const monitorLauncherSource = fs.readFileSync(
  path.join(__dirname, "..", "tools", "tsa-codex-bridge", "launch-bridge-monitor.ps1"),
  "utf8",
);
assert.match(monitorLauncherSource, /Start-Process/);
assert.match(monitorLauncherSource, /-WindowStyle Normal/);
assert.match(monitorLauncherSource, /AckPath/);
assert.match(monitorLauncherSource, /conhost\.exe/);
assert.match(monitorLauncherSource, /BringForward/);
assert.match(monitorLauncherSource, /codex-bridge-unified/);
assert.match(monitorLauncherSource, /Get-CodexBridgeMonitorPlacement/);
assert.match(monitorLauncherSource, /Move-CodexBridgeMonitorWindow/);
assert.match(monitorLauncherSource, /function Move-AcknowledgedMonitor/);
assert.match(monitorLauncherSource, /\$placementDeadline = \(Get-Date\)\.AddSeconds\(8\)/);
assert.match(monitorLauncherSource, /\[void\]\(Move-AcknowledgedMonitor \$startedAcknowledgement\)/);
assert.match(bridgeSource, /unified desktop monitor visible/);
assert.match(bridgeSource, /Codex Bridge Monitor/);
assert.match(bridgeSource, /UNIFIED_MONITOR_STATE_DIR/);
assert.match(bridgeSource, /schemaVersion: 1/);
assert.match(bridgeSource, /system: "tsa"/);
assert.match(bridgeSource, /tsa-prelogin/);
assert.match(bridgeSource, /writeMonitorStateJson\(MONITOR_STATE_PATH, desktopMonitorState\)/);
assert.match(monitorStateFileSource, /REPLACE_RETRY_DELAYS_MS/);
assert.match(monitorStateFileSource, /renameSync\(temporaryPath, path\)/);
assert.match(monitorStateFileSource, /RETRYABLE_REPLACE_CODES/);
assert.match(bridgeSource, /Date\.now\(\) - desktopMonitorLaunchRequestedAt < 10_000/);
assert.match(bridgeSource, /publishDesktopMonitorHeartbeat\(\);\s+ensureUnifiedDesktopMonitor\(false\);/);
assert.match(bridgeSource, /function sanitizeMonitorText/);
assert.match(bridgeSource, /Bearer \[REDACTED\]/);
const desktopMonitorLaunchSource = bridgeSource.slice(
  bridgeSource.indexOf("function startDesktopMonitor("),
  bridgeSource.indexOf("function updateDesktopMonitor(") + 1,
);
assert.doesNotMatch(
  desktopMonitorLaunchSource,
  /detached:\s*true/,
  "非表示ランチャーをdetached起動すると可視PowerShellの生成が失敗するため禁止する",
);
assert.ok(
  (desktopMonitorLaunchSource.match(/"-File", MONITOR_LAUNCHER_PATH/g) || []).length >= 2,
  "初回と再試行の両方を共通モニターランチャー経由にする",
);
assert.doesNotMatch(desktopMonitorLaunchSource, /taskkill/i, "モニターからBridgeまたはCodexを停止してはいけない");
assert.doesNotMatch(bridgeSource, /terminateAcknowledgedDesktopMonitor/);
const alreadyCurrentCheck = bridgeSource.indexOf('planSite.observed_price) === Number(planSite.target_price');
const siteWritePhase = bridgeSource.indexOf('const writeOutput = join(workDir, `ec-price-${site}-result.json`)');
assert.ok(alreadyCurrentCheck >= 0, "保存価格が目標価格と一致するECを変更不要として確定する");
assert.ok(alreadyCurrentCheck < siteWritePhase, "変更不要判定は書込用Codexセッションの前に行う");
assert.match(bridgeSource, /ec_price_site_already_current/);
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
assert.match(routeSource, /dispatchRecipePriceTsgNotifications/);
assert.match(routeSource, /status === "completed"/);

const tsgCompletionMigrationSource = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260823120000_gate_recipe_price_tsg_after_ec_completion.sql",
  ),
  "utf8",
);
assert.match(tsgCompletionMigrationSource, /job\.status = 'completed'/);
assert.match(tsgCompletionMigrationSource, /job\.created_at >= revision\.created_at/);

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
assert.match(recipePriceRouteSource, /getEcPriceVerifiedIdentifiers/);
assert.match(recipePriceRouteSource, /getEcPriceLpSource/);
assert.match(recipePriceRouteSource, /findGlobalImmediateEcPriceJob/);
assert.match(recipePriceControlsSource, /hasHydratedJobHistory/);
assert.match(recipePriceControlsSource, /FINAL_STATUSES\.has\(nextJob\.status\).*notifiedJobId\.current = nextJob\.id/);
assert.match(recipePriceRouteSource, /現在「\$\{blockingView\.productName\}」の価格変更を実行中/);
assert.match(recipePriceRouteSource, /retryUnfinishedFromJobId/);
assert.match(recipePriceControlsSource, /未完了だけ再実行/);
assert.doesNotMatch(recipePriceControlsSource, /同じ工程が2分以上/);
const reservationRouteSource = fs.readFileSync(
  path.join(__dirname, "..", "app", "api", "recipe", "ec-price-reservations", "route.ts"),
  "utf8",
);
const batchNotificationMigrationSource = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260824120000_batch_recipe_price_tsg_notifications.sql",
  ),
  "utf8",
);
assert.match(reservationRouteSource, /release_recipe_ec_price_batch_jobs/);
assert.match(batchNotificationMigrationSource, /tsa_batch_execution_confirmation/);
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
  verifiedProductIdentifiers: {
    amazon: [
      { kind: "sku", value: "YG-XN24-7D2K" },
      { kind: "asin", value: "B0BYV7DRDS" },
      { kind: "asin", value: "B0BYV7DRDS" },
    ],
  },
  lpUpdate: false,
  lpUrl: null,
  lpSource: null,
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
assert.deepEqual(validateJobParameters(authorizedJobParameters).verifiedProductIdentifiers.amazon, [
  { kind: "asin", value: "B0BYV7DRDS" },
  { kind: "sku", value: "YG-XN24-7D2K" },
]);
assert.equal(validateJobParameters({
  ...authorizedJobParameters,
  targets: [],
  lpUpdate: true,
  lpUrl: "https://example.com/product",
  lpSource: {
    host: "example.com",
    githubRepository: "hajiox/example",
    productionBranch: "main",
  },
  operatorAuthorization: {
    ...authorizedJobParameters.operatorAuthorization,
    targets: [],
  },
}).lpUpdate, true, "商品LPだけの未完了再実行を許可する");
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
    .replace(/: Record<string, number>/g, "")
    .replace(/: Record<string, unknown>/g, "")
    .replace(/: ReturnType<typeof productContentForTarget>/g, "")
    .replace(/: "target" \| "final"/g, "")
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
  verifiedProductIdentifiers: { amazon: [{ kind: "asin", value: "ASIN" }] },
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
assert.match(
  validatePlan({ ...amazonPlan, sites: [{ ...amazonPlan.sites[0], product_identifier: "OTHER" }] }, amazonParameters),
  /確定登録と一致/,
);
assert.match(
  validatePlan({
    ...amazonPlan,
    sites: [{
      ...notFoundMercari,
      site: "amazon",
      unit_evidence: "商品名とJANでは検索結果なし",
    }],
  }, amazonParameters),
  /確定識別子があるため対象商品なしにできません/,
);

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
const lpOnlyParameters = {
  ...lpParameters,
  targets: [],
  siteBaselines: {},
  recoveryPlanSites: [],
};
const lpOnlyPlan = {
  ...lpPlan,
  reference_standard_price: null,
  sites: [],
};
assert.equal(
  validatePlan(lpOnlyPlan, lpOnlyParameters),
  null,
  "LPだけの再実行ではECの旧標準価格を要求しない",
);
assert.equal(
  validateServerPlan(lpOnlyParameters, lpOnlyPlan).status,
  "ready",
  "サーバーもLPだけの検証済み計画を受理する",
);
assert.deepEqual(
  currentLpTargetPrices({
    lp: {
      updates: [
        { observed_price: 1080, target_price: 1080 },
        { observed_price: 1080, target_price: 1080 },
      ],
    },
  }),
  [1080],
  "Fresh Clone上の全対象価格が目標値なら変更不要の公開確認へ進める",
);
assert.deepEqual(
  currentLpTargetPrices({
    lp: {
      updates: [
        { observed_price: 1045, target_price: 1080 },
        { observed_price: 1080, target_price: 1080 },
      ],
    },
  }),
  [],
  "旧価格が一か所でも残るLPを変更不要扱いしない",
);
assert.equal(
  validatePlan({
    ...lpOnlyPlan,
    lp: {
      ...lpOnlyPlan.lp,
      updates: [{ ...lpOnlyPlan.lp.updates[0], source_file: "app/page.tsx" }],
    },
  }, lpOnlyParameters),
  null,
  "LPの相対ソースパスはFresh Cloneのプロジェクトルート基準で検証する",
);
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
assert.equal(validateResult({
  ...validLpResult,
  lp: {
    ...validLpResult.lp,
    changed_files: [],
    deployment_url: lpParameters.lpUrl,
    deployed_commit: lpPlan.lp.source_commit,
    message: "現行ソースと公開URLがすでに目標価格",
  },
}, lpParameters, lpPlan), null, "変更不要のLPも公開URLと現行コミットを証跡に完了できる");
assert.equal(validateResult({
  ...validLpResult,
  lp: {
    ...validLpResult.lp,
    deployment_url: "https://example-generated-deployment.vercel.app",
  },
}, lpParameters, lpPlan), null, "生成deployment URLと登録公開URLが異なっても許可する");
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
  buildSyncRows(claimedBaseJob, {
    ...validResult,
    plan: basePlan,
    validated_plan_checkpoint: true,
  }, "00000000-0000-0000-0000-000000000010", "2026-08-19T00:00:00.000Z").length,
  1,
);
assert.equal(
  buildSyncRows(claimedBaseJob, {
    ...validResult,
    sites: [{ ...validResult.sites[0], status: "submitted_pending" }],
    plan: basePlan,
    validated_plan_checkpoint: true,
  }, "00000000-0000-0000-0000-000000000010", "2026-08-19T00:00:00.000Z").length,
  0,
);
assert.throws(
  () => buildSyncRows(
    { ...claimedBaseJob, result: { plan: basePlan } },
    { ...validResult, plan: basePlan },
    "00000000-0000-0000-0000-000000000010",
    "2026-08-19T00:00:00.000Z",
  ),
  /サーバー検証済み/,
);

console.log("EC price plan and result safety tests passed.");
