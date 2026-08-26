const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

async function main() {
  if (process.platform !== "win32") {
    console.log("Recipe SNS creative renderer check skipped outside Windows.");
    return;
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsa-sns-renderer-"));
  const sourcePath = path.join(workDir, "source.png");
  const outputPath = path.join(workDir, "creative.jpg");
  const rendererPath = path.join(__dirname, "..", "tools", "tsa-codex-bridge", "render-recipe-sns-image.ps1");
  const rendererSource = fs.readFileSync(rendererPath, "utf8");
  assert.match(rendererSource, /Add-EdgeScrim/);
  assert.match(rendererSource, /0x4F1A, 0x6D25, 0x30D6, 0x30E9, 0x30F3, 0x30C9, 0x9928/);
  assert.doesNotMatch(rendererSource, /-Text "会津ブランド館"/);
  assert.doesNotMatch(rendererSource, /panelBrush|FillRectangle\(\$panelBrush/);
  try {
    await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 182, g: 91, b: 48 },
      },
    }).png().toFile(sourcePath);
    const result = spawnSync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", rendererPath,
      "-InputPath", sourcePath,
      "-OutputPath", outputPath,
      "-Width", "1080",
      "-Height", "1920",
      "-Mode", "creative",
      "-Headline", "\u4f1a\u6d25\u306e\u3054\u3061\u305d\u3046\u3092\u98df\u5353\u3078",
      "-Subline", "\u5546\u54c1\u60c5\u5831\u306b\u57fa\u3065\u304f\u5e83\u544a\u6587",
      "-Placement", "bottom-left",
    ], { encoding: "utf8", timeout: 120_000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.statSync(outputPath).size > 20_000);
    const metadata = await sharp(outputPath).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1920);
    const stats = await sharp(outputPath).stats();
    assert.ok(stats.channels.some((channel) => channel.min < 30));
    assert.ok(stats.channels.some((channel) => channel.max > 220));
    console.log("Recipe SNS creative renderer: Japanese overlay and 1080x1920 output verified.");
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
