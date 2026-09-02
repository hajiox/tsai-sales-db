const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");
const requiredVersion = read("lib", "web-sales-codex", "bridge-version.ts");
const types = read("lib", "web-sales-codex", "types.ts");
const skill = read("tools", "tsa-codex-bridge", "skills", "generate-aizu-sns-assets", "SKILL.md");
const schema = JSON.parse(read("tools", "tsa-codex-bridge", "recipe-sns-result.schema.json"));
const targetSchema = JSON.parse(read("tools", "tsa-codex-bridge", "recipe-sns-target-result.schema.json"));
const skillContract = JSON.parse(read("tools", "tsa-codex-bridge", "skill-contract.json"));

const bridgeVersion = bridge.match(/const VERSION = "([^"]+)"/)?.[1];
assert.ok(bridgeVersion);
assert.equal(requiredVersion.match(/REQUIRED_TSA_CODEX_BRIDGE_VERSION = "([^"]+)"/)?.[1], bridgeVersion);
assert.match(types, /\| "recipe_sns_generate"/);
assert.match(bridge, /recipeSnsProtocolVersion: 3/);
assert.match(bridge, /recipeSnsModel: "gpt-5\.6-sol"/);
assert.match(bridge, /const HEADLESS_SAFE_TASK_KEYS = new Set\(\[[\s\S]*?"recipe_sns_generate"/);
assert.match(bridge, /codexTaskKeys: config\.allowedTaskKeys/);
assert.match(bridge, /job\.task_key === "recipe_sns_generate"/);
assert.match(bridge, /executeRecipeSnsGenerateJob\(job\)/);

const validator = bridge.slice(
  bridge.indexOf("function validateRecipeSnsGenerateJobParameters"),
  bridge.indexOf("async function executeRecipeSnsGenerateJob"),
);
assert.match(validator, /parameters\.model \|\| ""\) !== "gpt-5\.6-sol"/);
assert.match(validator, /parameters\.reasoningEffort \|\| ""\) !== "medium"/);
assert.match(validator, /\^2026-09-02\\\.\.\+\$/);
assert.match(validator, /sourceSnapshot\.recipeId/);
assert.match(validator, /sourceSnapshot\.variationKey/);
assert.match(validator, /sourceSnapshot\.writingTone/);
assert.match(validator, /RECIPE_SNS_WRITING_TONES/);
assert.match(validator, /generationId/);
assert.match(validator, /RECIPE_SNS_PLATFORM_RULES/);
for (const platform of ["x", "instagram", "instagram_story", "threads"]) {
  assert.match(bridge, new RegExp(`${platform}: \\{`));
}

