const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const migration = read("supabase", "migrations", "20260904130000_ec_product_registration_bridge.sql");
const reconcileMigration = read("supabase", "migrations", "20260904144000_ec_product_registration_existing_reconcile.sql");
const mappingTypeFixMigration = read("supabase", "migrations", "20260904152500_fix_ec_product_registration_qoo10_mapping_type.sql");
const enqueueRoute = read("app", "api", "recipe", "[id]", "ec-product-registration-jobs", "route.ts");
const validateRoute = read("app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "ec-product-register-validate", "route.ts");
const submitRoute = read("app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "ec-product-register-submit-start", "route.ts");
const completionRoute = read("app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "route.ts");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");
const guard = read("tools", "tsa-codex-bridge", "codex-run-guard.mjs");
const skill = read("tools", "tsa-codex-bridge", "skills", "register-aizu-ec-products", "SKILL.md");
const component = read("app", "recipe", "_components", "EcPriceSyncControls.tsx");
const jobServer = read("lib", "ec-product-registration-job-server.ts");

for (const schemaName of ["ec-product-register-plan.schema.json", "ec-product-register-result.schema.json"]) {
  const schema = JSON.parse(read("tools", "tsa-codex-bridge", schemaName));
  for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
    assert.ok(propertySchema.type, `${schemaName}: ${propertyName} must declare a type for Codex structured output`);
  }
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.length >= 15, `${schemaName} must preserve full evidence`);
}

assert.match(migration, /recipe_ec_product_registration_intents/);
assert.match(migration, /UNIQUE \(target, seller_code\)/);
assert.match(migration, /UNIQUE \(target, jan_code\)/);
assert.match(migration, /UNIQUE \(target, product_identifier\)/);
assert.match(migration, /enqueue_ec_product_register_job/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /max_attempts, scheduled_at[\s\S]*55, 1, p_scheduled_at/);
assert.match(migration, /mark_ec_product_register_submission_started/);
assert.match(migration, /submit_started_at IS NULL/);
assert.match(migration, /status = CASE WHEN submit_started_at IS NULL THEN 'authorized' ELSE 'needs_review' END/);
assert.match(migration, /channel = 'qoo10'/);
assert.doesNotMatch(migration, /ON CONFLICT[\s\S]*DO UPDATE/);
assert.match(reconcileMigration, /NOT IN \('created', 'updated', 'already_exists'\)/);
assert.match(reconcileMigration, /complete_ec_product_register_job/);
assert.match(mappingTypeFixMigration, /mapping\.product_id = v_linked_product_id::text/);
assert.match(mappingTypeFixMigration, /VALUES \(v_product_name, v_linked_product_id::text\)/);

assert.match(enqueueRoute, /buildEcProductRegisterPayloadHash/);
assert.match(enqueueRoute, /payloadHash/);
assert.match(enqueueRoute, /enqueue_ec_product_register_job/);
assert.match(enqueueRoute, /target:\s*EC_PRODUCT_REGISTER_TARGET/);
assert.doesNotMatch(enqueueRoute, /\.from\("web_sales_codex_jobs"\)\s*\.insert/);
assert.match(validateRoute, /recipe_ec_product_registration_intents/);
assert.match(validateRoute, /intent\.status !== "authorized"/);
assert.match(submitRoute, /mark_ec_product_register_submission_started/);
assert.match(completionRoute, /final_seller_code/);
assert.match(completionRoute, /final_jan_code/);
assert.match(completionRoute, /final_image_urls/);
assert.match(completionRoute, /description_verified/);
assert.match(completionRoute, /image_sources_verified/);
assert.match(completionRoute, /image-qoo10\\\.jp/);

assert.match(bridge, /job\.task_key === "ec_product_register"/);
assert.match(bridge, /ecProductRegisterProtocolVersion:\s*1/);
assert.match(bridge, /ec-product-register-submit-start/);
assert.ok(bridge.indexOf("ec-product-register-submit-start") < bridge.indexOf("ec_product_register_write_starting"));
assert.match(bridge, /submit\/save exactly once/);
assert.match(bridge, /Never retry the submit action/);
assert.match(bridge, /exactImageUrls/);
assert.match(bridge, /qoo10HostedImages/);
assert.match(bridge, /image_sources_verified/);
assert.match(bridge, /EC商品登録/);
assert.match(installer, /"ec_product_register"/);
assert.match(installer, /ec-product-register-result\.schema\.json/);
assert.match(installer, /ec-product-register-plan\.schema\.json/);
assert.match(guard, /"ec_product_register"/);

assert.match(skill, /^name:\s*register-aizu-ec-products$/m);
assert.match(skill, /fresh, non-resumed `codex exec`/);
assert.match(skill, /Never open, read, search, or reuse app Chats/);
assert.match(skill, /送信操作は1回だけ/);
assert.match(skill, /タイムアウト[\s\S]*再送信しない/);
assert.match(skill, /update_existing/);
assert.match(skill, /末尾の完全一致する店舗名「会津ブランド館」/);
assert.match(skill, /「リスト編集」で「商品識別コード」列/);
assert.match(skill, /JavaScriptソース、非公開API、別ブラウザは使わない/);
assert.match(skill, /CDN URLの文字列が元URLと違うこと自体は失敗にしない/);
assert.match(component, /Qoo10へ商品登録/);
assert.match(component, /expectedRecipeSnapshot/);
assert.match(component, /二重登録防止/);
assert.match(jobServer, /stableJson\(candidate\.reference\) !== stableJson\(right\.reference\)/);
assert.match(jobServer, /stableJson\(candidate\.images\) !== stableJson\(right\.images\)/);
assert.match(bridge, /\["planned", "update_existing"\]\.includes\(plan\.operation\)/);
assert.match(bridge, /\["created", "updated", "already_exists"\]/);
assert.match(bridge, /complete this read-only phase in at most 45 browser tool calls/);
assert.match(bridge, /never repeat submit/);
assert.match(bridge, /model: "gpt-5\.6-sol"[\s\S]{0,120}reasoningEffort: "medium"/);

console.log("EC product registration Bridge contract verified.");
