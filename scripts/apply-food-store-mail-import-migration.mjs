import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import loader from "./food-store-mail-import-loader.cjs";
const { parseFoodStoreMail } = loader.load("food-store-mail-import");

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
dotenv.config({path:path.join(root,".env.local"),quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const apply=process.argv.includes("--apply");
const rpc=async payload=>(await db.query("select public.import_food_store_mail($1::jsonb) as receipt",[JSON.stringify(payload)])).rows[0].receipt;
async function rejected(payload,code){await db.query("SAVEPOINT expected_failure");try{await rpc(payload);assert.fail(`Expected ${code}`);}catch(error){assert.match(error.message,new RegExp(`ABC_REVIEW:${code}`));}finally{await db.query("ROLLBACK TO SAVEPOINT expected_failure");await db.query("RELEASE SAVEPOINT expected_failure");}}
try {
  await db.connect();await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'");
  await db.query(fs.readFileSync(path.join(root,"supabase/migrations/20261004090000_food_store_mail_import.sql"),"utf8"));
  const rights=await db.query("select has_table_privilege('anon','public.food_store_mail_imports','SELECT') as anon,has_table_privilege('authenticated','public.food_store_mail_import_sources','INSERT') as authenticated,has_function_privilege('anon','public.import_food_store_mail(jsonb)','EXECUTE') as anon_function,has_function_privilege('service_role','public.import_food_store_mail(jsonb)','EXECUTE') as service_function");
  assert.deepEqual(rights.rows[0],{anon:false,authenticated:false,anon_function:false,service_function:true});
  const rls=await db.query("select relrowsecurity from pg_class where oid in ('public.food_store_mail_imports'::regclass,'public.food_store_mail_import_sources'::regclass)");assert.equal(rls.rows.length,2);assert.ok(rls.rows.every(row=>row.relrowsecurity));
  if (!apply) {
    let payload, syntheticCategory;
    const fixture=process.argv.indexOf("--fixture");
    if(fixture>=0){
      const bytes=fs.readFileSync(process.argv[fixture+1]);
      const input={account:"ts@ai.aizu-tv.com",sender:"keiri@michinoeki-aizu.com",sourceMessageId:"rollback-food-real",subject:"道の駅あいづ ABC分析表9月分",reportMonth:"2026-09",receivedAt:"2026-10-03T02:53:00Z",attachmentName:"9.1-9.30.xlsx",attachmentSha256:createHash("sha256").update(bytes).digest("hex"),contentBase64:bytes.toString("base64")};
      const parsed=parseFoodStoreMail(input);
      payload={...input,contentBase64:undefined,destination:"food-store-analysis",destinationTable:"food_store_sales",salesRows:parsed.salesRows,sourceRows:parsed.sourceRows,contentSha256:parsed.contentSha256,sourceRowCount:parsed.sourceRowCount,totalSales:parsed.totalSales,totalQuantity:parsed.totalQuantity,totalGrossProfit:parsed.totalGrossProfit,totalCostAmount:parsed.totalCostAmount};
    }else{
      const janA="9988776611223",janB="9988776611224";
      assert.equal(Number((await db.query("select count(*) count from food_product_master where jan_code in ($1,$2)",[janA,janB])).rows[0].count),0,"synthetic JAN already exists");
      syntheticCategory=(await db.query("insert into food_category_master(category_id,category_name) values(gen_random_uuid(),'ROLLBACK FOOD ABC CATEGORY') returning category_id")).rows[0].category_id;
      await db.query("insert into food_product_master(jan_code,product_name,category_id,custom_gross_profit_rate) values($1,'KEEP EXISTING MASTER NAME',$2,17.25)",[janA,syntheticCategory]);
      const common={supplier_code:995,supplier_name:"ROLLBACK",department_code:51,department_name:"食分析",rank:1,unit_price:100,discount_amount:0,cost_amount:80,gross_profit:20,gross_profit_rate:20,composition_ratio:40,cumulative_ratio:40,rank_category:"A",category_id:null};
      const salesRows=[{...common,jan_code:janA,product_name:"SAME TEST NAME",quantity_sold:1,total_sales:100},{...common,jan_code:janB,product_name:"SAME TEST NAME",quantity_sold:2,total_sales:200,cost_amount:160,gross_profit:40,rank:2,composition_ratio:60,cumulative_ratio:100}];
      payload={account:"ts@ai.aizu-tv.com",sender:"keiri@michinoeki-aizu.com",sourceMessageId:"rollback-food-synthetic",attachmentName:"1.1-1.31.csv",attachmentSha256:"a".repeat(64),contentSha256:"b".repeat(64),receivedAt:"2099-02-01T00:00:00Z",reportMonth:"2099-01",destination:"food-store-analysis",destinationTable:"food_store_sales",salesRows,sourceRows:salesRows,sourceRowCount:2,totalSales:300,totalQuantity:3,totalGrossProfit:60,totalCostAmount:240};
    }
    const month=payload.reportMonth+"-01";
    assert.equal(Number((await db.query("select count(*) count from food_store_sales where report_month=$1",[month])).rows[0].count),0,"fixture month already has data; never replace it");
    const brandBaseline=(await db.query("select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) as rows from brand_store_sales s where report_month=$1",[month])).rows[0].rows;
    await rejected({...payload,destination:"brand-store-analysis"},"invalid_request");
    const first=await rpc(payload);assert.equal(first.status,"imported");assert.equal(first.destination,"food-store-analysis");assert.equal(first.destinationTable,"food_store_sales");assert.equal(first.rowCount,payload.salesRows.length);assert.equal(first.sourceRowCount,payload.sourceRowCount);
    for(const [field,expected] of [["totalSales",payload.totalSales],["totalQuantity",payload.totalQuantity],["totalCostAmount",payload.totalCostAmount],["totalGrossProfit",payload.totalGrossProfit]])assert.equal(first[field],expected);
    const saved=(await db.query("select sales_rows,source_rows from food_store_mail_imports where id=$1",[first.importId])).rows[0];assert.deepEqual(saved.source_rows,payload.sourceRows);
    const foodRows=(await db.query("select coalesce(jsonb_agg(to_jsonb(s)-'id'-'report_month'-'created_at' order by jan_code),'[]'::jsonb) as rows from food_store_sales s where report_month=$1",[month])).rows[0].rows;
    assert.deepEqual(foodRows,saved.sales_rows);
    if(syntheticCategory){assert.equal(foodRows[0].category_id,syntheticCategory);assert.equal(foodRows[1].category_id,null);const master=(await db.query("select product_name,category_id,custom_gross_profit_rate from food_product_master where jan_code=$1",[payload.salesRows[0].jan_code])).rows[0];assert.deepEqual(master,{product_name:"KEEP EXISTING MASTER NAME",category_id:syntheticCategory,custom_gross_profit_rate:"17.25"});assert.equal(first.unmatchedProductCount,1);}
    const repeat=await rpc(payload);assert.equal(repeat.status,"already_imported");assert.equal(repeat.importId,first.importId);
    const resend=await rpc({...payload,sourceMessageId:payload.sourceMessageId+"-resend",attachmentSha256:"c".repeat(64)});assert.equal(resend.importId,first.importId);assert.equal(resend.status,"already_imported");
    await rejected({...payload,attachmentSha256:"d".repeat(64)},"source_hash_conflict");
    await rejected({...payload,sourceMessageId:payload.sourceMessageId+"-changed",contentSha256:"e".repeat(64)},"month_content_conflict");
    await rejected({...payload,totalCostAmount:payload.totalCostAmount+1},"amount_mismatch");
    const moved=payload.salesRows.map((row,index)=>({...row,total_sales:row.total_sales+(index===0?1:index===1?-1:0),gross_profit:row.gross_profit+(index===0?1:index===1?-1:0)}));
    await rejected({...payload,salesRows:moved},"amount_mismatch");
    await db.query("SAVEPOINT altered_dataset");
    await db.query("update food_store_sales set department_name='ALTERED' where report_month=$1 and jan_code=$2",[month,payload.salesRows[0].jan_code]);
    await rejected(payload,"stored_dataset_changed");await db.query("ROLLBACK TO SAVEPOINT altered_dataset");await db.query("RELEASE SAVEPOINT altered_dataset");
    await db.query("SAVEPOINT removed_dataset");await db.query("delete from food_store_sales where report_month=$1",[month]);
    await rejected(payload,"stored_dataset_changed");await db.query("ROLLBACK TO SAVEPOINT removed_dataset");await db.query("RELEASE SAVEPOINT removed_dataset");
    assert.equal((await rpc(payload)).importId,first.importId);
    assert.deepEqual((await db.query("select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) as rows from brand_store_sales s where report_month=$1",[month])).rows[0].rows,brandBaseline,"retail-store month unchanged");
    console.log("Food mail RPC dry run PASS: explicit destination, exact source/live rows, JAN mapping, all totals, repeat/resend, conflict/alteration rejection, atomicity, unchanged retail month, permissions");
  }
  await db.query(apply?"COMMIT":"ROLLBACK");console.log(apply?"Food mail migration applied; RLS/privileges verified":"Migration and test data rolled back; no production rows imported");
}catch(error){await db.query("ROLLBACK").catch(()=>{});console.error(error.message);process.exitCode=1;}finally{await db.end().catch(()=>{});}
