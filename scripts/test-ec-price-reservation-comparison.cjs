const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScriptModule(relativePath, dependencyMap = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.prototype.hasOwnProperty.call(dependencyMap, name)
    ? dependencyMap[name]
    : require(name);
  new Function("module", "exports", "require", output)(loaded, loaded.exports, localRequire);
  return loaded.exports;
}

const ecPrice = loadTypeScriptModule("lib/ec-price-codex.ts");
const { getEcPriceReservationComparisons: compare } = loadTypeScriptModule(
  "lib/ec-price-reservation-comparison.ts",
  { "@/lib/ec-price-codex": ecPrice },
);

const parameters = {
  targets: ["amazon", "rakuten", "yahoo", "base"],
  newPriceInclTax: 885,
  siteBaselines: { amazon: 789, rakuten: 789, yahoo: 789, base: 789 },
  recipeSnapshot: { newPriceInclTax: 885, sellingPrice: 885 },
  latestRecipeRevision: { previous_price_incl_tax: 864 },
};
const before = structuredClone(parameters);
const [comparison] = compare(parameters);
assert.deepEqual(comparison.targets, parameters.targets);
assert.equal(comparison.previousPriceInclTax, 789, "元価格は予約で固定した基準価格を使う");
assert.equal(comparison.newPriceInclTax, 885);
assert.equal(comparison.differenceInclTax, 96, "編集途中の864円や新価格885円を元価格にしない");
assert.equal(comparison.changePercent, 96 / 789 * 100, "率は表示直前まで丸めない");
assert.deepEqual(parameters, before, "予約入力を変更しない");

assert.deepEqual(compare({
  targets: [" Yahoo ", "amazon", "base", "rakuten", "amazon", "unknown"],
  newPriceInclTax: 1000,
  siteBaselines: { yahoo: 900, amazon: 800, base: 900, rakuten: null },
}), [
  { targets: ["yahoo", "base"], previousPriceInclTax: 900, newPriceInclTax: 1000, differenceInclTax: 100, changePercent: 100 / 900 * 100 },
  { targets: ["amazon"], previousPriceInclTax: 800, newPriceInclTax: 1000, differenceInclTax: 200, changePercent: 25 },
  { targets: ["rakuten"], previousPriceInclTax: null, newPriceInclTax: 1000, differenceInclTax: null, changePercent: null },
], "ECごとに異なる基準価格をまとめ、最初の対象順を維持する");

for (const invalid of [null, undefined, 0, -1, 2.5, NaN, Infinity, "", "invalid", true, {}, []]) {
  assert.deepEqual(compare({ targets: ["amazon"], newPriceInclTax: 1000, siteBaselines: { amazon: invalid } }), [
    { targets: ["amazon"], previousPriceInclTax: null, newPriceInclTax: 1000, differenceInclTax: null, changePercent: null },
  ], `不正な元価格は未確認: ${String(invalid)}`);
  assert.deepEqual(compare({ targets: ["amazon"], newPriceInclTax: invalid, siteBaselines: { amazon: 1000 } }), [
    { targets: ["amazon"], previousPriceInclTax: 1000, newPriceInclTax: 0, differenceInclTax: null, changePercent: null },
  ], `不正な新価格で差額や率を捏造しない: ${String(invalid)}`);
}

assert.deepEqual(compare({ targets: ["amazon", "base"], newPriceInclTax: 1000 }), [
  { targets: ["amazon", "base"], previousPriceInclTax: null, newPriceInclTax: 1000, differenceInclTax: null, changePercent: null },
], "基準価格が未保存のECも一覧から消さない");
assert.equal(compare({ targets: ["amazon"], newPriceInclTax: 900, siteBaselines: { amazon: 1000 } })[0].changePercent, -10);
assert.equal(compare({ targets: ["amazon"], newPriceInclTax: 1000, siteBaselines: { amazon: 1000 } })[0].changePercent, 0);
assert.equal(compare({ targets: ["amazon"], newPriceInclTax: "1000", siteBaselines: { amazon: "800" } })[0].differenceInclTax, 200);
assert.deepEqual(compare(null), []);
assert.deepEqual(compare({ targets: ["unknown"], newPriceInclTax: 1000 }), []);

console.log("EC price reservation comparisons: passed");
