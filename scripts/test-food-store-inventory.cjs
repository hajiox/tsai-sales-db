const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load } = require('./food-store-inventory-loader.cjs');
const { recalculateInventory, validateInventoryWorkbook, inventoryFormulaErrors } = load('food-store-inventory');
const { parseInventoryExcel } = load('food-store-inventory-import');
const input = { sheets: [{ name: '食材', rows: 5, cols: 4, cells: { B1: { value: 1.93 }, C1: { value: 2000 }, D1: { value: 0, formula: '=B1*C1' }, D2: { value: 0, formula: '=B2*C2' }, D3: { value: 0, formula: '=SUM(D1:D2)' }, D4: { value: 0, formula: '=D3*1.08' } } }, { name: '合計', rows: 4, cols: 2, cells: { B1: { value: 0, formula: '=食材!D4' }, B2: { value: '#REF!', formula: '=#REF!' }, B3: { value: '#REF!', formula: '=SUM(B1:B2)' } } }] };
const result = recalculateInventory(input);
assert.equal(result.sheets[0].cells.D1.value, 3860);
assert.equal(result.sheets[0].cells.D2.value, 0);
assert.equal(result.sheets[1].cells.B1.value, 3860 * 1.08);
assert.equal(result.sheets[1].cells.B3.value, '#REF!');
assert.equal(input.sheets[0].cells.D1.value, 0, 'must not mutate the imported original');
input.sheets[0].cells.C1.value = 10.5;
assert.equal(recalculateInventory(input).sheets[0].cells.D1.value, 1.93 * 10.5);
input.sheets[0].cells.D5 = { value: null, formula: '=D5' };
assert.equal(recalculateInventory(input).sheets[0].cells.D5.value, '#REF!');
input.sheets[0].cells.D5.formula = '=SUM(A1:A999999999999)';
assert.equal(recalculateInventory(input).sheets[0].cells.D5.value, '#NAME?');
input.sheets[0].cells.D5.formula = '=WEBSERVICE("https://example.com")';
assert.equal(recalculateInventory(input).sheets[0].cells.D5.value, '#NAME?');
assert.throws(() => validateInventoryWorkbook({ sheets: [{ name: 'bad', rows: 2000, cols: 1, cells: {} }] }));
if (process.argv[2]) {
  const book = parseInventoryExcel(fs.readFileSync(process.argv[2]));
  assert.equal(book.sheets.length, 8);
  const calculated = recalculateInventory(book);
  let count = 0, formulas = 0;
  for (let s = 0; s < book.sheets.length; s++) for (const [address, cell] of Object.entries(book.sheets[s].cells)) {
    count++;
    const actual = calculated.sheets[s].cells[address];
    if (cell.formula) {
      formulas++;
      if (typeof cell.value === 'number') assert.ok(Math.abs(actual.value - cell.value) < 1e-7, `${book.sheets[s].name}!${address}`);
      else assert.equal(actual.value, cell.value);
    } else assert.deepEqual(actual, cell);
  }
  console.log(JSON.stringify({ sheets: book.sheets.length, populatedCells: count, formulas, sourceErrors: inventoryFormulaErrors(book) }));
}
console.log('Inventory calculation, error propagation, blank/zero, fractions, cycle and input limits passed');
