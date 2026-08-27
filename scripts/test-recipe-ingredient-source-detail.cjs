const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const page = read("app", "recipe", "[id]", "page.tsx");
const dialog = read("app", "recipe", "_components", "IngredientSourceDetailDialog.tsx");
const itemSelect = read("app", "recipe", "_components", "ItemNameSelect.tsx");

for (const field of [
  "raw_materials",
  "allergens",
  "origin",
  "manufacturer",
  "product_description",
  "nutrition_per",
  "label_images",
]) {
  assert.match(page, new RegExp(field));
  assert.match(itemSelect, new RegExp(field));
}

assert.match(page, /aria-label=\{`\$\{item\.item_name\}の原材料情報を表示`\}/);
assert.match(page, /setSelectedIngredientDetail\(ingredientDetail \?\? null\)/);
assert.match(page, /item\.ingredient_id && candidate\.id === item\.ingredient_id/);
assert.match(page, /<IngredientSourceDetailDialog/);
assert.match(dialog, /export function hasIngredientSourceDetails/);
assert.match(dialog, /食材DBに取り込まれている表示情報とラベル画像/);
assert.match(dialog, /原材料/);
assert.match(dialog, /アレルゲン/);
assert.match(dialog, /栄養成分/);
assert.match(dialog, /ラベル画像/);
assert.match(dialog, /target="_blank"/);

console.log("Recipe ingredient source detail checks passed.");
