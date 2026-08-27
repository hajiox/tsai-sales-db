import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EC_PRODUCT_CONTENT_MAX_CHARACTERS,
  buildEcProductContentForTarget,
  ecProductContentCharacterCount,
  toCheckProductPoints,
  toSquareProductPoints,
  validateEcProductContentAiResult,
} from "../lib/ec-product-content-codex.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

assert.equal(toSquareProductPoints("✅️国産\n☑送料無料"), "■国産\n■送料無料");
assert.equal(toCheckProductPoints("■国産\n■送料無料"), "✅️国産\n✅️送料無料");

const amazon = buildEcProductContentForTarget("amazon", "■国産", "商品説明");
assert.equal(amazon.fieldLayout, "separate");
assert.equal(amazon.markerStyle, "check");
assert.equal(amazon.productPoints, "✅️国産");
assert.equal(amazon.combinedContent, null);

for (const target of ["rakuten", "yahoo"]) {
  const value = buildEcProductContentForTarget(target, "✅️国産", "商品説明");
  assert.equal(value.fieldLayout, "combined");
  assert.equal(value.markerStyle, "square");
  assert.equal(value.productPoints, "■国産");
  assert.equal(value.combinedContent, "■国産\n\n商品説明");
}

for (const target of ["mercari", "base", "qoo10", "tiktok"]) {
  const value = buildEcProductContentForTarget(target, "■国産", "商品説明");
  assert.equal(value.fieldLayout, "combined");
  assert.equal(value.markerStyle, "check");
  assert.equal(value.combinedContent, "✅️国産\n\n商品説明");
}

assert.equal(ecProductContentCharacterCount("■abc", "def"), 7);
const adjusted = validateEcProductContentAiResult({
  product_points: "✅️要点",
  web_description: "説明",
  total_characters: 999,
  preserved_facts: ["要点"],
  removed_or_condensed: [],
  rationale: "重複を整理",
});
assert.equal(adjusted.product_points, "■要点");
assert.equal(adjusted.total_characters, ecProductContentCharacterCount("■要点", "説明"));
assert.throws(() => validateEcProductContentAiResult({
  product_points: "■" + "a".repeat(EC_PRODUCT_CONTENT_MAX_CHARACTERS),
  web_description: "b",
  total_characters: EC_PRODUCT_CONTENT_MAX_CHARACTERS + 2,
}), /500文字を超えています/);

const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const requiredVersion = read("lib", "web-sales-codex", "bridge-version.ts");
const bridgeVersion = bridge.match(/const VERSION = "([^"]+)"/)?.[1];
assert.equal(requiredVersion.match(/REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/)?.[1], bridgeVersion);
assert.match(bridge, /ecProductContentProtocolVersion: 1/);
assert.match(bridge, /ecProductContentAiProtocolVersion: 1/);
assert.match(bridge, /ecProductContentAiModel: "gpt-5\.6-sol"/);
assert.match(bridge, /executeEcProductContentUpdateJob/);
assert.match(bridge, /executeEcProductContentGenerateJob/);
assert.match(bridge, /ec_product_content_progress_checkpoint/);
assert.match(bridge, /Use \$update-aizu-ec-product-content/);
assert.match(bridge, /Use \$optimize-aizu-ec-product-content/);

const updateSkill = read("tools", "tsa-codex-bridge", "skills", "update-aizu-ec-product-content", "SKILL.md");
assert.match(updateSkill, /Amazon/);
assert.match(updateSkill, /楽天/);
assert.match(updateSkill, /Yahoo/);
assert.match(updateSkill, /巨大/);
assert.match(updateSkill, /過去.*Chat|Chat.*過去/);
assert.match(updateSkill, /1サイト/);

const optimizeSkill = read("tools", "tsa-codex-bridge", "skills", "optimize-aizu-ec-product-content", "SKILL.md");
assert.match(optimizeSkill, /500/);
assert.match(optimizeSkill, /外部サイト/);
assert.match(optimizeSkill, /過去.*Chat|Chat.*過去/);

for (const schemaName of [
  "ec-product-content-ai.schema.json",
  "ec-product-content-plan.schema.json",
  "ec-product-content-result.schema.json",
]) JSON.parse(read("tools", "tsa-codex-bridge", schemaName));

const migration = read("supabase", "migrations", "20260827210000_ec_product_content_bridge.sql");
assert.match(migration, /ec_product_content_update/);
assert.match(migration, /ec_product_content_generate/);
assert.match(migration, /recipe_ec_product_content_ai_generations/);
assert.match(migration, /ecProductContentAiModel' = 'gpt-5\.6-sol'/);

const page = read("app", "recipe", "[id]", "page.tsx");
const panelIndex = page.indexOf("商品ポイント & Web商品説明");
const pointsIndex = page.indexOf("商品ポイント", panelIndex + 1);
const descriptionIndex = page.indexOf("Web商品説明", pointsIndex + 1);
assert.ok(panelIndex >= 0 && pointsIndex > panelIndex && descriptionIndex > pointsIndex);
assert.match(page, /EcProductContentAiAdjuster/);
assert.match(page, /EcProductContentSyncControls/);

console.log("EC product content Bridge checks passed.");
