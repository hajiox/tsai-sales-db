const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const bridge = fs.readFileSync(path.join(root, "tools", "tsa-codex-bridge", "bridge.mjs"), "utf8");
const required = fs.readFileSync(path.join(root, "lib", "web-sales-codex", "bridge-version.ts"), "utf8");
const version = bridge.match(/const VERSION = "([^"]+)"/)?.[1];
assert.equal(required.match(/REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/)?.[1], version);
assert.match(bridge, /ecProductNameProtocolVersion: 2/);
assert.match(bridge, /ecProductNameAiProtocolVersion: 1/);
assert.match(bridge, /ecProductNameAiModel: "gpt-5\.6-sol"/);
assert.match(bridge, /newProductNames/);
assert.match(bridge, /EC_PRODUCT_NAME_MAX_LENGTHS/);
assert.match(bridge, /"ec_product_name_update"/);
assert.match(bridge, /executeEcProductNameUpdateJob/);
assert.match(bridge, /executeEcProductNameGenerateJob/);
assert.match(bridge, /model: parameters\.model/);
assert.match(bridge, /reasoningEffort: parameters\.reasoningEffort/);
assert.match(bridge, /ec_product_name_progress_checkpoint/);
assert.match(bridge, /ec-product-name-validate/);
assert.match(bridge, /Use \$update-aizu-ec-product-names/);
assert.match(bridge, /never change price, sale price, points, inventory/i);
assert.match(bridge, /Continue no other sites in this session/);
assert.match(bridge, /for \(let index = 0; index < parameters\.targets\.length/);

const installer = fs.readFileSync(path.join(root, "tools", "tsa-codex-bridge", "install-bridge.ps1"), "utf8");
const skillContract = JSON.parse(fs.readFileSync(path.join(root, "tools", "tsa-codex-bridge", "skill-contract.json"), "utf8"));
assert.match(installer, /ec-product-name-plan\.schema\.json/);
assert.match(installer, /ec-product-name-result\.schema\.json/);
assert.match(installer, /ec-product-name-ai\.schema\.json/);
assert.equal(skillContract.tasks.ec_product_name_update.skill, "update-aizu-ec-product-names");
assert.equal(skillContract.tasks.ec_product_name_generate.skill, "generate-aizu-ec-product-names");

const generationSkill = fs.readFileSync(path.join(root, "tools", "tsa-codex-bridge", "skills", "generate-aizu-ec-product-names", "SKILL.md"), "utf8");
assert.match(generationSkill, /外部サイトの閲覧や変更は行わない/);
assert.match(generationSkill, /過去チャット参照をしない/);

const generationRoute = fs.readFileSync(path.join(root, "app", "api", "recipe", "[id]", "ec-product-name-ai", "route.ts"), "utf8");
assert.match(generationRoute, /ec_product_name_generate/);
assert.match(generationRoute, /EC_PRODUCT_NAME_AI_MODEL/);
assert.doesNotMatch(generationRoute, /api\.openai\.com/);

const generationImport = fs.readFileSync(path.join(root, "app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "ec-product-name-ai-import", "route.ts"), "utf8");
assert.match(generationImport, /validateEcProductNameAiResult/);
assert.match(generationImport, /recipe_ec_product_name_ai_generations/);

const generationSchema = JSON.parse(fs.readFileSync(path.join(root, "tools", "tsa-codex-bridge", "ec-product-name-ai.schema.json"), "utf8"));
function assertStrictObjectSchemas(value, location = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  if (value.type === "object" && value.properties) {
    assert.deepEqual(
      [...(value.required || [])].sort(),
      Object.keys(value.properties).sort(),
      `${location} must require every declared property for OpenAI strict structured output`,
    );
    assert.equal(value.additionalProperties, false, `${location} must reject undeclared properties`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertStrictObjectSchemas(child, `${location}.${key}`);
  }
}
assertStrictObjectSchemas(generationSchema);

const solMigration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260825130000_ec_product_name_ai_sol.sql"),
  "utf8",
);
assert.match(solMigration, /ecProductNameAiModel' = 'gpt-5\.6-sol'/);

const completionRoute = fs.readFileSync(path.join(root, "app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "route.ts"), "utf8");
assert.match(completionRoute, /complete_ec_product_name_codex_job/);
assert.match(completionRoute, /dispatchRecipeProductNameTsgNotifications/);
assert.match(completionRoute, /ec_product_name_plan_saved/);

const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260824150000_ec_product_name_update_jobs.sql"), "utf8");
assert.match(migration, /recipe_ec_product_name_revisions/);
assert.match(migration, /release_recipe_ec_product_name_batch_jobs/);
assert.match(migration, /claim_recipe_product_name_tsg_batch_notifications/);
assert.match(migration, /completed_job\.parameters->>'productNameRevisionId'/);

console.log("EC product name Bridge checks passed.");
