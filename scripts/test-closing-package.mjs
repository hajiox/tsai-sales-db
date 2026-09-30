import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseClosingPackage } from '../lib/finance/closing-package.ts';
import { closingChunkExpectedSize, assembleClosingChunks } from '../lib/finance/closing-package-chunks.ts';

const loan = `借入金及び支払利子の内訳書
地域信用金庫 本店
2,000,000 20,000 1.500
日本政策金融公庫 本店
3,000,000 30,000 2.000
小計
5,000,000 50,000`;
const result=parseClosingPackage([{pageNumber:1,text:loan,rawText:'raw OCR preserved'},
  {pageNumber:2,text:'棚卸資産の内訳書\n商品 食品 0.00 0.00 100,000\n原材料 50,000'},
  {pageNumber:3,text:'受信通知\n所得金額又は欠損金額 0円\nこの申告による還付金額 1,234円\n欠損金又は災害損失金等の当\n50,000円\n期控除額\n翌期へ繰り越す欠損金又は災\n10,000円\n害損失金'},
  {pageNumber:4,text:'受信通知\n消費税及び地方消費税の合計\n200,000円\n（納付又は還付）税額'},
  {pageNumber:5,text:'別表十六八\n一括償却資産の損金算入に関する明細書\n当期分の損金算入限度額\n10,000 20,000\n当期損金経理額 0 0'},
  {pageNumber:6,text:'固定資産台帳 兼 減価償却計算書\n【有形固定資産】\n期末合計  2,000,000  1,500,000  300,000  100,000  1,000,000  1,400,000'},
  {pageNumber:7,text:'未分類の資料\n期首 10,000 期末 20,000\n残高 1,()00,000'},
]);
assert.equal(result.pages.length,7);
assert.equal(result.pages[0].rawText,'raw OCR preserved');
assert.equal(result.records.filter(row=>row.metadata.lender).length,2);
assert.deepEqual(result.records.filter(row=>row.metadata.lender).map(row=>row.amount),[2_000_000,3_000_000]);
assert(result.records.filter(row=>row.metadata.lender).every(row=>row.metadata.validation.passed));
assert.equal(result.records.find(row=>row.metadata.metricKey==='loss_carryforward_used').amount,50_000);
assert.equal(result.records.find(row=>row.metadata.metricKey==='loss_carryforward_remaining').amount,10_000);
assert.equal(result.records.find(row=>row.metadata.metricKey==='vat_final_due').amount,200_000);
assert.equal(result.records.find(row=>row.metadata.metricKey==='depreciation_shortfall').amount,230_000);
assert.equal(result.records.find(row=>row.page===7 && row.rawText.startsWith('期首')).amount,null);
assert(!result.records.some(row=>row.page===7 && row.amount===1_000_000));
const bad=parseClosingPackage([{pageNumber:1,text:loan.replace('5,000,000 50,000','5,000,001 50,000')}]);
assert(bad.records.filter(row=>row.metadata.lender).every(row=>row.amount===null));
const related=parseClosingPackage([{pageNumber:1,text:loan+'\n山田 太郎  会津若松市例町1番\n10,000\n山田 花子  会津若松市例町2番\n20,000\n小計\n30,000'}]);
assert.deepEqual(related.records.filter(row=>row.section==='related_party_loan_detail').map(row=>row.amount),[10_000,20_000]);
assert.throws(()=>parseClosingPackage([{pageNumber:2,text:'missing page one'}]));
assert.throws(()=>parseClosingPackage([{pageNumber:1,text:'a'},{pageNumber:1,text:'b'}]));

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=Buffer.from('%PDF-test confidential-sized synthetic payload');
const size=10;
const chunks=Array.from({length:Math.ceil(bytes.length/size)},(_,index)=>{const part=bytes.subarray(index*size,(index+1)*size);return {index,bytes:part,hash:hash(part)}});
assert.equal(closingChunkExpectedSize(bytes.length,size,chunks.length-1),bytes.length%size);
assert.deepEqual(assembleClosingChunks(chunks,bytes.length,hash(bytes),size),bytes);
assert.throws(()=>assembleClosingChunks(chunks.slice(0,-1),bytes.length,hash(bytes),size));
assert.throws(()=>assembleClosingChunks([...chunks].reverse(),bytes.length,hash(bytes),size));
assert.throws(()=>assembleClosingChunks(chunks.map((part,index)=>index?part:{...part,hash:'0'.repeat(64)}),bytes.length,hash(bytes),size));
assert.throws(()=>assembleClosingChunks(chunks,bytes.length,'0'.repeat(64),size));
console.log('closing package extraction, ambiguous OCR, reconciliation and chunk integrity tests passed');
