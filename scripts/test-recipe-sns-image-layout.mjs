import assert from "node:assert/strict";
import sharp from "sharp";
import {
  recipeSnsCoverRetention,
  renderRecipeSnsImageVariant,
} from "../lib/recipe-sns-image.ts";

const source = await sharp({
  create: {
    width: 1200,
    height: 1200,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
}).png().toBuffer();

assert.equal(recipeSnsCoverRetention(1200, 1200, 1600, 900), 0.5625);

const x = await renderRecipeSnsImageVariant(source, 1600, 900);
const xMetadata = await sharp(x.buffer).metadata();
assert.equal(x.layoutMode, "subject-preserve");
assert.equal(xMetadata.width, 1600);
assert.equal(xMetadata.height, 900);

const instagram = await renderRecipeSnsImageVariant(source, 1080, 1080);
const instagramMetadata = await sharp(instagram.buffer).metadata();
assert.equal(instagram.layoutMode, "smart-crop");
assert.equal(instagramMetadata.width, 1080);
assert.equal(instagramMetadata.height, 1080);

const threads = await renderRecipeSnsImageVariant(source, 1200, 900);
assert.equal(threads.layoutMode, "subject-preserve");

console.log("recipe SNS image layout: 7 checks passed");
