import assert from "node:assert/strict";
import {
  mergeRecipeSnsTargetResult,
  validateRecipeSnsAiResult,
  validateRecipeSnsTargetBridgeResult,
} from "../lib/recipe-sns.ts";

const base = validateRecipeSnsAiResult({
  overall_angle: "base",
  variation_key: "base-angle",
  source_gaps: [],
  image_mode: "creative",
  posts: {
    x: { text: "old x", hashtags: [], rationale: "base" },
    instagram: {
      text: "old instagram",
      hashtags: Array.from({ length: 10 }, (_, index) => `#tag${index}`),
      rationale: "base",
    },
    instagram_story: { text: "old story", hashtags: [], rationale: "base" },
    threads: { text: "old threads", hashtags: [], rationale: "base" },
  },
  creative_overlays: Object.fromEntries(
    ["x", "instagram", "instagram_story", "threads"].map((platform) => [platform, {
      headline: `old ${platform}`,
      subline: "",
      placement: "top-left",
    }]),
  ),
});

const target = validateRecipeSnsTargetBridgeResult({
  overall_angle: "new x only",
  variation_key: "new-angle",
  source_gaps: ["none"],
  image_mode: "creative",
  platform: "x",
  post: { text: "new x", hashtags: ["#new"], rationale: "regenerated" },
  creative_overlay: { headline: "new headline", subline: "new subline", placement: "bottom-right" },
  generated_image: { source: "generated", file_path: "C:\\jobs\\x.png", prompt_summary: "new x image" },
}, "creative", "x");

const merged = mergeRecipeSnsTargetResult(base, target);
assert.equal(merged.posts.x.text, "new x");
assert.equal(merged.creative_overlays.x.headline, "new headline");
for (const platform of ["instagram", "instagram_story", "threads"]) {
  assert.deepEqual(merged.posts[platform], base.posts[platform]);
  assert.deepEqual(merged.creative_overlays[platform], base.creative_overlays[platform]);
}
assert.equal(base.posts.x.text, "old x", "base history must remain immutable");
assert.equal(merged.image_mode, "creative");
assert.equal(merged.variation_key, "new-angle");

console.log("recipe SNS targeted regeneration merge verified");
