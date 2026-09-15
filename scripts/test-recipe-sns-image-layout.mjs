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
  ["handwritten", "handwritten", 1200, 675],
  ["handwritten", "handwritten", 1080, 1920],
];

let checks = 0;
for (const [mode, expectedLayout, width, height] of cases) {
  const rendered = await renderRecipeSnsImageVariant(source, width, height, mode);
  const metadata = await sharp(rendered.buffer).metadata();
  assert.equal(rendered.layoutMode, expectedLayout);
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  assert.equal(metadata.format, "jpeg");
  checks += 4;
}

console.log(`recipe SNS image modes: ${checks} checks passed`);

// Edge callouts must survive aspect conversion (cover would crop these markers).
const marked = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: "white" } })
  .composite([{ input: Buffer.from('<svg width="1000" height="1000"><rect x="0" y="0" width="100" height="1000" fill="red"/><rect x="0" y="0" width="1000" height="100" fill="blue"/></svg>') }])
  .png().toBuffer();
for (const [width, height] of [[1200, 675], [1080, 1920]]) {
  const { buffer } = await renderRecipeSnsImageVariant(marked, width, height, "handwritten");
  const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let red = 0, blue = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80) red++;
    if (data[i + 2] > 180 && data[i] < 80 && data[i + 1] < 80) blue++;
  }
  assert.ok(red > 20000 && blue > 20000, "edge callouts were cropped");
}
