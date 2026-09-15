const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const XLSX = require('xlsx');
const cache = new Map();
function load(file) {
  const full = path.resolve(__dirname, '..', file);
  if (cache.has(full)) return cache.get(full);
  const module = { exports: {} }; cache.set(full, module.exports);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports, name => name.startsWith('.') ? load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(full), name + '.ts'))) : require(name));
  return module.exports;
}
const { buildClosingInventoryReport, summarizeInventorySource } = load('lib/finance/closing-inventory.ts');
const { buildClosingInventoryExcel } = load('lib/finance/closing-inventory-excel.ts');
const header = { id: 'test', fiscal_year: 2026, inventory_date: '2026-07-31', status: 'completed' };
const source = items => ({ inventory: header, items });
const brand = source([{ selling_price: 100.5, wholesale_price: 9999, quantity: 2, product_name: '=literal name' }, { selling_price: 10, quantity: null }]);
assert.equal(summarizeInventorySource('brand', brand)[0].amount, 140, 'derive price from retail like owning screen, truncate each amount');
assert.equal(summarizeInventorySource('brand', brand)[0].pendingCount, 1);
const warehouse = source([{ wholesale_price: 1.234, quantity: 2.3456 }, { wholesale_price: 900, quantity: 4, review_status: 'excluded' }]);
assert.equal(summarizeInventorySource('warehouse', warehouse)[0].amount, 2);
const manufacturing = source([{ item_type: 'ingredient', tax_included_cost: 1.93, stock_count: 1.5 }, { item_type: 'ingredient', tax_included_cost: 1.93, stock_count: 1.5 }, { item_type: 'material', tax_included_cost: 5, stock_count: 2 }]);
assert.deepEqual(summarizeInventorySource('manufacturing', manufacturing).map(r => r.amount), [4, 10]);
assert.equal(summarizeInventorySource('manufacturing', manufacturing)[0].details[1][1], 1.93);
const partner = source([{ cost_unit: 9, inventory_quantity: 2, inventory_value: 17.9 }]);
assert.equal(summarizeInventorySource('partner', partner)[0].amount, 17, 'use saved partner value');
const food = { inventory: header, items: [], workbook: { sheets: [
  { name: '合計', rows: 5, cols: 2, cells: { A2: { value: '道の駅食材在庫' }, B2: { value: 12 }, A3: { value: '道の駅資材在庫' }, B3: { value: 7 }, A4: { value: '共通資材' }, B4: { value: 3 }, A5: { value: '合計' }, B5: { value: 22 } } },
  ...['道の駅食材在庫', '道の駅資材在庫', '共通資材'].map(name => ({ name, rows: 1, cols: 1, cells: { A1: { value: name } } })),
] } };
const report = buildClosingInventoryReport(2026, [2026], { brand, manufacturing, warehouse, partner, food });
assert.equal(report.rows.length, 8);
assert.equal(report.total, 195, 'summary is not double-counted');
assert.equal(report.hasIncomplete, true);
const missing = { inventory: null, items: [] };
const empty = buildClosingInventoryReport(2025, [2026], { brand: missing, manufacturing: missing, warehouse: missing, partner: missing, food: missing });
assert.ok(empty.rows.every(r => r.amount === null && r.status === 'missing'));
const broken = structuredClone(food); broken.workbook.sheets[0].cells.B2 = { value: '#REF!', formula: '=#REF!' };
assert.ok(summarizeInventorySource('food', broken).every(r => r.amount === null && r.warning));
const workbook = buildClosingInventoryExcel(report);
const reread = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
assert.equal(reread.SheetNames.length, 9);
assert.equal(reread.Sheets['決算棚卸し一覧'].F15.v, report.total);
assert.equal(reread.Sheets['決算棚卸し一覧'].F15.f, 'SUM(F7:F14)');
assert.equal(reread.Sheets['1_店舗商品'].A7.v, '=literal name');
assert.equal(reread.Sheets['1_店舗商品'].A7.f, undefined);
assert.equal(reread.Sheets['2_製造・食材'].B7.v, 1.93);
console.log('PASS: 8 categories, owning-screen rounding, exclusions, missing values, original partner values, no double-counting, formula errors, Excel roundtrip and literal text');
module.exports = { load };
