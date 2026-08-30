import assert from "node:assert/strict";
import {
  RECIPE_SNS_PLATFORMS,
  countRecipeSnsCharacters,
  ensureRecipeSnsAiResultDestinationUrl,
  ensureRecipeSnsPostDestinationUrl,
  formatRecipeSnsPost,
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

const destinationUrl = "https://buta.aizubrandhall-lp2.com/";
const postsWithUrl = ensureRecipeSnsAiResultDestinationUrl(merged, destinationUrl);
for (const platform of RECIPE_SNS_PLATFORMS) {
  const post = postsWithUrl.posts[platform.id];
  assert.equal(post.text.split(destinationUrl).length - 1, 1, `${platform.label} must contain the LP URL exactly once`);
  assert.ok(
    countRecipeSnsCharacters(formatRecipeSnsPost(post)) <= platform.maxLength,
    `${platform.label} must remain within its character limit`,
  );
}
assert.equal(merged.posts.x.text, "new x", "URL normalization must not mutate the source result");

const duplicateAndLong = ensureRecipeSnsPostDestinationUrl({
  text: `${"説明".repeat(300)}\n${destinationUrl}\n${destinationUrl}`,
  hashtags: ["#one", "#two", "#three"],
  rationale: "test",
}, "x", destinationUrl);
assert.equal(duplicateAndLong.text.split(destinationUrl).length - 1, 1);
assert.ok(countRecipeSnsCharacters(formatRecipeSnsPost(duplicateAndLong)) <= 400);
assert.deepEqual(duplicateAndLong.hashtags, ["#one", "#two", "#three"]);

const story = ensureRecipeSnsPostDestinationUrl({
  text: "ストーリー向けの長い説明文".repeat(10),
  hashtags: [],
  rationale: "test",
}, "instagram_story", destinationUrl);
assert.equal(story.text.split(destinationUrl).length - 1, 1);
assert.ok(countRecipeSnsCharacters(formatRecipeSnsPost(story)) <= 50);

console.log("recipe SNS targeted regeneration merge verified");
