const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const page = read("app", "recipe", "[id]", "page.tsx");
const studio = read("app", "recipe", "_components", "RecipeSnsStudio.tsx");
const publishPanel = read("app", "recipe", "_components", "RecipeSnsPublishPanel.tsx");
const snsRules = read("lib", "recipe-sns.ts");
const snsServer = read("lib", "recipe-sns-server.ts");
const snsImage = read("lib", "recipe-sns-image.ts");
const snsRoute = read("app", "api", "recipe", "[id]", "sns-generations", "route.ts");
const importRoute = read("app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "recipe-sns-import", "route.ts");
const skill = read("tools", "tsa-codex-bridge", "skills", "generate-aizu-sns-assets", "SKILL.md");

for (const label of ["レシピ", "EC情報", "SNS"]) assert.match(page, new RegExp(`label: "${label}"`));
assert.match(page, /role="tablist"/);
assert.match(page, /role="tabpanel"/);
assert.match(page, /window\.history\.replaceState/);
assert.match(page, /RecipeSnsStudio recipeId=\{recipe\.id\} hasUnsavedChanges=\{hasChanges\}/);
assert.match(studio, /const currentJobGeneration = next\.job\?\.id/);
for (const mode of ["通常リサイズ", "クリエイティブ", "アレンジ"]) assert.match(studio, new RegExp(mode));
for (const tone of ["オフィシャル", "スタッフ", "開発者"]) assert.match(snsRules, new RegExp(tone));
assert.match(studio, /RECIPE_SNS_WRITING_TONES/);
assert.match(studio, /role="radiogroup"/);
assert.match(studio, /writingTone:/);
assert.match(studio, /generatingPlatform/);
assert.match(studio, /baseGenerationId/);
assert.match(studio, /RefreshCw/);
assert.match(studio, /だけを同じモード・同じ口調で再生成/);
assert.match(studio, /リンクスタンプ用URL/);
assert.match(studio, /copyStoryLink/);
assert.doesNotMatch(studio, /画像だけ切り直す/);
assert.match(publishPanel, /useState\(false\)/);
assert.match(publishPanel, /aria-expanded=\{historyOpen\}/);
assert.match(publishPanel, /historyOpen &&/);
assert.ok(
  studio.indexOf("if (currentJobGeneration) return currentJobGeneration.id")
    < studio.indexOf("if (current && next.generations.some"),
  "a newly started generation must replace the previously selected history entry",
);

const expectedPlatforms = {
  x: [1600, 900, 400, 0, 3],
  instagram: [1080, 1080, 2200, 10, 15],
  instagram_story: [1080, 1920, 50, 0, 0],
  threads: [1200, 900, 500, 0, 5],
};
for (const [platform, values] of Object.entries(expectedPlatforms)) {
  assert.match(snsRules, new RegExp(`id: "${platform}"`));
  for (const value of values) assert.match(snsRules, new RegExp(`(?:width|height|maxLength|minHashtags|maxHashtags): ${value}`));
  assert.match(studio, new RegExp(`platform\.id`));
}
assert.match(snsRules, /Array\.from\(value\)\.length/);
assert.match(snsRules, /formatRecipeSnsPost/);
assert.match(snsRules, /ensureRecipeSnsPostDestinationUrl/);
assert.match(snsRules, /ensureRecipeSnsAiResultDestinationUrl/);
assert.match(snsRules, /platformId === "instagram_story"/);
assert.match(snsRules, /RECIPE_SNS_WRITING_TONES/);
assert.match(snsRules, /writing_tone/);

assert.match(snsServer, /images\.filter\(\(image\) => image\.image_role === "portrait"\)/);
assert.match(snsServer, /return gallery\[0\] \|\| null/);
assert.match(snsServer, /randomInt\(alternatives\.length\)/);
assert.match(snsServer, /publishRecipeSnsImageVariants/);
assert.match(snsServer, /recipe-sns\/\$\{recipeId\}/);
assert.match(snsServer, /redirect: "manual"/);
assert.match(snsServer, /isAllowedLpHostname/);
assert.doesNotMatch(snsServer, /source_image_url/);
assert.match(snsImage, /imageMode === "normal" \? "normal-resize" : imageMode/);
assert.match(snsImage, /fit: "cover"/);
assert.doesNotMatch(snsImage, /blur|feather|subject-preserve/);

assert.match(snsRoute, /getServerSession\(authOptions\)/);
assert.match(snsRoute, /session\?\.user\?\.email\?\.toLowerCase\(\) === ADMIN_EMAIL/);
assert.match(snsRoute, /task_key: "recipe_sns_generate"/);
assert.match(snsRoute, /isRecipeSnsImageMode\(imageMode\)/);
assert.match(snsRoute, /isRecipeSnsWritingTone\(rawWritingTone\)/);
assert.match(snsRoute, /writingTone,/);
assert.match(snsRoute, /imageMode,/);
assert.match(snsRoute, /sourceImageUrl: sourceImage\.image_url/);
assert.match(snsRoute, /image_variants: baseImageVariants/);
assert.match(snsRoute, /targetPlatforms: targetPlatform/);
assert.match(snsRoute, /baseGenerationId: targetPlatform/);
assert.match(snsRoute, /productLpUrl,/);
assert.match(snsRoute, /ensureRecipeSnsAiResultDestinationUrl/);
assert.match(snsRoute, /one_image_compact_packet_then_fresh_skill_session/);
assert.doesNotMatch(snsRoute, /action === "recrop"|deterministic_image_recrop_without_codex/);
assert.match(snsRoute, /sourceImage\.id/);
assert.doesNotMatch(snsRoute, /body\.sourceImage/);

assert.match(importRoute, /isCodexBridgeAuthorized/);
assert.match(importRoute, /validateRecipeSnsBridgeResult/);
assert.match(importRoute, /validateRecipeSnsTargetBridgeResult/);
assert.match(importRoute, /JSON\.stringify\(parameters\.sourceSnapshot\) !== JSON\.stringify\(body\.sourceSnapshot\)/);
assert.match(importRoute, /result\.variation_key !== String\(sourceSnapshot\.variationKey/);
assert.match(importRoute, /web_sales_codex_artifacts/);
assert.match(importRoute, /requestedMode === "normal" \? 1 : requestedPlatforms\.length/);
assert.match(importRoute, /requestedPlatforms\.length/);
assert.match(importRoute, /mergeRecipeSnsTargetResult\(baseResult, targetResult\)/);
assert.match(importRoute, /storedImageVariants/);
assert.match(importRoute, /publishRecipeSnsImageVariants/);
assert.match(importRoute, /image_variants: storedImageVariants/);
assert.match(importRoute, /posts: storedResult/);
assert.match(importRoute, /ensureRecipeSnsAiResultDestinationUrl/);

for (const prohibition of ["Web検索", "ブラウザ操作", "過去チャット参照", "SNS投稿"]) {
  assert.match(skill, new RegExp(prohibition));
}
for (const tone of ["### official", "### staff", "### developer", "一人称に「俺」"]) {
  assert.match(skill, new RegExp(tone));
}
for (const mode of ["normal", "creative", "arrange"]) assert.match(skill, new RegExp(`### ${mode}`));
assert.match(skill, /productLpUrl/);
assert.match(skill, /リンクスタンプ用/);
assert.match(skill, /IGストーリーはURLを `post\.text` に入れない/);

console.log("Recipe SNS feature checks passed.");
