import assert from "node:assert/strict";
import {
  allocateIntegerTotal,
  classifyGoogleAdsCostRows,
  microsToRoundedYen,
} from "../lib/google-ads-import-policy.ts";

const rows = [
  ...Array.from({ length: 11 }, () => ({
    campaign_name: "BASE注文上位10_標準ショッピング_20260821",
    asset_group_name: "[SHOPPING] BASE注文上位10_標準ショッピング_20260821",
    series_code: null,
    cost_micros: 1_000_000,
  })),
  ...Array.from({ length: 10 }, () => ({
    campaign_name: "食ブラ_来店_検索_地図CV_202608",
    asset_group_name: "[SEARCH] 食ブラ_来店_検索_地図CV_202608",
    series_code: null,
    cost_micros: 500_000,
  })),
  ...Array.from({ length: 7 }, () => ({
    campaign_name: "商品P-MAX",
    asset_group_name: "商品A",
    series_code: 12,
    cost_micros: 2_000_000,
  })),
  ...Array.from({ length: 4 }, () => ({
    campaign_name: "名称未確認",
    asset_group_name: "新規広告グループ",
    series_code: null,
    cost_micros: 250_000,
  })),
];

const classified = classifyGoogleAdsCostRows(rows);
assert.equal(classified.sharedShoppingMicros, 11_000_000);
assert.equal(classified.excludedStoreMicros, 5_000_000);
assert.equal(classified.mappedMicrosBySeries.get(12), 14_000_000);
assert.deepEqual(classified.unknownGroupNames, ["新規広告グループ"]);
assert.equal(microsToRoundedYen(4_451_769_117), 4_452);

const allocations = allocateIntegerTotal(10, new Map([[3, 1], [1, 1], [2, 1]]));
assert.equal([...allocations.values()].reduce((sum, value) => sum + value, 0), 10);
assert.deepEqual([...allocations], [[1, 4], [2, 3], [3, 3]]);

console.log("Google Ads import classification and allocation policy verified.");
