import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRecipeEcImageIndexesForSite,
  getRecipeEcImagePlacement,
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

const page = read("app", "recipe", "[id]", "page.tsx");
const route = read("app", "api", "recipe", "web-images", "route.ts");
const migration = read(
  "supabase",
  "migrations",
  "20260827130000_add_recipe_web_image_copy_lineage.sql",
);

assert.match(page, /application\/x-recipe-web-image-id/);
assert.match(page, /copyWebProductImageToPortrait/);
assert.match(page, /Amazon・BASE専用TOP/);
assert.match(page, /bg-emerald-600/);
assert.match(page, /掲載順1・専用TOP/);
assert.match(page, /他EC TOP/);
assert.match(route, /export async function PUT/);
assert.match(route, /redirect: "error"/);
assert.match(route, /copied_from_image_id/);
assert.match(route, /getRecipeEcImagePlacement/);
assert.match(migration, /on delete set null/i);
assert.match(migration, /recipe_web_images_portrait_copy_unique_idx/);

console.log("Recipe EC image placement and portrait-copy checks passed.");
