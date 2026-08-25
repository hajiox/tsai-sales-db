const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const required = read("lib", "web-sales-codex", "bridge-version.ts");
const skillContract = JSON.parse(read("tools", "tsa-codex-bridge", "skill-contract.json"));
const version = bridge.match(/const VERSION = "([^"]+)"/)?.[1];

assert.equal(required.match(/REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/)?.[1], version);
assert.match(bridge, /ecCatchcopyProtocolVersion: 1/);
assert.match(bridge, /ecCatchcopyAiProtocolVersion: 1/);
assert.match(bridge, /ecCatchcopyAiModel: "gpt-5\.6-sol"/);
assert.match(bridge, /const EC_CATCHCOPY_TARGETS = new Set\(\["rakuten", "yahoo"\]\)/);
assert.match(bridge, /executeEcCatchcopyUpdateJob/);
assert.match(bridge, /executeEcCatchcopyGenerateJob/);
assert.match(bridge, /ec_catchcopy_progress_checkpoint/);
assert.match(bridge, /Use \$update-aizu-ec-catchcopies/);
assert.match(bridge, /Use \$generate-aizu-ec-catchcopies/);
assert.match(bridge, /for \(let index = 0; index < parameters\.targets\.length/);

const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");
for (const expected of [
  "ec-catchcopy-plan.schema.json",
  "ec-catchcopy-result.schema.json",
  "ec-catchcopy-ai.schema.json",
]) assert.match(installer, new RegExp(expected.replace(/[.]/g, "\\.")));
assert.equal(skillContract.tasks.ec_catchcopy_update.skill, "update-aizu-ec-catchcopies");
assert.equal(skillContract.tasks.ec_catchcopy_generate.skill, "generate-aizu-ec-catchcopies");

const generationSkill = read("tools", "tsa-codex-bridge", "skills", "generate-aizu-ec-catchcopies", "SKILL.md");
assert.match(generationSkill, /外部サイト/);
assert.match(generationSkill, /過去チャット/);

const updateSkill = read("tools", "tsa-codex-bridge", "skills", "update-aizu-ec-catchcopies", "SKILL.md");
assert.match(updateSkill, /楽天/);
assert.match(updateSkill, /Yahoo/);
assert.doesNotMatch(updateSkill, /Amazonのキャッチコピー/);

for (const schemaName of ["ec-catchcopy-plan.schema.json", "ec-catchcopy-result.schema.json", "ec-catchcopy-ai.schema.json"]) {
  JSON.parse(read("tools", "tsa-codex-bridge", schemaName));
}

const generationRoute = read("app", "api", "recipe", "[id]", "ec-catchcopy-ai", "route.ts");
assert.match(generationRoute, /ec_catchcopy_generate/);
assert.match(generationRoute, /EC_CATCHCOPY_AI_MODEL/);
assert.doesNotMatch(generationRoute, /api\.openai\.com/);

const completionRoute = read("app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "route.ts");
assert.match(completionRoute, /complete_ec_catchcopy_codex_job/);
assert.match(completionRoute, /ec_catchcopy_progress_checkpoint/);

const migration = read("supabase", "migrations", "20260825160000_ec_catchcopy_ai_bridge.sql");
assert.match(migration, /ec_catchcopies_by_site/);
assert.match(migration, /recipe_ec_catchcopy_revisions/);
assert.match(migration, /release_recipe_ec_catchcopy_batch_jobs/);
assert.match(migration, /ecCatchcopyAiModel' = 'gpt-5\.6-sol'/);

console.log("EC catchcopy Bridge checks passed.");
