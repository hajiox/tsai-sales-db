// One verified incident only; dry-run by default. Keep historical analysis snapshots.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.join(__dirname,'../.env.local'),quiet:true});
const {Client}=require('pg');
const duplicateId='f2aa8893-0969-4864-8a44-c4a37b1b3303';
const canonical='7teu-i974u-j8m4cq_1/3959305336';
const permalink='https://review.rakuten.co.jp/item/1/408521_10000068/7teu-i974u-j8m4cq_1_3959305336/';
const apply=process.argv.includes('--apply');
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await c.connect();try{
 await c.query('BEGIN');
 const dup=(await c.query('select * from recipe_reviews where id=$1 for update',[duplicateId])).rows[0];
 if(!dup){await c.query('ROLLBACK');console.log('Duplicate is already absent; no changes.');return;}
 assert.equal(dup.channel,'rakuten');assert.equal(dup.product_key,'10000068');assert.equal(dup.external_id,permalink);assert.equal(dup.url,permalink);
 await c.query('select pg_advisory_xact_lock(hashtext($1))',[dup.recipe_id]);
 const kept=(await c.query('select * from recipe_reviews where recipe_id=$1 and channel=$2 and product_key=$3 and external_id=$4 for update',[dup.recipe_id,dup.channel,dup.product_key,canonical])).rows;
 assert.equal(kept.length,1);
 for(const field of ['url','title','body','rating'])assert.deepEqual(dup[field],kept[0][field],`Mismatch: ${field}`);
 assert.equal(String(dup.posted_at),String(kept[0].posted_at));
 const active=await c.query("select id from web_sales_codex_jobs where parameters->>'recipeId'=$1 and task_key in ('recipe_reviews_collect','recipe_reviews_analyze') and status in ('queued','running')",[dup.recipe_id]);
 assert.equal(active.rowCount,0,'Wait for this recipe active jobs');
 const history=(await c.query('select job_id from recipe_review_analyses where recipe_id=$1 and review_ids ? $2',[dup.recipe_id,duplicateId])).rows;
 const recipe=(await c.query('select name from recipes where id=$1',[dup.recipe_id])).rows[0];
 console.log(JSON.stringify({apply,recipe:recipe.name,remove:duplicateId,keep:kept[0].id,historicalAnalyses:history.length}));
 if(!apply){await c.query('ROLLBACK');return;}
 const backup=path.join('C:/作業用/tsa-review-initial-20260921',`duplicate-${duplicateId}.backup.json`);
 if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify({duplicate:dup,retained:kept[0],historicalAnalyses:history},null,2),{flag:'wx'});
 assert.equal((await c.query('delete from recipe_reviews where id=$1',[duplicateId])).rowCount,1);
 const analysis=await c.query("insert into web_sales_codex_jobs(task_key,status,parameters,requested_by,trigger_type,max_attempts,idempotency_key) values('recipe_reviews_analyze','queued',$1,'aizubrandhall@gmail.com','manual',1,$2) returning id",[JSON.stringify({recipeId:dup.recipe_id,recipeName:recipe.name,protocol:'1',model:'gpt-6-astra',reasoningEffort:'medium'}),'reviews-dedupe:'+duplicateId]);
 await c.query("insert into web_sales_codex_job_events(job_id,event_type,message,progress) values($1,'review_duplicate_reconciled',$2,100)",[dup.source_job_id,`公式パーマリンク・原文・見出し・星・日付が一致した重複1件を既存IDへ統合。新しい分析ジョブ ${analysis.rows[0].id} を予約。過去の根拠スナップショットは保持。`]);
 await c.query('COMMIT');console.log(JSON.stringify({repaired:1,analysisJob:analysis.rows[0].id}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