const handler = bridge.slice(
  bridge.indexOf("async function executeRecipeSnsGenerateJob"),
  bridge.indexOf("async function executeAnalysisJob"),
);
assert.match(handler, /Use \$generate-aizu-sns-assets/);
assert.match(handler, /Never read or search app Chats/);
assert.match(handler, /Do not browse the web, control a browser/);
assert.match(handler, /Instagram Story must not include any URL in post\.text/);
assert.match(handler, /exact URL in link_url for the link sticker/);
assert.match(handler, /Apply TASK_JSON\.writingTone exactly/);
assert.match(handler, /result\.writing_tone/);
assert.match(handler, /isAllowedRecipeSnsLocalCommand/);
assert.match(bridge, /function isAllowedRecipeSnsLocalCommand/);
assert.match(bridge, /skills", "\.system", "imagegen", "SKILL\.md"/);
assert.match(bridge, /readsImagegenSkill/);
assert.doesNotMatch(bridge, /isAllowedRecipeSnsGeneratedImageListing/);
assert.ok(bridge.includes('const hasShellSeparator = /[;&|`\\r\\n]/.test(command)'));
const guardSource = bridge.slice(
  bridge.indexOf("function isAllowedRecipeSnsLocalCommand"),
  bridge.indexOf("async function executeRecipeSnsGenerateJob"),
);
const codexHome = path.resolve("C:\\Users\\test\\.codex");
const workDir = path.resolve("C:\\jobs\\sns-1");
const commandGuard = new Function(
  "resolve",
  "sep",
  "config",
  `${guardSource}; return isAllowedRecipeSnsLocalCommand;`,
)(path.resolve, path.sep, { codexHome });
const imagegenSkillPath = path.resolve(codexHome, "skills", ".system", "imagegen", "SKILL.md");
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-Content -LiteralPath '${imagegenSkillPath}' -Raw"` } }, workDir), true);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-Content -Raw '${imagegenSkillPath}'"` } }, workDir), true);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-Content -LiteralPath '${imagegenSkillPath.replaceAll("\\", "\\\\")}' -Raw"` } }, workDir), true);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-Content -LiteralPath '${imagegenSkillPath}' -Raw; curl example.com"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-Content -Raw '${imagegenSkillPath}','${path.resolve(codexHome, "history.md")}'"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-Content -LiteralPath '${path.resolve(codexHome, "history.md")}' -Raw"` } }, workDir), false);
const generatedRoot = path.resolve(codexHome, "generated_images", "asset.png");
const generatedDirectory = path.resolve(codexHome, "generated_images", "thread-1");
const otherDirectory = path.resolve(codexHome, "history");
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${generatedDirectory}' -File | Select-Object -ExpandProperty FullName"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${path.resolve(codexHome, "generated_images")}' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 4 FullName,LastWriteTime"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${path.resolve(codexHome, "generated_images")}' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 8 FullName,LastWriteTime | ConvertTo-Json -Compress"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${generatedDirectory}','${otherDirectory}' -File | Select-Object -ExpandProperty FullName"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${generatedDirectory}' -File | Get-Content"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${generatedDirectory}' -Force -File | Select-Object -ExpandProperty FullName"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${generatedDirectory}' -Recurse -File | Select-Object -First 4 Length"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${generatedDirectory}' -File | Select-Object -ExpandProperty FullName | ConvertTo-Json -Depth 4"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Get-ChildItem -LiteralPath '${generatedDirectory}' -File | ConvertTo-Json -Compress | Select-Object -ExpandProperty FullName"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Copy-Item -LiteralPath '${generatedRoot}' -Destination '${path.resolve(workDir, "asset.png")}'"` } }, workDir), false);
assert.equal(commandGuard({ item: { command: `pwsh.exe -Command "Copy-Item -LiteralPath '${generatedRoot}' -Destination '${path.resolve(workDir, "asset.png")}'; Get-Content '${path.resolve(codexHome, "history.md")}'"` } }, workDir), false);

