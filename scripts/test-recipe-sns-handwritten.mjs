import assert from "node:assert/strict";
import fs from "node:fs";
import {
  RECIPE_SNS_PLATFORMS, isRecipeSnsImageMode, recipeSnsImageModeLabel,
  validateRecipeSnsBridgeResult, validateRecipeSnsTargetBridgeResult, mergeRecipeSnsTargetResult,
} from "../lib/recipe-sns.ts";

assert.ok(isRecipeSnsImageMode("handwritten"));
assert.equal(recipeSnsImageModeLabel("handwritten"), "手書き文字");
const post = { text: "商品の特徴をご紹介します。", hashtags: [], rationale: "特徴", link_url: "" };
const overlay = { headline: "", subline: "", placement: "none" };
const image = { source: "generated", file_path: "", prompt_summary: "太麺へ手書き文字と矢印" };
const packet = {
  overall_angle: "商品の特徴", variation_key: "features", source_gaps: [], writing_tone: "official", image_mode: "handwritten",
  posts: Object.fromEntries(RECIPE_SNS_PLATFORMS.map(p => [p.id, { ...post, hashtags: p.id === "instagram" ? Array.from({length:10}, (_,i) => `#特徴${i}`) : [] }])),
  creative_overlays: Object.fromEntries(RECIPE_SNS_PLATFORMS.map(p => [p.id, overlay])),
  generated_images: Object.fromEntries(RECIPE_SNS_PLATFORMS.map(p => [p.id, image])),
};
const base = validateRecipeSnsBridgeResult(packet, "handwritten", "official");
assert.equal(base.image_mode, "handwritten");
for (const platform of RECIPE_SNS_PLATFORMS) {
  const target = validateRecipeSnsTargetBridgeResult({ ...packet, platform: platform.id, post: packet.posts[platform.id], creative_overlay: overlay, generated_image: image }, "handwritten", platform.id, "official");
  const merged = mergeRecipeSnsTargetResult(base, target);
  assert.equal(merged.image_mode, "handwritten");
  for (const other of RECIPE_SNS_PLATFORMS.filter(p => p.id !== platform.id)) assert.deepEqual(merged.posts[other.id], base.posts[other.id]);
}
assert.throws(() => validateRecipeSnsBridgeResult(packet, "creative", "official"), /一致しません/);
assert.throws(() => validateRecipeSnsTargetBridgeResult({ ...packet, platform: "x", post, creative_overlay: overlay, generated_image: { ...image, source: "original" } }, "handwritten", "x", "official"));
for (const file of ["recipe-sns-result.schema.json", "recipe-sns-target-result.schema.json"]) {
  const schema = JSON.parse(fs.readFileSync(new URL(`../tools/tsa-codex-bridge/${file}`, import.meta.url), "utf8"));
  assert.ok(schema.properties.image_mode.enum.includes("handwritten"));
}
console.log("Handwritten mode: full generation, four single-target merges, mode/source guards and schemas passed.");
