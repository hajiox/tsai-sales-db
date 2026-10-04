import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import XLSX from "xlsx";
import iconv from "iconv-lite";
import loader from "./food-store-mail-import-loader.cjs";
const { parseFoodStoreMail, isFoodStoreMailReceipt } = loader.load("food-store-mail-import");
const { BrandStoreMailReviewError, isBrandStoreMailAuthorized } = loader.load("brand-store-mail-import");

const headers = ["日付FROM","日付TO","分析内容","店舗ＧＰコード","店舗ＧＰ名","部門コード","部門名","順位","仕入先コード","仕入先名","ＪＡＮ","商品名","単価","点数","金額","値引金額","原価金額","粗利","粗利率","構成比","累計比","ランク"];
const rows = [
  [46266,46295,"点数",1,"テスト店舗",51,"イートイン",1,995,"仕入先","1234567890123","商品A",100,2,200,0,160,40,20,40,40,"A"],
  [46266,46295,"点数",1,"テスト店舗",51,"イートイン",2,995,"仕入先","1234567890123","商品A",100,3,300,5,240,60,20,50,90,"A"],
  [46266,46295,"点数",1,"テスト店舗",52,"テイクアウト",3,995,"仕入先","2234567890123","商品A",150,1,150,0,120,30,20,10,100,"B"],
];
function workbook(matrix) { const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(matrix),"ABC");return XLSX.write(wb,{type:"buffer",bookType:"xlsx"}); }
function envelope(bytes,name="9.1-9.30.xlsx") {return {account:"ts@ai.aizu-tv.com",sender:"keiri@michinoeki-aizu.com",sourceMessageId:"food-abc-test",subject:"道の駅あいづ ABC分析表9月分",reportMonth:"2026-09",receivedAt:"2026-10-03T02:53:00Z",attachmentName:name,attachmentSha256:createHash("sha256").update(bytes).digest("hex"),contentBase64:bytes.toString("base64")};}
function reject(matrix,code) {assert.throws(()=>parseFoodStoreMail(envelope(workbook(matrix))),error=>error instanceof BrandStoreMailReviewError && error.code===code);}
const parsed=parseFoodStoreMail(envelope(workbook([headers,...rows])));
assert.equal(parsed.sourceRowCount,3);assert.equal(parsed.salesRows.length,2,"same names with different JAN remain distinct");
assert.deepEqual([parsed.totalSales,parsed.totalQuantity,parsed.totalCostAmount,parsed.totalGrossProfit],[650,6,520,130]);
assert.deepEqual(parsed.salesRows.map(r=>r.department_code),[51,52]);
assert.equal(parsed.salesRows[0].quantity_sold,5);assert.equal(parsed.salesRows[0].cost_amount,400);assert.equal(parsed.salesRows[0].discount_amount,5);
assert.equal(parsed.salesRows[0].rank,null,"different duplicate source ranks are not invented");assert.equal(parsed.salesRows[1].rank,3);
assert.equal(parsed.salesRows[1].composition_ratio,10);assert.equal(parsed.salesRows[1].rank_category,"B");
assert.equal(parsed.contentSha256,parseFoodStoreMail(envelope(workbook([headers,...rows.toReversed()]))).contentSha256);
let bad=rows.map(r=>[...r]);bad[1][11]="別商品";reject([headers,...bad],"ambiguous_product");
bad=rows.map(r=>[...r]);bad[0][10]="1.234e+12";reject([headers,...bad],"invalid_identity");
bad=rows.map(r=>[...r]);bad[0][10]="000012345678";bad[1][10]="0012345678";reject([headers,...bad],"ambiguous_product");
bad=rows.map(r=>[...r]);bad[0][10]="";reject([headers,...bad],"invalid_identity");
bad=rows.map(r=>[...r]);bad[0][16]=159;reject([headers,...bad],"amount_mismatch");
bad=rows.map(r=>[...r]);bad[0][2]="別帳票";reject([headers,...bad],"invalid_analysis");
bad=rows.map(r=>[...r]);bad[0][8]=994;reject([headers,...bad],"wrong_store");
bad=rows.map(r=>[...r]);bad[0][13]=1.5;reject([headers,...bad],"invalid_number");
const csv=[headers,...rows.map(row=>["2026/9/1","2026/9/30",...row.slice(2)])].map(row=>row.join(",")).join("\r\n");
assert.equal(parseFoodStoreMail(envelope(Buffer.from(csv),"9.1-9.30.csv")).contentSha256,parseFoodStoreMail(envelope(iconv.encode(csv,"shift_jis"),"9.1-9.30.csv")).contentSha256);
const receipt={success:true,status:"imported",destination:"food-store-analysis",destinationTable:"food_store_sales",importId:"test-id",sourceMessageId:parsed.input.sourceMessageId,attachmentSha256:parsed.input.attachmentSha256,contentSha256:parsed.contentSha256,reportMonth:parsed.input.reportMonth,sourceRowCount:parsed.sourceRowCount,rowCount:parsed.salesRows.length,totalSales:parsed.totalSales,totalQuantity:parsed.totalQuantity,totalCostAmount:parsed.totalCostAmount,totalGrossProfit:parsed.totalGrossProfit};
assert.equal(isFoodStoreMailReceipt(receipt,parsed),true);
for(const changed of [{destination:"brand-store-analysis"},{destinationTable:"brand_store_sales"},{destination:undefined},{totalCostAmount:521},{rowCount:3},{contentSha256:"wrong"},{status:"waiting"}])assert.equal(isFoodStoreMailReceipt({...receipt,...changed},parsed),false);
assert.equal(isBrandStoreMailAuthorized(new Request("https://example.test",{headers:{authorization:"Bearer good"}}),"good"),true);
assert.equal(isBrandStoreMailAuthorized(new Request("https://example.test",{headers:{authorization:"Bearer wrong"}}),"good"),false);
assert.equal(isBrandStoreMailAuthorized(new Request("https://example.test"),""),false);
const fixture=process.argv.indexOf("--fixture");
if(fixture>=0){const actual=parseFoodStoreMail(envelope(fs.readFileSync(process.argv[fixture+1])));assert.equal(actual.sourceRowCount,86);assert.equal(actual.salesRows.length,84);assert.deepEqual([actual.totalSales,actual.totalQuantity,actual.totalCostAmount,actual.totalGrossProfit],[4062850,4063,3429541,633309]);assert.equal(new Set(actual.salesRows.map(row=>row.jan_code)).size,84);console.log("Real attachment PASS: every source row accounted for, JAN grouping and all amount totals");}
console.log("Food ABC import PASS: JAN identity, source fields, CSV encoding, totals, unsafe inputs, destination receipt, auth");
