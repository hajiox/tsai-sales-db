import assert from 'node:assert/strict';
import { classifyYahooStatement } from '../lib/yahoo-settlement-classification.ts';
const ledger = {
  billing: [{ name: 'PRオプション利用料', amount: 1000 }, { name: 'プロモーションパッケージ利用料', amount: 2000 }, { name: 'カード決済手数料', amount: 300 }],
  receipts: [{ name: 'カード決済金額', amount: 10000 }, { name: 'PRオプション利用料キャンセル分', amount: 50 }, { name: 'カード決済手数料キャンセル分', amount: 10 }, { name: 'モールクーポン利用料', amount: 500 }],
};
const result = classifyYahooStatement(ledger);
assert.equal(result.platform_fees, 3000);
assert.equal(result.excluded_ad_costs, 0);
assert.equal(result.payment_fees, 300);
assert.equal(result.other_credits, 60);
assert.equal(result.excluded_marketplace_funded_discounts, 500);
assert.equal(result.net_payout, 7260);
assert.deepEqual(classifyYahooStatement(ledger), result);
const mixed = classifyYahooStatement({
  billing: [...ledger.billing, { name: 'クリック課金型広告利用料', amount: 500 }],
  receipts: [...ledger.receipts, { name: 'プロモーションパッケージ利用料キャンセル分', amount: 20 }, { name: 'クリック課金型広告利用料キャンセル分', amount: 30 }],
});
assert.equal(mixed.platform_fees, 3000);
assert.equal(mixed.other_credits, 80);
assert.equal(mixed.excluded_ad_costs, 470);
assert.equal(mixed.platform_fees + mixed.payment_fees - mixed.other_credits + mixed.excluded_ad_costs, 3690);
assert.throws(() => classifyYahooStatement({ ...ledger, billing: [...ledger.billing, ledger.billing[0]] }), /重複/);
assert.throws(() => classifyYahooStatement({ ...ledger, billing: [{ name: 'unknown', amount: 1 }] }), /分類確認/);
assert.throws(() => classifyYahooStatement({ ...ledger, billing: [{ name: 'PRオプション利用料', amount: -1 }] }), /金額/);
assert.throws(() => classifyYahooStatement({ ...ledger, receipts: [] }), /項目別/);
console.log('Yahoo classification and cancellation tests passed.');
