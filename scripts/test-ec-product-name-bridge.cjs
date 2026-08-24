const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const bridge = fs.readFileSync(path.join(root, "tools", "tsa-codex-bridge", "bridge.mjs"), "utf8");
const required = fs.readFileSync(path.join(root, "lib", "web-sales-codex", "bridge-version.ts"), "utf8");
const version = bridge.match(/const VERSION = "([^"]+)"/)?.[1];
assert.equal(required.match(/REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/)?.[1], version);
assert.match(bridge, /ecProductNameProtocolVersion: 1/);
assert.match(bridge, /"ec_product_name_update"/);
assert.match(bridge, /executeEcProductNameUpdateJob/);
assert.match(bridge, /ec_product_name_progress_checkpoint/);
assert.match(bridge, /ec-product-name-validate/);
assert.match(bridge, /Use \$update-aizu-ec-product-names/);
assert.match(bridge, /never change price, sale price, points, inventory/i);
assert.match(bridge, /Continue no other sites in this session/);
assert.match(bridge, /for \(let index = 0; index < parameters\.targets\.length/);

const installer = fs.readFileSync(path.join(root, "tools", "tsa-codex-bridge", "install-bridge.ps1"), "utf8");
assert.match(installer, /ec-product-name-plan\.schema\.json/);
assert.match(installer, /ec-product-name-result\.schema\.json/);
assert.match(installer, /update-aizu-ec-product-names/);

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
