import assert from "node:assert/strict";
import { hasPackConflict, priceDifference } from "../lib/sales-price-reconciliation.ts";
import { validateYahooDailyReport } from "../lib/web-sales-automation/yahoo-daily-check.ts";

assert.equal(hasPackConflict("二合用(2人～3人前)×2個セット", "【単品】炊き込みご飯"), true);
assert.equal(hasPackConflict("チャーシュー600g", "チャーシュー600g"), false);
assert.equal(hasPackConflict("カレー2食セット", "カレー2個セット"), false);
assert.equal(hasPackConflict("生麺140g×6食", "生麺130g×6食"), false);
assert.equal(priceDifference(1689, 1690), false);
assert.equal(priceDifference(3240, 3010.41), true);
assert.equal(priceDifference(0, 100), false);
const daily = '日付,売上合計値,注文数 - 注文点数合計\n2026/08/30,100,1\n2026/08/31,200,2\n';
assert.equal(validateYahooDailyReport(daily, '2026-08-30', '2026-08-31', 3, 300).amount, 300);
assert.throws(() => validateYahooDailyReport(daily, '2026-08-30', '2026-08-31', 1, 100), /不一致/);
assert.throws(() => validateYahooDailyReport(daily, '2026-08-01', '2026-08-31', 3, 300), /全日/);
assert.throws(() => validateYahooDailyReport(daily.replace('2026/08/31', '2026/08/30'), '2026-08-30', '2026-08-31', 3, 300), /全日/);
console.log("sales price reconciliation: passed");
