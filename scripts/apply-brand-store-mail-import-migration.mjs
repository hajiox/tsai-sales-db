import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import { parseBrandStoreMail, prepareBrandStoreSales } from "../lib/brand-store-mail-import.ts";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
dotenv.config({path:path.join(root,".env.local"),quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const apply=process.argv.includes("--apply");
const rpc = async payload => (await db.query("select public.import_brand_store_mail($1::jsonb) as receipt",[JSON.stringify(payload)])).rows[0].receipt;
async function rejected(payload, code){ await db.query("SAVEPOINT expected_failure");try{await rpc(payload);assert.fail(`Expected ${code}`);}catch(error){assert.match(error.message,new RegExp(`ABC_REVIEW:${code}`));}finally{await db.query("ROLLBACK TO SAVEPOINT expected_failure");await db.query("RELEASE SAVEPOINT expected_failure");}}
try{
  await db.connect();await db.query("BEGIN");
  await db.query(fs.readFileSync(path.join(root,"supabase/migrations/20261003090000_brand_store_mail_import.sql"),"utf8"));
  const rights=await db.query("select has_table_privilege('anon','public.brand_store_mail_imports','SELECT') as anon,has_table_privilege('authenticated','public.brand_store_mail_import_sources','INSERT') as authenticated,has_function_privilege('anon','public.import_brand_store_mail(jsonb)','EXECUTE') as anon_function,has_function_privilege('service_role','public.import_brand_store_mail(jsonb)','EXECUTE') as service_function");
  assert.deepEqual(rights.rows[0],{anon:false,authenticated:false,anon_function:false,service_function:true});
  const rls=await db.query("select relrowsecurity from pg_class where oid in ('public.brand_store_mail_imports'::regclass,'public.brand_store_mail_import_sources'::regclass)");assert.equal(rls.rows.length,2);assert.ok(rls.rows.every(row=>row.relrowsecurity));
  if(!apply){
    let payload;
    const fixture=process.argv.indexOf("--fixture");
    if(fixture>=0){
      const bytes=fs.readFileSync(process.argv[fixture+1]);const input={account:"ts@ai.aizu-tv.com",sender:"keiri@michinoeki-aizu.com",sourceMessageId:"rollback-real-attachment",subject:"道の駅あいづ　ABC分析表9月分",reportMonth:"2026-09",receivedAt:"2026-10-03T02:53:00Z",attachmentName:"9.1-9.30.xlsx",attachmentSha256:createHash("sha256").update(bytes).digest("hex"),contentBase64:bytes.toString("base64")};
      const parsed=parseBrandStoreMail(input),prepared=prepareBrandStoreSales(parsed,[],[]);
      payload={...input,contentBase64:undefined,salesRows:prepared.salesRows,sourceRows:parsed.sourceRows,contentSha256:parsed.contentSha256,sourceRowCount:parsed.sourceRowCount,totalSales:parsed.totalSales,totalQuantity:parsed.totalQuantity,totalGrossProfit:parsed.totalGrossProfit,totalCostAmount:parsed.totalCostAmount,unmatchedProductCount:prepared.unmatchedProductCount};
    }else{
      const rows=[{product_name:"ROLLBACK_TEST_A",category:"イートイン",tax_type:null,total_sales:100,sales_ratio:40,gross_profit:20,gross_profit_ratio:20,quantity_sold:1,quantity_ratio:50,returned_quantity:0,return_ratio:0,product_id:null,product_code:null,barcode:null},{product_name:"ROLLBACK_TEST_B",category:"テイクアウト",tax_type:null,total_sales:150,sales_ratio:60,gross_profit:30,gross_profit_ratio:20,quantity_sold:1,quantity_ratio:50,returned_quantity:0,return_ratio:0,product_id:null,product_code:null,barcode:null}];
      payload={account:"ts@ai.aizu-tv.com",sender:"keiri@michinoeki-aizu.com",sourceMessageId:"rollback-synthetic",attachmentName:"1.1-1.31.csv",attachmentSha256:"a".repeat(64),contentSha256:"b".repeat(64),receivedAt:"2099-02-01T00:00:00Z",reportMonth:"2099-01",salesRows:rows,sourceRows:rows.map(row=>({productName:row.product_name,totalSales:row.total_sales,quantitySold:row.quantity_sold,grossProfit:row.gross_profit,costAmount:row.total_sales-row.gross_profit})),sourceRowCount:2,totalSales:250,totalQuantity:2,totalGrossProfit:50,totalCostAmount:200,unmatchedProductCount:2};
    }
    const month=payload.reportMonth+"-01";
    assert.equal(Number((await db.query("select count(*) as count from brand_store_sales where report_month=$1",[month])).rows[0].count),0,"fixture month already has data; dry run must not replace it");
    const first=await rpc(payload);assert.equal(first.status,"imported");assert.equal(first.rowCount,payload.salesRows.length);assert.equal(first.sourceRowCount,payload.sourceRowCount);assert.equal(first.totalSales,payload.totalSales);assert.equal(first.totalQuantity,payload.totalQuantity);
    const repeat=await rpc(payload);assert.equal(repeat.status,"already_imported");assert.equal(repeat.importId,first.importId);
    const resend=await rpc({...payload,sourceMessageId:payload.sourceMessageId+"-resend",attachmentSha256:"c".repeat(64)});assert.equal(resend.importId,first.importId);assert.equal(resend.status,"already_imported");
    if(fixture<0){const secondMonth=await rpc({...payload,reportMonth:"2099-02",attachmentName:"2.1-2.28.csv",attachmentSha256:"f".repeat(64)});assert.equal(secondMonth.status,"imported");assert.notEqual(secondMonth.importId,first.importId,"one email can contain two different months");}
    await rejected({...payload,attachmentSha256:"d".repeat(64)},"source_hash_conflict");
    await rejected({...payload,sourceMessageId:payload.sourceMessageId+"-changed",contentSha256:"e".repeat(64)},"month_content_conflict");
    await rejected({...payload,totalSales:payload.totalSales+1},"amount_mismatch");
    await db.query("SAVEPOINT altered_dataset");
    const [a,b]=payload.salesRows;await db.query("update brand_store_sales set total_sales=case product_name when $2 then $4 when $3 then $5 else total_sales end where report_month=$1",[month,a.product_name,b.product_name,b.total_sales,a.total_sales]);
    await rejected(payload,"stored_dataset_changed");await db.query("ROLLBACK TO SAVEPOINT altered_dataset");await db.query("RELEASE SAVEPOINT altered_dataset");
    await db.query("SAVEPOINT rollback_atomic");
    await db.query("delete from brand_store_sales where report_month=$1",[month]);
    await rejected(payload,"stored_dataset_changed");await db.query("ROLLBACK TO SAVEPOINT rollback_atomic");await db.query("RELEASE SAVEPOINT rollback_atomic");
    assert.equal((await rpc(payload)).importId,first.importId);
    console.log("Mail import RPC dry run PASS: all rows/totals, repeat/resend, hash conflict, exact dataset changes, permissions, atomic rollback");
  }
  await db.query(apply?"COMMIT":"ROLLBACK");console.log(apply?"Brand store mail migration applied; RLS and privileges verified":"Migration and fixture rolled back; no production rows imported");
}catch(error){await db.query("ROLLBACK").catch(()=>{});console.error(error.message);process.exitCode=1;}finally{await db.end().catch(()=>{});}
