import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import XLSX from "xlsx";
import iconv from "iconv-lite";
import { parseBrandStoreMail, prepareBrandStoreSales, isBrandStoreMailAuthorized, BrandStoreMailReviewError } from "../lib/brand-store-mail-import.ts";

const posHeaders = ["日付FROM", "日付TO", "分析内容", "店舗ＧＰコード", "店舗ＧＰ名", "部門コード", "部門名", "仕入先コード", "ＪＡＮ", "商品名", "点数", "金額", "値引金額", "原価金額", "粗利"];
const posRows = [
  [46266,46295,"点数",1,"テスト店舗",51,"イートイン",995,"1234567890123","商品A",2,200,0,160,40],
  [46266,46295,"点数",1,"テスト店舗",51,"イートイン",995,"1234567890123","商品A",3,300,0,240,60],
  [46266,46295,"点数",1,"テスト店舗",52,"テイクアウト",995,"2234567890123","商品B",1,150,0,120,30],
];
function workbook(matrix, extraSheet = false) {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), "ABC");
  if (extraSheet) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), "other");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
function envelope(bytes, filename = "9.1-9.30.xlsx") {
  return { account:"ts@ai.aizu-tv.com", sender:"keiri@michinoeki-aizu.com", sourceMessageId:"abcdef123", subject:"道の駅あいづ　ABC分析表9月分", reportMonth:"2026-09", receivedAt:"2026-10-03T02:53:00Z", attachmentName:filename, attachmentSha256:createHash("sha256").update(bytes).digest("hex"), contentBase64:bytes.toString("base64") };
}
function expectReview(fn, code) { assert.throws(fn, error => error instanceof BrandStoreMailReviewError && error.code === code); }
let parsed = parseBrandStoreMail(envelope(workbook([posHeaders,...posRows])));
assert.equal(parseBrandStoreMail({...envelope(workbook([posHeaders,...posRows])),subject:"ABC分析表８・９月分送付について"}).input.reportMonth,"2026-09");
expectReview(()=>parseBrandStoreMail({...envelope(workbook([posHeaders,...posRows])),subject:"ABC分析表７・８月分送付について"}),"invalid_subject");
let prepared = prepareBrandStoreSales(parsed, [], []);
assert.equal(parsed.sourceRowCount,3); assert.equal(prepared.salesRows.length,2);
assert.equal(parsed.totalSales,650); assert.equal(parsed.totalQuantity,6); assert.equal(parsed.totalCostAmount,520); assert.equal(parsed.totalGrossProfit,130);
assert.deepEqual(new Set(prepared.salesRows.map(row=>row.category)),new Set(["イートイン","テイクアウト"]));
assert.equal(prepared.unmatchedProductCount,2); assert.ok(prepared.salesRows.every(row=>row.product_id===null));
const reordered = parseBrandStoreMail(envelope(workbook([posHeaders,...posRows.toReversed()])));
assert.equal(reordered.contentSha256,parsed.contentSha256,"row order does not duplicate content");
const badCost = posRows.map(row=>[...row]); badCost[0][13]=159;
expectReview(()=>parseBrandStoreMail(envelope(workbook([posHeaders,...badCost]))),"amount_mismatch");
const badDate = posRows.map(row=>[...row]); badDate[0][0]=46267;
expectReview(()=>parseBrandStoreMail(envelope(workbook([posHeaders,...badDate]))),"invalid_period");
const badSupplier = posRows.map(row=>[...row]); badSupplier[0][7]=994;
expectReview(()=>parseBrandStoreMail(envelope(workbook([posHeaders,...badSupplier]))),"wrong_store");
const badStore = posRows.map(row=>[...row]); badStore[0][3]=2;
expectReview(()=>parseBrandStoreMail(envelope(workbook([posHeaders,...badStore]))),"wrong_store");
const fractional = posRows.map(row=>[...row]); fractional[0][10]=1.5;
expectReview(()=>parseBrandStoreMail(envelope(workbook([posHeaders,...fractional]))),"invalid_number");
expectReview(()=>parseBrandStoreMail({...envelope(workbook([posHeaders,...posRows])),attachmentSha256:"a".repeat(64)}),"hash_mismatch");
expectReview(()=>parseBrandStoreMail({...envelope(workbook([posHeaders,...posRows])),sender:"other@example.test"}),"wrong_sender");
expectReview(()=>parseBrandStoreMail({...envelope(workbook([posHeaders,...posRows])),reportMonth:"2026-10"}),"invalid_period");
expectReview(()=>parseBrandStoreMail(envelope(workbook([posHeaders,...posRows],true))),"multiple_sheets");
const collision=posRows.map(row=>[...row]);collision[2][9]="商品A";
expectReview(()=>parseBrandStoreMail(envelope(workbook([posHeaders,...collision]))),"ambiguous_product");
expectReview(()=>prepareBrandStoreSales(parsed,[{product_id:1,product_name:"商品A",barcode:"9999999999999"}],[]),"ambiguous_product");
expectReview(()=>prepareBrandStoreSales(parsed,[{product_id:1,product_name:"商品A",barcode:"1234567890123"},{product_id:2,product_name:"other",barcode:"1234567890123"}],[]),"ambiguous_product");
const mapped = prepareBrandStoreSales(parsed,[{product_id:1,product_name:"商品A",barcode:"1234567890123"}],[]);
assert.equal(mapped.salesRows.find(row=>row.product_name==="商品A").product_id,1);
const lateWorkbook=XLSX.utils.book_new(),lateSheet=XLSX.utils.aoa_to_sheet([posHeaders,...posRows]);
XLSX.utils.sheet_add_aoa(lateSheet,[posRows[2]],{origin:"A15001"});XLSX.utils.book_append_sheet(lateWorkbook,lateSheet,"ABC");
expectReview(()=>parseBrandStoreMail(envelope(XLSX.write(lateWorkbook,{type:"buffer",bookType:"xlsx"}))),"invalid_rows");
const formulaWorkbook=XLSX.utils.book_new(),formulaSheet=XLSX.utils.aoa_to_sheet([posHeaders,...posRows]);formulaSheet.L2={t:"n",v:200,f:"100*2"};XLSX.utils.book_append_sheet(formulaWorkbook,formulaSheet,"ABC");
expectReview(()=>parseBrandStoreMail(envelope(XLSX.write(formulaWorkbook,{type:"buffer",bookType:"xlsx"}))),"formula_cell");
const csv=[posHeaders,...posRows.map(row=>["2026/9/1","2026/9/30",...row.slice(2)])].map(row=>row.join(",")).join("\r\n");
const utf8 = parseBrandStoreMail(envelope(Buffer.from(csv),"9.1-9.30.csv"));
const sjis = parseBrandStoreMail(envelope(iconv.encode(csv,"shift_jis"),"9.1-9.30.csv"));
assert.equal(utf8.contentSha256,sjis.contentSha256);assert.equal(utf8.totalCostAmount,520);
const explicitId={...parsed,sourceRows:parsed.sourceRows.map(row=>({...row,productId:99}))};
expectReview(()=>prepareBrandStoreSales(explicitId,[{product_id:11,product_name:"商品A",barcode:"1234567890123"}],[]),"ambiguous_product");
assert.equal(isBrandStoreMailAuthorized(new Request("https://example.test",{headers:{authorization:"Bearer secret"}}),"secret"),true);
assert.equal(isBrandStoreMailAuthorized(new Request("https://example.test",{headers:{authorization:"Bearer wrong"}}),"secret"),false);
assert.equal(isBrandStoreMailAuthorized(new Request("https://example.test"),""),false);
const fixture=process.argv.indexOf("--fixture");
if(fixture>=0){ const bytes=fs.readFileSync(process.argv[fixture+1]); const actual=parseBrandStoreMail(envelope(bytes)); const sales=prepareBrandStoreSales(actual,[],[]);assert.equal(actual.sourceRowCount,86);assert.equal(sales.salesRows.length,84);assert.equal(actual.totalQuantity,4063);assert.equal(actual.totalSales,4062850);assert.equal(actual.totalCostAmount,3429541);assert.equal(actual.totalGrossProfit,633309);console.log("Real attachment PASS: 86 source rows / 84 products / 4063 units / 4062850 JPY");}
const csvFixture=process.argv.indexOf("--csv-fixture");
if(csvFixture>=0){const bytes=fs.readFileSync(process.argv[csvFixture+1]);const old=parseBrandStoreMail({...envelope(bytes,"8.1-8.31.csv"),reportMonth:"2026-08",subject:"道の駅あいづ ABC分析表8月分",receivedAt:"2026-09-03T02:53:00Z"});const sales=prepareBrandStoreSales(old,[],[]);assert.equal(old.sourceRowCount,89);assert.equal(sales.salesRows.length,86);assert.equal(old.totalQuantity,4820);assert.equal(old.totalSales,4794260);assert.equal(old.totalCostAmount,3592220);assert.equal(old.totalGrossProfit,1202040);console.log("Real CSV parser-only PASS: 89 source rows / 86 products / 4820 units / 4794260 JPY; no import");}
console.log("Brand store mail parser PASS: CSV UTF-8/SJIS, XLSX all rows, periods, both departments, amounts, identities, authorization, rejection cases");
