import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRecipeEcImageIndexesForSite,
  getRecipeEcImagePlacement,
  getRecipeEcImagePlanForSite,
} from "../lib/recipe-ec-images.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

assert.deepEqual(getRecipeEcImagePlacement(0), {
  slot: "amazon_base_top",
  listingOrder: 1,
  sites: ["amazon", "base"],
});
assert.deepEqual(getRecipeEcImagePlacement(1), {
  slot: "other_ec_top",
  listingOrder: 1,
  sites: ["rakuten", "yahoo", "mercari", "qoo10", "tiktok"],
});
assert.equal(getRecipeEcImagePlacement(2).slot, "shared_detail");
assert.equal(getRecipeEcImagePlacement(2).listingOrder, 2);
assert.deepEqual(getRecipeEcImageIndexesForSite("amazon", 5), [0, 2, 3, 4]);
assert.deepEqual(getRecipeEcImageIndexesForSite("base", 5), [0, 2, 3, 4]);
assert.deepEqual(getRecipeEcImageIndexesForSite("rakuten", 5), [1, 2, 3, 4]);
assert.deepEqual(getRecipeEcImageIndexesForSite("tiktok", 2), [1]);
assert.throws(() => getRecipeEcImagePlacement(-1), RangeError);

const scopedCounts = { gallery: 5, nonAmazon: 2, baseOnly: 2 };
assert.deepEqual(
  getRecipeEcImagePlanForSite("amazon", scopedCounts).map(({ imageRole, imageIndex, listingOrder }) => ({ imageRole, imageIndex, listingOrder })),
  [
    { imageRole: "gallery", imageIndex: 0, listingOrder: 1 },
    { imageRole: "gallery", imageIndex: 2, listingOrder: 2 },
    { imageRole: "gallery", imageIndex: 3, listingOrder: 3 },
    { imageRole: "gallery", imageIndex: 4, listingOrder: 4 },
  ],
);
assert.deepEqual(
  getRecipeEcImagePlanForSite("base", scopedCounts).map(({ imageRole, listingOrder }) => ({ imageRole, listingOrder })),
  [
    { imageRole: "gallery", listingOrder: 1 },
    { imageRole: "gallery", listingOrder: 2 },
    { imageRole: "gallery", listingOrder: 3 },
    { imageRole: "gallery", listingOrder: 4 },
    { imageRole: "base_only", listingOrder: 5 },
    { imageRole: "base_only", listingOrder: 6 },
  ],
);
assert.deepEqual(
  getRecipeEcImagePlanForSite("mercari", scopedCounts).map(({ imageRole, listingOrder }) => ({ imageRole, listingOrder })),
  [
    { imageRole: "gallery", listingOrder: 1 },
    { imageRole: "gallery", listingOrder: 2 },
    { imageRole: "gallery", listingOrder: 3 },
    { imageRole: "gallery", listingOrder: 4 },
    { imageRole: "non_amazon", listingOrder: 5 },
    { imageRole: "non_amazon", listingOrder: 6 },
  ],
);
assert.equal(
  getRecipeEcImagePlanForSite("rakuten", scopedCounts).some(({ imageRole }) => imageRole === "base_only"),
  false,
);
assert.throws(
  () => getRecipeEcImagePlanForSite("base", { gallery: 1, baseOnly: -1 }),
  RangeError,
);

const page = read("app", "recipe", "[id]", "page.tsx");
const route = read("app", "api", "recipe", "web-images", "route.ts");
const scopedSection = read("app", "recipe", "_components", "ScopedEcImageSection.tsx");
const migration = read(
  "supabase",
  "migrations",
  "20260827130000_add_recipe_web_image_copy_lineage.sql",
);
const scopedMigration = read(
  "supabase",
  "migrations",
  "20260827190000_add_recipe_ec_scoped_images.sql",
);

assert.match(page, /application\/x-recipe-web-image-id/);
assert.match(page, /copyWebProductImageToPortrait/);
assert.match(page, /Amazon・BASE専用TOP/);
assert.match(page, /bg-emerald-600/);
assert.match(page, /掲載順1・専用TOP/);
assert.match(page, /他EC TOP/);
assert.match(page, /Amazon以外の画像/);
assert.match(page, /BASE専用画像/);
assert.match(page, /source_type === 'mercari'/);
assert.match(route, /export async function PUT/);
assert.match(route, /redirect: "error"/);
assert.match(route, /copied_from_image_id/);
assert.match(route, /getRecipeEcImagePlacement/);
assert.match(route, /getRecipeEcImagePlanForSite/);
assert.match(route, /ecImageSets/);
assert.match(route, /nonAmazonImages/);
assert.match(route, /baseOnlyImages/);
assert.match(migration, /on delete set null/i);
assert.match(migration, /recipe_web_images_portrait_copy_unique_idx/);
assert.match(scopedSection, /bg-red-600/);
assert.match(scopedSection, /bg-amber-400/);
assert.match(scopedMigration, /'non_amazon'/);
assert.match(scopedMigration, /'base_only'/);
assert.match(scopedMigration, /'mercari'/);

console.log("Recipe EC image placement, scoped delivery images, and portrait-copy checks passed.");
