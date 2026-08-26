import assert from "node:assert/strict";
import sharp from "sharp";
import { renderRecipeSnsImageVariant } from "../lib/recipe-sns-image.ts";

const source = await sharp({
  create: {
    width: 1200,
    height: 1200,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
}).png().toBuffer();

const cases = [
  ["normal", "normal-resize", 1600, 900],
  ["creative", "creative", 1080, 1080],
  ["arrange", "arrange", 1080, 1920],
];

let checks = 0;
for (const [mode, expectedLayout, width, height] of cases) {
  const rendered = await renderRecipeSnsImageVariant(source, width, height, mode);
  const metadata = await sharp(rendered.buffer).metadata();
  assert.equal(rendered.layoutMode, expectedLayout);
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  assert.equal(metadata.format, "webp");
  checks += 4;
}

console.log(`recipe SNS image modes: ${checks} checks passed`);
