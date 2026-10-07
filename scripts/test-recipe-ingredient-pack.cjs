const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "..", "lib", "recipe-ingredient-pack.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", output)(loaded, loaded.exports);
const { getIngredientPackQuantity, calculateIngredientPackRequirement } = loaded.exports;

const item = { item_type: "ingredient", ingredient_id: "oil", item_name: "サラダ油", unit_quantity: 1000 };
const sources = [
  { id: "oil", name: "サラダ油（一斗缶）", unit_quantity: "16500.00" },
  { id: "garlic", name: "フライドガーリック", unit_quantity: 500 },
];
assert.equal(getIngredientPackQuantity(item, sources), 16500, "現在のDB入数をIDで参照し、明細の古い入数は使わない");
assert.equal(getIngredientPackQuantity(item, sources, true), 1000, "過去版は保存済み入数を保持する");
assert.equal(getIngredientPackQuantity({ ...item, unit_quantity: null }, sources, true), null, "過去版の欠損を現在DBで補完しない");
assert.equal(getIngredientPackQuantity({ ...item, ingredient_id: "missing", item_name: "フライドガーリック" }, sources), null, "ID不一致を同名候補で補わない");
assert.equal(getIngredientPackQuantity({ ...item, ingredient_id: null, item_name: "フライドガーリック" }, sources), 500, "IDなしは一意の完全一致名を参照する");
assert.equal(getIngredientPackQuantity({ ...item, ingredient_id: null, item_name: "フライドガーリック" }, [...sources, { name: "フライドガーリック", unit_quantity: 500 }]), null, "同名候補が複数なら推測しない");
assert.equal(getIngredientPackQuantity({ ...item, ingredient_id: null }, []), null, "未登録は明細値にフォールバックしない");
for (const item_type of ["material", "expense", "product", "intermediate"]) {
  assert.equal(getIngredientPackQuantity({ ...item, item_type }, sources), null, `${item_type}を原材料の入数として扱わない`);
}
for (const unit_quantity of [null, undefined, 0, -1, "", " ", "500g", "1,000", "0x10", "NaN", Infinity]) {
  assert.equal(getIngredientPackQuantity(item, [{ ...sources[0], unit_quantity }]), null, `不正なDB入数 ${String(unit_quantity)} は未設定`);
}
assert.equal(getIngredientPackQuantity(item, [{ ...sources[0], unit_quantity: " 0.25 " }]), 0.25, "数値文字列の小数入数を保持する");

assert.deepEqual(calculateIngredientPackRequirement(6, 400, 16500), { usedPacks: 2400 / 16500, requiredPacks: 1 }, "一斗缶2400g分は按分と準備1個を返す");
assert.deepEqual(calculateIngredientPackRequirement("44", 400, 300), { usedPacks: 17600 / 300, requiredPacks: 59 }, "しょうゆ400食は59本を準備");
assert.deepEqual(calculateIngredientPackRequirement("44", 800, 300), { usedPacks: 35200 / 300, requiredPacks: 118 }, "しょうゆ800食は118本を準備");
assert.deepEqual(calculateIngredientPackRequirement(0, 400, 500), { usedPacks: 0, requiredPacks: 0 });
assert.deepEqual(calculateIngredientPackRequirement(10, 0, 500), { usedPacks: 0, requiredPacks: 0 });
assert.equal(calculateIngredientPackRequirement(0.1, 3, 0.1).requiredPacks, 3, "浮動小数誤差で3個を4個にしない");
assert.equal(calculateIngredientPackRequirement(1 + 1e-10, 1, 1).requiredPacks, 2, "実際の整数超過は切り上げる");
assert.equal(calculateIngredientPackRequirement(1e16, 1, 1).requiredPacks, 1e16, "大きな整数から丸め許容差を引いて必要数を減らさない");
assert.equal(calculateIngredientPackRequirement(1e15 + 0.125, 1, 1).requiredPacks, 1e15 + 1, "大きな数でも実際の端数を丸め誤差で消さない");
assert.equal(calculateIngredientPackRequirement(1e-20, 1, 1000).requiredPacks, 1, "少量でも正の使用量なら最低1個");
assert.equal(calculateIngredientPackRequirement(Number.MIN_VALUE, Number.MIN_VALUE, 1000).requiredPacks, 1, "極小値が計算上0になっても正の使用なら1個");
for (const usage of [null, undefined, "", " ", "20g", "NaN", NaN, Infinity, -1]) {
  assert.equal(calculateIngredientPackRequirement(usage, 400, 500), null, `不正な使用量 ${String(usage)} は計算しない`);
}
for (const batch of [-1, NaN, Infinity]) assert.equal(calculateIngredientPackRequirement(10, batch, 500), null);
for (const pack of [null, 0, -1, NaN, Infinity]) assert.equal(calculateIngredientPackRequirement(10, 400, pack), null);
assert.equal(calculateIngredientPackRequirement(0, 400, null), null, "使用ゼロでも入数欠損を確定個数として表示しない");
assert.equal(calculateIngredientPackRequirement(Number.MAX_VALUE, 400, 500), null, "演算オーバーフローを数量として返さない");

console.log("Recipe ingredient pack quantity and preparation checks passed.");
