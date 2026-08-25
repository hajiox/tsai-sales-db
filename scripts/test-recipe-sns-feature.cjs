const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const page = read("app", "recipe", "[id]", "page.tsx");
const studio = read("app", "recipe", "_components", "RecipeSnsStudio.tsx");
const snsRules = read("lib", "recipe-sns.ts");
const snsServer = read("lib", "recipe-sns-server.ts");
const snsRoute = read("app", "api", "recipe", "[id]", "sns-generations", "route.ts");
const importRoute = read("app", "api", "web-sales", "codex-bridge", "jobs", "[id]", "recipe-sns-import", "route.ts");
const skill = read("tools", "tsa-codex-bridge", "skills", "generate-aizu-sns-posts", "SKILL.md");

for (const label of ["レシピ", "EC情報", "SNS"]) assert.match(page, new RegExp(`label: "${label}"`));
assert.match(page, /role="tablist"/);
assert.match(page, /role="tabpanel"/);
assert.match(page, /window\.history\.replaceState/);
assert.match(page, /RecipeSnsStudio recipeId=\{recipe\.id\} hasUnsavedChanges=\{hasChanges\}/);

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

assert.match(snsServer, /images\.filter\(\(image\) => image\.image_role === "portrait"\)/);
assert.match(snsServer, /return gallery\[0\] \|\| null/);
assert.match(snsServer, /randomInt\(alternatives\.length\)/);
assert.match(snsServer, /sharp\.strategy\.attention/);
assert.match(snsServer, /recipe-sns\/\$\{recipeId\}/);
assert.match(snsServer, /redirect: "manual"/);
assert.match(snsServer, /isAllowedLpHostname/);
assert.doesNotMatch(snsServer, /source_image_url/);

assert.match(snsRoute, /getServerSession\(authOptions\)/);
assert.match(snsRoute, /session\?\.user\?\.email\?\.toLowerCase\(\) === ADMIN_EMAIL/);
assert.match(snsRoute, /createRecipeSnsImageVariants/);
assert.match(snsRoute, /task_key: "recipe_sns_generate"/);
assert.match(snsRoute, /compact_packet_then_isolated_codex_skill/);
assert.match(snsRoute, /sourceImage\.id/);
assert.doesNotMatch(snsRoute, /body\.sourceImage/);

assert.match(importRoute, /isCodexBridgeAuthorized/);
assert.match(importRoute, /validateRecipeSnsAiResult/);
assert.match(importRoute, /JSON\.stringify\(parameters\.sourceSnapshot\) !== JSON\.stringify\(body\.sourceSnapshot\)/);
assert.match(importRoute, /result\.variation_key !== String\(sourceSnapshot\.variationKey/);
assert.match(importRoute, /status: "completed", posts: result/);

for (const prohibition of ["Web検索", "ブラウザ操作", "過去チャット参照", "SNS投稿"]) {
  assert.match(skill, new RegExp(prohibition));
}

console.log("Recipe SNS feature checks passed.");
