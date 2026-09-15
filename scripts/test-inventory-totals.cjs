const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { load } = require('./food-store-inventory-loader.cjs');
const { truncateInventoryYen } = load('inventory-total');
const { recalculateInventory, isInventoryAmountCell } = load('food-store-inventory');
for (const [input,expected] of [[19.99,19],[-19.99,-19],[0.9,0],[0,0],[63,63],[90*0.7,63],[0.99999999,0],[857476.8,857476]]) assert.equal(truncateInventoryYen(input),expected);
const source={sheets:[{name:'食材',rows:7,cols:5,cells:{B2:{value:'原価'},C2:{value:'個数'},D2:{value:'金額（税抜）'},B3:{value:2.65},C3:{value:150},D3:{value:397.5,formula:'=B3*C3'},B4:{value:1.93},C4:{value:1.5},D4:{value:2.895,formula:'=B4*C4'},D5:{value:400.395,formula:'=SUM(D3:D4)'},D6:{value:432.4266,formula:'=D5*1.08'},E3:{value:'備考'} }},{name:'合計',rows:4,cols:2,cells:{B1:{value:'金額'},B2:{value:432.4266,formula:'=食材!D6'},B3:{value:'#REF!',formula:'=#REF!'},B4:{value:'#REF!',formula:'=SUM(B2:B3)'}}}]};
const rounded=recalculateInventory(source,true);
assert.equal(rounded.sheets[0].cells.B3.value,2.65,'unit price unchanged');
assert.equal(rounded.sheets[0].cells.C4.value,1.5,'fractional quantity unchanged');
assert.equal(rounded.sheets[0].cells.D3.value,397);
assert.equal(rounded.sheets[0].cells.D4.value,2);
assert.equal(rounded.sheets[0].cells.D5.value,399,'total equals displayed line amounts');
assert.equal(rounded.sheets[0].cells.D6.value,430);
assert.equal(rounded.sheets[1].cells.B2.value,430);
assert.equal(rounded.sheets[1].cells.B4.value,'#REF!');
assert.equal(source.sheets[0].cells.D3.value,397.5,'imported original unchanged');
const exported=structuredClone(rounded);
for(const sheet of exported.sheets)for(const [address,cell] of Object.entries(sheet.cells))if(cell.formula&&isInventoryAmountCell(sheet,address))cell.formula=`=ROUNDDOWN(${cell.formula.slice(1)},0)`;
const reopened=recalculateInventory(exported);
assert.equal(reopened.sheets[0].cells.D5.value,399,'Excel ROUNDDOWN formulas survive reimport');
assert.equal(reopened.sheets[1].cells.B2.value,430);
assert.equal(reopened.sheets[1].cells.B4.value,'#REF!');
for (const file of ['app/wholesale/inventory/page.tsx','app/wholesale/inventory/print/page.tsx']) {
  const text = fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const functions = ['inventoryValue','inventoryScaledValue'].map(name => {
    const start=text.indexOf(`function ${name}(`);
    const end=text.indexOf('\nfunction ',start+1);
    return text.slice(start,end);
  }).join('\n');
  const js=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  const calculate=new Function('truncateInventoryYen',`${js}; return inventoryValue;`)(truncateInventoryYen);
  assert.equal(calculate([{wholesale_price:0.7,quantity:3},{wholesale_price:1.93,quantity:1.5}]),4,`${file}: sum of truncated detail amounts`);
}
console.log('Inventory amounts: truncation, float boundary, preserved unit/quantity/source, cross-sheet totals and Excel reimport passed');