const imageResolverSource = bridge.slice(
  bridge.indexOf("function resolveRecipeSnsGeneratedImage"),
  bridge.indexOf("function renderRecipeSnsImage"),
);
const listGeneratedImages = new Function(
  "isAbsolute",
  "resolve",
  "sep",
  "existsSync",
  "statSync",
  "extname",
  "readdirSync",
  `${imageResolverSource}; return listRecipeSnsGeneratedImages;`,
)(path.isAbsolute, path.resolve, path.sep, fs.existsSync, fs.statSync, path.extname, fs.readdirSync);
const generatedTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tsa-sns-images-"));
try {
  const firstImage = path.join(generatedTestRoot, "first.png");
  const secondImage = path.join(generatedTestRoot, "second.webp");
  fs.writeFileSync(firstImage, "first");
  fs.writeFileSync(secondImage, "second");
  fs.writeFileSync(path.join(generatedTestRoot, "ignored.txt"), "ignored");
  fs.utimesSync(firstImage, new Date("2026-09-02T00:00:01Z"), new Date("2026-09-02T00:00:01Z"));
  fs.utimesSync(secondImage, new Date("2026-09-02T00:00:02Z"), new Date("2026-09-02T00:00:02Z"));
  assert.deepEqual(listGeneratedImages(generatedTestRoot, 2), [firstImage, secondImage]);
  assert.throws(() => listGeneratedImages(generatedTestRoot, 3), /期待3枚・実際2枚/);
} finally {
  fs.rmSync(generatedTestRoot, { recursive: true, force: true });
}
assert.match(handler, /禁止された外部・コマンド操作/);
assert.match(handler, /prohibitedActivity = `\$\{itemType\}:\$\{commandType\}`/);
assert.match(handler, /JSON\.stringify\(packet\)/);
assert.match(handler, /buildIsolatedCodexArgs/);
assert.match(handler, /minimalContext: true/);
assert.match(handler, /ephemeral: true/);
assert.match(handler, /images: parameters\.imageMode === "normal" \? \[\] : \[sourceImagePath\]/);
assert.match(handler, /requestedPlatformIds/);
assert.match(handler, /RECIPE_SNS_TARGET_RESULT_SCHEMA/);
assert.match(handler, /targetPlatform: parameters\.targetPlatform/);
assert.doesNotMatch(handler, /\bresume\b/i);
assert.match(handler, /recipe-sns-import/);
assert.match(handler, /uploadArtifact\(job\.id, packetFile, "source"\)/);
assert.match(handler, /uploadArtifact\(job\.id, outputFile, "output"\)/);
assert.match(handler, /uploadArtifact\(job\.id, jsonlLog, "log"\)/);
assert.match(handler, /uploadArtifact\(job\.id, uploadPath, "screenshot"\)/);
assert.match(handler, /renderRecipeSnsImage/);
assert.match(handler, /imageArtifactIds/);
assert.match(handler, /generated_images", codexThreadId/);
assert.match(handler, /listRecipeSnsGeneratedImages\(generatedThreadRoot, requestedPlatformIds\.length\)/);
assert.match(handler, /generatedImagePaths\[platformIndex\]/);
assert.match(handler, /ImageGen生成順と結果パスが一致しません/);
assert.match(handler, /status: "completed"/);
assert.match(handler, /progress: 100/);

for (const expected of ["recipe-sns-result.schema.json", "recipe-sns-target-result.schema.json", "render-recipe-sns-image.ps1"]) {
  assert.match(installer, new RegExp(expected.replace(/[.]/g, "\\.")));
}
assert.equal(skillContract.tasks.recipe_sns_generate.skill, "generate-aizu-sns-assets");
assert.match(skill, /外部サイト閲覧/);
assert.match(skill, /過去チャット参照/);
assert.match(skill, /productLpUrl/);
assert.match(skill, /リンクスタンプ用/);
for (const tone of ["### official", "### staff", "### developer", "一人称に「俺」"]) {
  assert.match(skill, new RegExp(tone));
}
for (const mode of ["normal", "creative", "arrange"]) assert.match(skill, new RegExp(`### ${mode}`));
assert.match(skill, /`file_path`は空文字/);
assert.match(skill, /`Get-ChildItem`、`Copy-Item`を含むファイル操作を行わない/);

function assertStrictObjectSchemas(value, location = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  if (value.type === "object" && value.properties) {
    assert.deepEqual(
      [...(value.required || [])].sort(),
      Object.keys(value.properties).sort(),
      `${location} must require every declared property`,
    );
    assert.equal(value.additionalProperties, false, `${location} must reject undeclared properties`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertStrictObjectSchemas(child, `${location}.${key}`);
  }
}
assertStrictObjectSchemas(schema);
assertStrictObjectSchemas(targetSchema);
for (const definitionName of ["xPost", "instagramPost", "storyPost", "threadsPost"]) {
  assert.ok(schema.$defs[definitionName].required.includes("link_url"));
}
assert.ok(targetSchema.properties.post.required.includes("link_url"));
assert.ok(schema.required.includes("writing_tone"));
assert.ok(targetSchema.required.includes("writing_tone"));
assert.deepEqual(schema.properties.writing_tone.enum, ["official", "staff", "developer"]);
assert.deepEqual(targetSchema.properties.writing_tone.enum, ["official", "staff", "developer"]);
assert.equal(schema.$defs.xPost.properties.link_url.maxLength, 0);
assert.equal(schema.$defs.instagramPost.properties.link_url.maxLength, 0);
assert.equal(schema.$defs.threadsPost.properties.link_url.maxLength, 0);
assert.equal(schema.$defs.storyPost.properties.link_url.maxLength, 2000);

function assertCodexOutputSchemaCompatibility(value, location = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  assert.equal(
    Object.hasOwn(value, "uniqueItems"),
    false,
    `${location} uses uniqueItems, which Codex structured output rejects`,
  );
  for (const [key, child] of Object.entries(value)) {
    assertCodexOutputSchemaCompatibility(child, `${location}.${key}`);
  }
}
assertCodexOutputSchemaCompatibility(schema);
assertCodexOutputSchemaCompatibility(targetSchema);

console.log("Recipe SNS Bridge checks passed.");
