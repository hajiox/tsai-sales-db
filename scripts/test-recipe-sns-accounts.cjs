const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", output)(module, module.exports, (name) => dependencies[name] || require(name));
  return module.exports;
}
const sns = load("lib/recipe-sns.ts");
const policy = load("lib/recipe-sns-publish.ts", { "./recipe-sns": sns });
const bridge = fs.readFileSync(path.join(root, "tools/tsa-codex-bridge/bridge.mjs"), "utf8");
const constants = bridge.slice(bridge.indexOf("const RECIPE_SNS_PUBLISH_EXPECTED_ACCOUNTS"), bridge.indexOf("const ALL_CODEX_TASK_KEYS"));
const functions = bridge.slice(bridge.indexOf("function validateRecipeSnsPublishJobParameters("), bridge.indexOf("function recipeSnsPublishFallbackResult("));
const worker = new Function("RECIPE_SNS_PLATFORM_RULES", "normalizeRecipeSnsPublishStop", "RECIPE_SNS_INTERACTIVE_APPROVAL_MESSAGE", `${constants}\n${functions}\nreturn { validateRecipeSnsPublishJobParameters, normalizeRecipeSnsPublishResult, options: RECIPE_SNS_PUBLISH_ACCOUNT_OPTIONS };`)(
  Object.fromEntries(sns.RECIPE_SNS_PLATFORMS.map((p) => [p.id, { ...p, maxLength: 10000 }])), (entry) => entry, "approval",
);
assert.deepEqual(worker.options, policy.RECIPE_SNS_ACCOUNT_OPTIONS, "UI/API and worker must use identical account allowlists");
assert.deepEqual(policy.normalizeRecipeSnsPublishAccounts(undefined), policy.RECIPE_SNS_EXPECTED_ACCOUNTS);
for (const invalid of [null, [], "hajiox", { x: "unknown" }, { instagram: "hajiox" }, { x: "" }, { facebook: "satou.masahiko" }]) {
  assert.throws(() => policy.normalizeRecipeSnsPublishAccounts(invalid));
}
assert.equal(policy.normalizeRecipeSnsPublishAccounts({ x: "HAJIOX" }).x, "@hajiox");
const id = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-09-07T00:00:00.000Z";
for (const [platform, options] of Object.entries(policy.RECIPE_SNS_ACCOUNT_OPTIONS)) {
  for (const account of options) {
    const snapshot = policy.buildRecipeSnsPublishSnapshot({
      publicationId: id, recipeId: id, generationId: id, recipeName: "テスト",
      targets: [platform], scheduledAt: timestamp, requestedBy: "admin", authorizedAt: timestamp,
      cleanupMalformedOwnAttemptAuthorized: true, accounts: { [platform]: account },
      imageUrls: { [platform]: "https://test.public.blob.vercel-storage.com/image.jpg" },
      posts: { [platform]: { text: "テスト", hashtags: [], linkUrl: null } },
    });
    assert.equal(snapshot.platforms[platform].expectedAccount, account);
    const parameters = { ...snapshot, snapshot, model: "gpt-5.6-sol", reasoningEffort: "medium", executionPolicy: "one_fresh_skill_session_adaptive_official_ui_one_platform_at_a_time", mutationScope: "authorized_social_posts_only" };
    const verified = worker.validateRecipeSnsPublishJobParameters(parameters);
    const result = { status: "completed", publication_id: id, summary: "完了", platforms: [{
      platform, status: "published", account_observed: account, published_at: timestamp,
      published_url: platform === "instagram_story" ? null : `https://${platform === "x" ? "x.com" : platform === "threads" ? "threads.com" : "instagram.com"}/test`,
      evidence: "確認済み", message: "完了",
    }] };
    assert.equal(policy.validateRecipeSnsPublishResult(result, snapshot).platforms[0].accountObserved, account);
    assert.equal(worker.normalizeRecipeSnsPublishResult(result, verified).platforms[0].account_observed, account);
    const wrong = structuredClone(result);
    wrong.platforms[0].account_observed = options.find((entry) => entry !== account);
    assert.throws(() => policy.validateRecipeSnsPublishResult(wrong, snapshot), /アカウント/);
    assert.throws(() => worker.normalizeRecipeSnsPublishResult(wrong, verified), /アカウント/);
    const tampered = structuredClone(parameters);
    tampered.snapshot.expectedAccounts[platform] = options.find((entry) => entry !== account);
    assert.throws(() => worker.validateRecipeSnsPublishJobParameters(tampered), /固定値/);
    const legacy = structuredClone(parameters);
    legacy.rulesVersion = legacy.snapshot.rulesVersion = "2026-08-31.5";
    if (account === policy.RECIPE_SNS_EXPECTED_ACCOUNTS[platform]) {
      worker.validateRecipeSnsPublishJobParameters(legacy);
    } else {
      assert.throws(() => worker.validateRecipeSnsPublishJobParameters(legacy), /許可リスト/);
    }
  }
}
console.log("SNS accounts: all 9 platform/account combinations, legacy jobs, invalid accounts and mismatched success results passed");
