const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolute = path.join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(absolute);
  return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
});
const contract = JSON.parse(read("tools", "tsa-codex-bridge", "skill-contract.json"));
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");
const taskTypes = read("lib", "web-sales-codex", "types.ts");

const expectedTasks = {
  connection_test: null,
  web_sales_import: "tsa-web-sales-csv",
  ad_cost_import: "tsa-ad-cost-csv",
  ec_profit_import: "tsa-ec-profit-report",
  ec_price_update: "update-aizu-ec-prices",
  ec_product_name_update: "update-aizu-ec-product-names",
  ec_product_name_generate: "generate-aizu-ec-product-names",
  ec_catchcopy_update: "update-aizu-ec-catchcopies",
  ec_catchcopy_generate: "generate-aizu-ec-catchcopies",
  recipe_sns_generate: "generate-aizu-sns-assets",
  web_sales_analysis: "tsa-web-sales-analysis",
};

assert.match(contract.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
assert.deepEqual(Object.keys(contract.tasks), Object.keys(expectedTasks));
for (const [taskKey, expectedSkill] of Object.entries(expectedTasks)) {
  const task = contract.tasks[taskKey];
  assert.ok(task, `missing task contract: ${taskKey}`);
  assert.equal(task.skill, expectedSkill, `wrong Skill for ${taskKey}`);
  if (expectedSkill === null) {
    assert.equal(task.mode, "deterministic");
    continue;
  }
  assert.ok(["codex", "preflight_then_codex"].includes(task.mode), `wrong mode for ${taskKey}`);
  const skillPath = path.join(root, "tools", "tsa-codex-bridge", "skills", expectedSkill, "SKILL.md");
  assert.ok(fs.existsSync(skillPath), `Skill is not bundled: ${expectedSkill}`);
  const skill = fs.readFileSync(skillPath, "utf8");
  assert.match(skill, new RegExp(`^name:\\s*${expectedSkill}$`, "m"));
  assert.match(skill, /## Bridge Input Contract/);
  assert.match(skill, /fresh, non-resumed `codex exec`/);
  assert.match(skill, /Never open, read, search, or reuse app Chats/);
  assert.match(skill, /compact Bridge job input as complete/);
  assert.match(bridge, new RegExp(`Use \\$${expectedSkill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(taskTypes, new RegExp(`"${taskKey}"`));
}

assert.match(bridge, /const SKILL_CONTRACT = loadSkillContract\(SKILL_CONTRACT_PATH\)/);
assert.match(bridge, /assertNoConversationContext\(job\);/);
assert.match(bridge, /prepareSkillControlledPrompt\(taskKey, prompt\)/);
assert.match(bridge, /child\.stdin\.end\(controlledPrompt, "utf8"\)/);
assert.match(bridge, /args\[0\] !== "exec"/);
assert.match(bridge, /String\(arg\)\.toLowerCase\(\) === "resume"/);
assert.match(bridge, /chatHistoryLoaded: false/);
assert.match(bridge, /freshNonResumedSession: true/);
assert.match(bridge, /skillContractVersion: SKILL_CONTRACT\.version/);
assert.equal((bridge.match(/spawnSkillCodex\(job\.task_key, prompt, args/g) || []).length, 8);
assert.equal((bridge.match(/spawnCodexProcess\(args, options\)/g) || []).length, 2);
assert.doesNotMatch(bridge, /spawnCodex\(/);
assert.doesNotMatch(bridge, /stdin\.end\(prompt/);
assert.doesNotMatch(bridge, /codexSessionId|TSA_CODEX_SESSION_ID/);

const argBuilder = bridge.slice(
  bridge.indexOf("function buildIsolatedCodexArgs"),
  bridge.indexOf("function appendEventLine"),
);
assert.match(argBuilder, /"exec", "--json"/);
assert.doesNotMatch(argBuilder, /"resume"/);

assert.match(installer, /"skill-contract\.json"/);
assert.match(installer, /\$bridgeSkillNames/);
assert.match(installer, /foreach \(\$skillName in \$bridgeSkillNames\)/);
assert.doesNotMatch(installer, /CodexSessionId|codexSessionId|TSA_CODEX_SESSION_ID/);

const queueProducerSource = [
  ...sourceFiles(path.join(root, "app", "api")),
  ...sourceFiles(path.join(root, "lib")),
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert.doesNotMatch(
  queueProducerSource,
  /\b(?:codexSessionId|chatId|chatHistory|conversationHistory|conversationId|threadId|rolloutId|previousResponseId|transcript)\b/,
);

console.log(`Bridge Skill contract ${contract.version}: ${Object.keys(expectedTasks).length} tasks, ${Object.values(expectedTasks).filter(Boolean).length} dedicated Skills verified.`);
