const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@/lib/unitPriceHelper') return {
    getBulkProductUnitPrices: async (_client, ids) => new Map(ids.map(id => [id, { unit_price: 5000, unit_profit_rate: 20 }])),
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { parseReportedWebSalesCsv, parsePreparedWebSalesCsv, actualSalesAmount } = require('../lib/web-sales-automation/csv-import.ts');
const { normalizeManualSalesConfirmation, confirmManualWebSales } = require('../lib/web-sales-automation/manual-confirm.ts');
const { requireReportedAmount, ActualSalesAmountUnavailableError } = require('../lib/web-sales-automation/actual-sales-policy.ts');

const fixtures = {
  amazon: 'タイトル,注文された商品点数,注文商品の売上額\n商品A,2,"￥1,234.50"',
  rakuten: 'meta1\nmeta2\nmeta3\nmeta4\nmeta5\nmeta6\n商品名,売上個数,売上\n商品A,2,1234.5',
  yahoo: '商品名,注文点数合計,売上合計値（税込）\n"商品A,セット",2,1234.5',
  mercari: '商品名,数量,売上（税込）\n商品A,2,1234.5',
  base: '商品名,数量,合計金額\n商品A,2,1234.5',
  qoo10: '商品名,数量,購入者決済金額\n商品A,2,1234.5',
  tiktok: '商品名,数量,SKU小計（割引前）,セラーSKU割引,注文金額,注文の支払い日時\n商品A,2,1300,65.5,9000,2026/09/01 12:00:00',
};
for (const [channel, csv] of Object.entries(fixtures)) {
  const rows = parseReportedWebSalesCsv(channel, csv);
  assert.equal(rows.length, 1, channel);
  assert.equal(rows[0].quantity, 2, channel);
  assert.equal(rows[0].amount, 1234.5, channel);
  const prepared = parsePreparedWebSalesCsv(channel, csv, { startDate: '2026-09-01', endDate: '2026-09-30', reportMonth: '2026-09-01' });
  assert.equal(prepared.items[0].amount, 1234.5, channel);
}
assert.equal(actualSalesAmount('0'), 0);
assert.throws(() => actualSalesAmount(''), /未取得/);
assert.throws(() => actualSalesAmount('100abc'), /不正/);
assert.throws(() => parseReportedWebSalesCsv('qoo10', '商品名,数量,販売価格\n商品A,2,100'), /未取得/);
assert.throws(() => parseReportedWebSalesCsv('yahoo', '商品名,注文点数合計,売上合計値（税込）\n商品A,0,100'), /販売個数0/);
assert.throws(() => parseReportedWebSalesCsv('amazon', 'タイトル,注文された商品点数,注文商品の売上額\n商品A,1.5,100'), /販売個数が不正/);
const multiSku = parseReportedWebSalesCsv('tiktok', '商品名,数量,SKU小計（割引前）,セラーSKU割引,注文金額\n商品A,1,1000,100,2500\n商品B,1,2000,0,2500');
assert.equal(multiSku.reduce((sum, row) => sum + row.amount, 0), 2900);
assert.equal(requireReportedAmount('yahoo', 0), 0);
assert.throws(() => requireReportedAmount('yahoo', null), ActualSalesAmountUnavailableError);
assert.throws(() => requireReportedAmount('yahoo', true), ActualSalesAmountUnavailableError);

const productId = '11111111-1111-4111-8111-111111111111';
const productId2 = '22222222-2222-4222-8222-222222222222';
const body = { targetMonth: '2026-09', matchedProducts: [
  { productId, yahooTitle: '商品A', quantity: 2, amount: 1234.5 },
  { productId, yahooTitle: '商品A', quantity: 1, amount: 0 },
], expectedQuantity: 3, expectedAmount: 1234.5 };
assert.equal(normalizeManualSalesConfirmation('yahoo', body)[1].amount, 0);
assert.throws(() => normalizeManualSalesConfirmation('yahoo', { ...body, expectedAmount: 1234 }), /一致しません/);
assert.throws(() => normalizeManualSalesConfirmation('yahoo', { ...body, matchedProducts: [] }), /空の月次/);
assert.throws(() => normalizeManualSalesConfirmation('yahoo', { ...body, matchedProducts: [{ productId, quantity: 1 }] }), /未取得/);
assert.throws(() => normalizeManualSalesConfirmation('yahoo', { ...body, matchedProducts: [{ productId, quantity: 0, amount: 1 }] }), /販売個数0/);
assert.throws(() => normalizeManualSalesConfirmation('tiktok', { items: [
  { productId, quantity: 1, amount: 100, saleDate: '2026-09-01' },
  { productId: productId2, quantity: 1, amount: 100, saleDate: '2026-10-01' },
] }), /複数月/);

async function testConfirmation() {
  const calls = [];
  const client = {
    rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; },
    from: () => { throw new Error('Unexpected auxiliary write'); },
  };
  const result = await confirmManualWebSales(client, 'yahoo', body);
  assert.equal(result.amountTotal, 1234.5);
  assert.equal(result.quantityTotal, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'replace_web_sales_channel_summary');
  assert.equal(calls[0].args.p_rows[0].amount, 1234.5);
  assert.equal(calls[0].args.p_rows[0].quantity, 3);
  assert.equal(calls[0].args.p_rows[0].unit_price, 5000);
  await confirmManualWebSales(client, 'yahoo', body);
  assert.deepEqual(calls[0], calls[1], 'retry must replace the same amount, never increment it');
  await assert.rejects(confirmManualWebSales(client, 'yahoo', { ...body, expectedQuantity: 100 }), /一致しません/);
  assert.equal(calls.length, 2, 'invalid reconciliation cannot write');
}

// Optional archived-source verification emits aggregate totals only.
function verifyArchivedSources(folder) {
  if (!folder) return;
  const expected = { amazon: 3840300, rakuten: 4113285, yahoo: 7086432, mercari: 49636, base: 352763, tiktok: 4050 };
  for (const [channel, amount] of Object.entries(expected)) {
    const csv = fs.readFileSync(path.join(folder, `${channel}-2026-09-01_2026-09-30.prepared.csv`), 'utf8');
    const rows = parseReportedWebSalesCsv(channel, csv);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), amount, `${channel} archived report amount`);
    console.log(`${channel}: verified reported amount ${amount}`);
  }
}
testConfirmation().then(() => {
  verifyArchivedSources(process.argv[2]);
  console.log('Actual import tests passed: seven EC amounts, zero/missing, per-SKU discounts, single-month atomic replacement and reconciliation.');
}).catch(error => { console.error(error.message); process.exitCode = 1; });
