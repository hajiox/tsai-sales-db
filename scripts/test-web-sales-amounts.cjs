const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { WEB_SALES_CHANNELS, resolveWebSalesAmount, sumWebSalesAmounts, getWebSalesAverageUnitPrice, summarizeWebSalesChannel, adjustWebSalesEcDeductions } = require('../lib/web-sales-amounts.ts');
const row = Object.fromEntries(WEB_SALES_CHANNELS.flatMap(channel => [[channel+'_count',0],[channel+'_amount',null]]));
Object.assign(row, { product_id:'discounted', yahoo_count:3, yahoo_amount:'2900', unit_price:1000, unit_cost_ex_ec:200 });
assert.equal(resolveWebSalesAmount(row,'yahoo'),2900);
assert.equal(sumWebSalesAmounts(row),2900);
assert.equal(getWebSalesAverageUnitPrice(row,'yahoo'),2900/3);
assert.equal(summarizeWebSalesChannel([row],'yahoo').productCost,600);
const missing={...row,yahoo_amount:null};
assert.equal(sumWebSalesAmounts(missing),null);
assert.equal(summarizeWebSalesChannel([row,missing],'yahoo').sales,null);
assert.equal(summarizeWebSalesChannel([row,{...row,unit_cost_ex_ec:null}],'yahoo').productCost,null);
assert.equal(sumWebSalesAmounts({...row,yahoo_amount:0}),0);
assert.equal(sumWebSalesAmounts({...row,yahoo_amount:12.34}),12.34);
assert.equal(summarizeWebSalesChannel([{...row,unit_cost_ex_ec:1000,unit_profit_rate:0}],'yahoo').productCost,null);
// Catalog price cannot affect saved revenue or average realized unit price.
assert.equal(sumWebSalesAmounts({...row,unit_price:100000}),2900);
const adjusted = adjustWebSalesEcDeductions('tiktok', 100, 100);
assert.equal(900 - 400 - adjusted.ecDeductions, 500, 'seller SKU discount is already in the saved 900 revenue');
assert.equal(adjusted.sellerDiscountsIncludedInSales, 100);
assert.equal(typeof adjusted.ecDeductionAdjustmentNote, 'string');
assert.ok(adjusted.ecDeductionAdjustmentNote.length > 0);
// These costs are separately evidenced: only seller_discounts is already in SKU sales.
const separateCosts = { platformFees: 30, sellerCoupons: 10, sellerPoints: 5, shipping: 20 };
const rawDeductions = 100 + Object.values(separateCosts).reduce((sum, amount) => sum + amount, 0);
assert.equal(adjustWebSalesEcDeductions('tiktok', rawDeductions, 100).ecDeductions, 65);
assert.deepEqual(adjustWebSalesEcDeductions('tiktok', 0, 0), { ecDeductions: 0 });
assert.deepEqual(adjustWebSalesEcDeductions('tiktok', 65, 0), { ecDeductions: 65 });
for (const channel of WEB_SALES_CHANNELS.filter(channel => channel !== 'tiktok')) {
  assert.deepEqual(adjustWebSalesEcDeductions(channel, rawDeductions, 100), { ecDeductions: rawDeductions });
  assert.deepEqual(adjustWebSalesEcDeductions(channel, 0, 0), { ecDeductions: 0 });
  assert.deepEqual(adjustWebSalesEcDeductions(channel, null, 100), { ecDeductions: null });
  assert.deepEqual(adjustWebSalesEcDeductions(channel, 65, null), { ecDeductions: 65 });
}
assert.equal(adjustWebSalesEcDeductions('tiktok', null, 100).ecDeductions, null);
assert.deepEqual(adjustWebSalesEcDeductions('tiktok', 100, null), { ecDeductions: null });
assert.deepEqual(adjustWebSalesEcDeductions('tiktok', null, null), { ecDeductions: null });
console.log('Actual WEB revenue checks passed: discounts, zero, decimal, missing amount/cost, catalog independence.');
