const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
const { monthlyAbcdInput, needsMonthlyAbcd, ACTIVE_EC_CHANNELS } = require('../lib/web-sales-abcd/monthly.ts');
assert.deepEqual([...ACTIVE_EC_CHANNELS], ['amazon', 'rakuten', 'yahoo', 'base']);
assert.equal(needsMonthlyAbcd('amazon', '2026-08-01', '2026-08-31'), true);
assert.equal(needsMonthlyAbcd('yahoo', '2028-02-01', '2028-02-29'), true);
assert.equal(needsMonthlyAbcd('amazon', '2026-08-01', '2026-08-15'), false);
assert.equal(needsMonthlyAbcd('qoo10', '2026-08-01', '2026-08-31'), false);
const input = (channel, csv) => monthlyAbcdInput(channel, '2026-08-01', '2026-08-31', csv, 'test.csv');
const amazon = input('amazon', '（子）ASIN,タイトル,セッション数 - 合計,注文された商品点数,注文商品の売上額\na,売上ゼロ,100,0,0\nb,商品,200,12,2400');
assert.equal(amazon.items.length, 2);
assert.equal(amazon.items[0].conversions, 0);
assert.equal(amazon.metric, 'units_sessions');
const yahoo = input('yahoo', '商品コード,商品名,訪問者数,注文数合計,売上合計値（税込）\ny,商品,120,8,1600');
assert.equal(yahoo.metric, 'orders_visitors');
assert.equal(yahoo.items[0].conversions, 8);
const masked = input('yahoo', '商品コード,商品名,訪問者数,注文数合計,売上合計値（税込）\ny,少数,2未満,0,0\nz,商品,120,8,1600');
assert.equal(masked.items.length, 2);
assert.equal(masked.items[0].access, null);
const { analyze } = require('../lib/web-sales-abcd/model.ts');
assert.equal(analyze(masked).items[0].rank, '保留');
assert.match(analyze(masked).items[0].reason, /2未満/);
assert.throws(() => input('rakuten', '表示期間,2026年07月から2026年07月\n商品管理番号,商品名,アクセス人数,売上件数,売上\nr,商品,100,1,100'), /期間/);
assert.throws(() => input('rakuten', '商品管理番号,商品名,売上件数,売上\nr,商品,1,100'), /列/);
assert.throws(() => input('rakuten', '期間,2026/08/01,2026/08/30\n商品管理番号,商品名,アクセス人数,売上件数,売上\nr,商品,100,1,100'), /期間/);
assert.throws(() => input('yahoo', '商品コード,商品名,訪問者数,注文数合計,売上合計値（税込）\ny,商品,,8,1600'), /欠落/);
assert.throws(() => input('yahoo', '商品コード,商品名,訪問者数,注文数合計,売上合計値（税込）\ny,商品,100,8,1600\ny,商品,100,8,1600'), /重複/);
console.log('Monthly ABCD tests passed: dates, retired channels, zero sales, exact metrics, missing columns/data, duplicate products.');
assert.equal(needsMonthlyAbcd('base', '2026-08-01', '2026-08-31'), true);
assert.equal(needsMonthlyAbcd('base', '2026-08-01', '2026-08-15'), false);
const baseReport = { schemaVersion: 1, channel: 'base', shop: '会津ブランド館', source: 'https://admin.thebase.com/shop_admin/data/items', start: '2026-08-01', end: '2026-08-31', lastPageVerified: true, pages: [2], rows: [
  { key: '123', name: '商品', values: ['120', '0', '12', '5%'] },
  { key: 'unlinked:削除済み商品', name: '削除済み商品', values: ['1', '0', '0', '0%'] },
] };
const baseInput = input('base', JSON.stringify(baseReport));
assert.equal(baseInput.metric, 'units_views');
assert.equal(baseInput.items[0].conversions, 12); // Displayed rate is never inverted.
assert.equal(baseInput.items[0].sales, null);
assert.equal(baseInput.items[1].access, 1);
for (const invalid of [
  { ...baseReport, end: '2026-08-30' },
  { ...baseReport, pages: [1] },
  { ...baseReport, pages: [1, 1] },
  { ...baseReport, lastPageVerified: false },
  { ...baseReport, shop: '別店舗' },
  { ...baseReport, rows: [baseReport.rows[0], baseReport.rows[0]] },
  { ...baseReport, rows: [{ ...baseReport.rows[0], values: ['', '0', '12', '5%'] }, baseReport.rows[1]] },
]) assert.throws(() => input('base', JSON.stringify(invalid)));
console.log('BASE monthly tests passed: full month, complete pages, identity, duplicate rejection, real units/PV.');
