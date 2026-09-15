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
    for (const [width, height] of [[1200, 675], [1080, 1080], [1080, 1920], [1200, 900]]) {
    for (const placement of ["top-left", "bottom-right"]) {
    for (const [headline, subline] of [["ワシワシ極太麺を食卓へ", "麺・スープ各２食入り"], ["あ".repeat(24), "い".repeat(36)], ["味わう", ""]]) {
    const result = spawnSync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", rendererPath,
      "-InputPath", sourcePath,
      "-OutputPath", outputPath,
      "-Width", String(width),
      "-Height", String(height),
      "-Mode", "creative",
      "-Headline", headline,
      "-Subline", subline,
      "-Placement", placement,
    ], { encoding: "utf8", timeout: 120_000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.statSync(outputPath).size > 20_000);
    const metadata = await sharp(outputPath).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    const { layout } = JSON.parse(result.stdout.trim());
    assert.ok(layout.headlinePixelsAt360 >= 19.99);
    assert.ok(layout.sublinePixelsAt360 >= 13.99);
    assert.ok(layout.top >= layout.safeY - 0.01);
    assert.ok(layout.bottom <= height - layout.safeY + 0.01);
    if (headline.startsWith("ワシ")) await sharp(outputPath).resize(360).toFile(path.join(workDir, `${width}-${height}-${placement}.jpg`));
    const stats = await sharp(outputPath).stats();
    assert.ok(stats.channels.some((channel) => channel.min < 30));
    assert.ok(stats.channels.some((channel) => channel.max > 220));
    }
    }
    }
    console.log("Recipe SNS creative renderer: 24 Japanese layouts, mobile font floors and safe bounds verified.");
    if (process.env.KEEP_SNS_RENDER_FIXTURES) console.log(workDir);
  } finally {
    if (!process.env.KEEP_SNS_RENDER_FIXTURES) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
