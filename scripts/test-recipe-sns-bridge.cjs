const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");
const requiredVersion = read("lib", "web-sales-codex", "bridge-version.ts");
const types = read("lib", "web-sales-codex", "types.ts");
const skill = read("tools", "tsa-codex-bridge", "skills", "generate-aizu-sns-posts", "SKILL.md");
const schema = JSON.parse(read("tools", "tsa-codex-bridge", "recipe-sns-result.schema.json"));
const skillContract = JSON.parse(read("tools", "tsa-codex-bridge", "skill-contract.json"));

const bridgeVersion = bridge.match(/const VERSION = "([^"]+)"/)?.[1];
assert.ok(bridgeVersion);
assert.equal(requiredVersion.match(/REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/)?.[1], bridgeVersion);
assert.match(types, /\| "recipe_sns_generate"/);
assert.match(bridge, /recipeSnsProtocolVersion: 1/);
assert.match(bridge, /recipeSnsModel: "gpt-5\.6-sol"/);
assert.match(bridge, /const HEADLESS_SAFE_TASK_KEYS = new Set\(\[[\s\S]*?"recipe_sns_generate"/);
assert.match(bridge, /codexTaskKeys: config\.allowedTaskKeys/);
assert.match(bridge, /job\.task_key === "recipe_sns_generate"/);
assert.match(bridge, /executeRecipeSnsGenerateJob\(job\)/);

const validator = bridge.slice(
  bridge.indexOf("function validateRecipeSnsGenerateJobParameters"),
  bridge.indexOf("async function executeRecipeSnsGenerateJob"),
);
assert.match(validator, /parameters\.model \|\| ""\) !== "gpt-5\.6-sol"/);
assert.match(validator, /parameters\.reasoningEffort \|\| ""\) !== "medium"/);
assert.match(validator, /\^2026-08-25\\\.\.\+\$/);
assert.match(validator, /sourceSnapshot\.recipeId/);
assert.match(validator, /sourceSnapshot\.variationKey/);
assert.match(validator, /generationId/);
assert.match(validator, /RECIPE_SNS_PLATFORM_RULES/);
for (const platform of ["x", "instagram", "instagram_story", "threads"]) {
  assert.match(bridge, new RegExp(`${platform}: \\{`));
}

const handler = bridge.slice(
  bridge.indexOf("async function executeRecipeSnsGenerateJob"),
  bridge.indexOf("async function executeAnalysisJob"),
);
assert.match(handler, /Use \$generate-aizu-sns-posts/);
assert.match(handler, /Do not call tools, run commands, browse the web, control a browser/);
assert.match(handler, /or read chat history/);
assert.match(handler, /tool_call\|command_execution\|web_search/);
assert.match(handler, /禁止されたツール操作/);
assert.match(handler, /JSON\.stringify\(packet\)/);
assert.match(handler, /buildIsolatedCodexArgs/);
assert.doesNotMatch(handler, /\bresume\b/i);
assert.match(handler, /recipe-sns-import/);
assert.match(handler, /uploadArtifact\(job\.id, packetFile, "source"\)/);
assert.match(handler, /uploadArtifact\(job\.id, outputFile, "output"\)/);
assert.match(handler, /uploadArtifact\(job\.id, jsonlLog, "log"\)/);
assert.match(handler, /status: "completed"/);
assert.match(handler, /progress: 100/);

for (const expected of ["recipe-sns-result.schema.json"]) {
  assert.match(installer, new RegExp(expected.replace(/[.]/g, "\\.")));
}
assert.equal(skillContract.tasks.recipe_sns_generate.skill, "generate-aizu-sns-posts");
assert.match(skill, /外部サイト閲覧/);
assert.match(skill, /過去チャット参照/);

function assertStrictObjectSchemas(value, location = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  if (value.type === "object" && value.properties) {
    assert.deepEqual(
      [...(value.required || [])].sort(),
      Object.keys(value.properties).sort(),
      `${location} must require every declared property`,
    );
    assert.equal(value.additionalProperties, false, `${location} must reject undeclared properties`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertStrictObjectSchemas(child, `${location}.${key}`);
  }
}
assertStrictObjectSchemas(schema);

function assertCodexOutputSchemaCompatibility(value, location = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  assert.equal(
    Object.hasOwn(value, "uniqueItems"),
    false,
    `${location} uses uniqueItems, which Codex structured output rejects`,
  );
  for (const [key, child] of Object.entries(value)) {
    assertCodexOutputSchemaCompatibility(child, `${location}.${key}`);
  }
}
assertCodexOutputSchemaCompatibility(schema);

console.log("Recipe SNS Bridge checks passed.");
