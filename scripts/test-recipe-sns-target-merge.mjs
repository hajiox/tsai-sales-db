import assert from "node:assert/strict";
import {
  RECIPE_SNS_PLATFORMS,
  countRecipeSnsCharacters,
  ensureRecipeSnsAiResultDestinationUrl,
  ensureRecipeSnsPostDestinationUrl,
  formatRecipeSnsPost,
  mergeRecipeSnsTargetResult,
  validateRecipeSnsAiResult,
  validateRecipeSnsBridgeResult,
  validateRecipeSnsTargetBridgeResult,
} from "../lib/recipe-sns.ts";

const base = validateRecipeSnsAiResult({
  overall_angle: "base",
  variation_key: "base-angle",
  source_gaps: [],
  writing_tone: "developer",
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
  writing_tone: "developer",
  image_mode: "creative",
  platform: "x",
  post: { text: "new x", hashtags: ["#new"], rationale: "regenerated", link_url: "" },
  creative_overlay: { headline: "new headline", subline: "new subline", placement: "bottom-right" },
  generated_image: { source: "generated", file_path: "C:\\jobs\\x.png", prompt_summary: "new x image" },
}, "creative", "x", "developer");

const merged = mergeRecipeSnsTargetResult(base, target);
const targetWithoutLocalPath = validateRecipeSnsTargetBridgeResult({
  ...target,
  generated_image: { ...target.generated_image, file_path: "" },
}, "creative", "x", "developer");
assert.equal(
  targetWithoutLocalPath.generated_image.file_path,
  "",
  "Bridge-owned artifacts do not require an AI-supplied local path",
);

const allPlatforms = validateRecipeSnsBridgeResult({
  ...base,
  generated_images: Object.fromEntries(RECIPE_SNS_PLATFORMS.map((platform) => [platform.id, {
    source: "generated",
    file_path: "",
    prompt_summary: `${platform.label} image`,
  }])),
}, "creative", "developer");
for (const platform of RECIPE_SNS_PLATFORMS) {
  assert.equal(allPlatforms.generated_images[platform.id].file_path, "");
}

assert.equal(merged.posts.x.text, "new x");
assert.equal(merged.creative_overlays.x.headline, "new headline");
for (const platform of ["instagram", "instagram_story", "threads"]) {
  assert.deepEqual(merged.posts[platform], base.posts[platform]);
  assert.deepEqual(merged.creative_overlays[platform], base.creative_overlays[platform]);
}
assert.equal(base.posts.x.text, "old x", "base history must remain immutable");
assert.equal(merged.image_mode, "creative");
assert.equal(merged.writing_tone, "developer");
assert.equal(merged.variation_key, "new-angle");

assert.throws(() => validateRecipeSnsTargetBridgeResult({
  ...target,
  writing_tone: "staff",
}, "creative", "x", "developer"), /口調が依頼内容と一致しません/);

const destinationUrl = "https://buta.aizubrandhall-lp2.com/";
const postsWithUrl = ensureRecipeSnsAiResultDestinationUrl(merged, destinationUrl);
for (const platform of RECIPE_SNS_PLATFORMS) {
  const post = postsWithUrl.posts[platform.id];
  if (platform.id === "instagram_story") {
    assert.equal(post.text.includes(destinationUrl), false, "IG Story text must not contain the LP URL");
    assert.equal(post.linkUrl, destinationUrl, "IG Story must carry the link-sticker URL separately");
  } else {
    assert.equal(post.text.split(destinationUrl).length - 1, 1, `${platform.label} must contain the LP URL exactly once`);
    assert.equal(post.linkUrl, null, `${platform.label} must not carry a link-sticker URL`);
  }
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
  linkUrl: null,
}, "instagram_story", destinationUrl);
assert.equal(story.text.includes(destinationUrl), false);
assert.equal(story.linkUrl, destinationUrl);
assert.ok(countRecipeSnsCharacters(formatRecipeSnsPost(story)) <= 50);

console.log("recipe SNS targeted regeneration merge verified");
