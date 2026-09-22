const fs=require('node:fs'),assert=require('node:assert/strict');require('dotenv').config({path:'.env.local',quiet:true});const {Client}=require('pg');
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await c.connect();try{await c.query('BEGIN');await c.query(fs.readFileSync('supabase/migrations/20260922090000_recipe_review_batches.sql','utf8'));
const rights=(await c.query("select has_table_privilege('anon','recipe_review_batches','SELECT') anon,has_function_privilege('authenticated','enqueue_recipe_review_batch(text,jsonb)','EXECUTE') authenticated,has_function_privilege('service_role','enqueue_recipe_review_batch(text,jsonb)','EXECUTE') service")).rows[0];assert(!rights.anon&&!rights.authenticated&&rights.service);
if(!process.argv.includes('--apply')){
 const recipes=(await c.query("select id from recipes where category='ネット専用' order by id limit 2")).rows;
 const targets=[{recipeId:recipes[0].id,sources:[{channel:'rakuten',productKey:'10000013',name:'Rollback only',url:'https://review.rakuten.co.jp/'}],reason:null},{recipeId:recipes[1].id,sources:[],reason:'紐付けなし'}];
 const invoke=async()=> (await c.query('select enqueue_recipe_review_batch($1,$2) id',['batch-rollback-test',JSON.stringify(targets)])).rows[0].id;
 const first=await invoke();assert.equal(first,await invoke());const batch=(await c.query('select entries from recipe_review_batches where id=$1',[first])).rows[0];assert.equal(batch.entries.length,2);assert(batch.entries[0].jobId);assert.equal(batch.entries[1].jobId,null);
 const jobs=(await c.query("select count(*)::int n from web_sales_codex_jobs where parameters->>'batchId'=$1",[first])).rows[0];assert.equal(jobs.n,1);
 await c.query('ROLLBACK');console.log('PASS rollback: atomic enqueue, duplicate click reuse, missing mapping, service-only access');
}else{await c.query('COMMIT');console.log('Batch migration applied; service-only access verified');}
}catch(e){await c.query('ROLLBACK');throw e}finally{await c.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
