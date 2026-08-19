const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScriptModule(relativePath, dependencyMap = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.prototype.hasOwnProperty.call(dependencyMap, name)
    ? dependencyMap[name]
    : require(name);
  new Function("module", "exports", "require", output)(loaded, loaded.exports, localRequire);
  return loaded.exports;
}

const money = loadTypeScriptModule("lib/money.ts");
const {
  taxExcludedForExactIncluded,
  taxExcludedFromIncluded,
  taxIncludedFromExcluded,
} = money;

assert.equal(taxIncludedFromExcluded(4158), 4490, "通常の税抜優先計算を維持する");
assert.equal(taxExcludedFromIncluded(4490), 4157, "既存の税抜換算を変更しない");

const exactNet = taxExcludedForExactIncluded(4490);
assert.equal(exactNet, 4157.4075);
assert.equal(taxIncludedFromExcluded(exactNet), 4490, "税込優先は指定税込額へ正確に戻る");

for (let included = 1; included <= 100_000; included += 1) {
  const net = taxExcludedForExactIncluded(included);
  assert.equal(
    taxIncludedFromExcluded(net),
    included,
    `税込${included}円が逆算後にずれない`,
  );
  assert.ok(net - included / 1.08 < 0.00011, `税込${included}円の逆算精度`);
}

const ecPriceServer = loadTypeScriptModule("lib/ec-price-job-server.ts", {
  "server-only": {},
  "@/lib/money": money,
});
const snapshot = ecPriceServer.buildEcPriceRecipeSnapshot({
  id: "recipe-id",
  name: "税込優先テスト",
  selling_price: exactNet,
});
assert.equal(snapshot.newPriceExTax, 4157, "Bridge互換の税抜整数を維持する");
assert.equal(snapshot.newPriceInclTax, 4490, "EC価格は税込優先の指定額を使う");

const priceHistory = loadTypeScriptModule("lib/recipe-price-history.ts");
assert.deepEqual(
  priceHistory.previousRecipePriceFromRevision({
    previous_price_ex_tax: exactNet,
    previous_price_incl_tax: 4490,
    created_at: "2026-08-19T00:00:00.000Z",
  }),
  {
    previousPriceExTax: exactNet,
    previousPriceInclTax: 4490,
    changedAt: "2026-08-19T00:00:00.000Z",
  },
  "直前の変更前価格を税抜・税込の両方で返す",
);
assert.equal(
  priceHistory.previousRecipePriceFromRevision(null),
  null,
  "価格履歴がなければ前回価格なしとして扱う",
);

const reservations = loadTypeScriptModule("lib/ec-price-reservations.ts");
assert.equal(
  reservations.EC_PRICE_RESERVATION_SCHEDULED_AT,
  "9999-12-31T23:59:59.000Z",
  "予約ジョブは一括実行までBridgeのclaim対象時刻に入らない",
);
assert.equal(
  reservations.normalizeEcPriceDispatchMode("reserved"),
  "reserved",
  "明示した予約モードを保持する",
);
assert.equal(
  reservations.normalizeEcPriceDispatchMode("unexpected"),
  "immediate",
  "不正な実行モードは従来どおり即時実行へ限定する",
);
assert.equal(
  reservations.isReservedEcPriceJob("queued", { dispatchMode: "reserved" }),
  true,
  "queuedかつreservedだけを一括実行予約として扱う",
);
assert.equal(
  reservations.isReservedEcPriceJob("running", { dispatchMode: "reserved" }),
  false,
  "実行開始済みジョブを予約へ戻さない",
);

console.log("Recipe selling price tax-inclusive priority checks passed.");
