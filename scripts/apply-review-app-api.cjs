const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
require('dotenv').config({path:'.env.local',quiet:true});const {Client}=require('pg');
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await c.connect();try{
 await c.query('BEGIN');await c.query(fs.readFileSync('supabase/migrations/20260923090000_recipe_review_app_api.sql','utf8'));
 const rights=(await c.query("select has_table_privilege('anon','recipe_review_app_imports','SELECT') a,has_function_privilege('authenticated','save_recipe_review_app_import(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb)','EXECUTE') b,has_function_privilege('service_role','save_recipe_review_app_import(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb)','EXECUTE') c")).rows[0];assert(!rights.a&&!rights.b&&rights.c);
 if(process.argv.includes('--apply')){await c.query('COMMIT');console.log('Applied direct-review API migration; service-only privileges verified');return;}
 const recipe=(await c.query("select id from recipes r where category='ネット専用' and not exists(select 1 from web_sales_codex_jobs j where j.parameters->>'recipeId'=r.id::text and j.status in ('queued','running')) limit 1")).rows[0].id;
 const root=randomUUID(),request=randomUUID(),parameters={recipeId:recipe,sources:[{channel:'amazon',productKey:'B012345678'}]};
 await c.query("insert into web_sales_codex_jobs(id,task_key,status,parameters) values($1,'recipe_reviews_collect','waiting_for_user',$2)",[root,parameters]);
 const revision=async()=>(await c.query('select id,collected_at::text from recipe_reviews where recipe_id=$1 order by id',[recipe])).rows;
 const payload={rows:[{channel:'amazon',product_key:'B012345678',external_id:request,url:'https://www.amazon.co.jp/gp/customer-reviews/'+request,rating:5,title:'rollback test',body:'rollback only',posted_at:null}],result:{status:'completed',sources:[]}};
 const save=async(req,kind,expected,data,hash,rev)=>(await c.query('select save_recipe_review_app_import($1,$2,$3,$4,$5,$6,$7,$8) id',[root,req,kind,expected,parameters,data,hash,JSON.stringify(rev)])).rows[0].id;
 const reject=async(fn,pattern)=>{await c.query('SAVEPOINT bad');await assert.rejects(fn,pattern);await c.query('ROLLBACK TO SAVEPOINT bad');};
 const rev=await revision(),hash='a'.repeat(64);
 await reject(()=>save(request,'collection',randomUUID(),payload,hash,rev),/direct_collection_changed/);
 const active=randomUUID();await c.query("insert into web_sales_codex_jobs(id,task_key,status,parameters) values($1,'recipe_reviews_analyze','queued',$2)",[active,{recipeId:recipe}]);
 await reject(()=>save(request,'collection',null,payload,hash,rev),/direct_active_job/);await c.query('delete from web_sales_codex_jobs where id=$1',[active]);
 const audit=await save(request,'collection',null,payload,hash,rev);assert.equal(await save(request,'collection',null,payload,hash,rev),audit);
 await reject(()=>save(request,'collection',null,payload,'b'.repeat(64),rev),/direct_request_conflict/);
 assert.equal((await c.query("select count(*)::int n from web_sales_codex_jobs where parameters->>'directRootJobId'=$1 and status in ('queued','running')",[root])).rows[0].n,0);
 assert.equal((await c.query('select status from web_sales_codex_jobs where id=$1',[root])).rows[0].status,'waiting_for_user');
 await reject(()=>save(randomUUID(),'analysis',audit,{result:{},model:'test',sourceHash:hash,reviewIds:[]},hash,rev),/direct_reviews_changed/);
 const analysis=await save(randomUUID(),'analysis',audit,{result:{scopes:[]},model:'test',sourceHash:hash,reviewIds:[]},hash,await revision());
 assert.equal((await c.query('select count(*)::int n from recipe_review_analyses where job_id=$1',[analysis])).rows[0].n,1);
 assert.equal((await c.query("select parameters->>'directAnalysisPending' pending from web_sales_codex_jobs where id=$1",[audit])).rows[0].pending,'false');
 assert((await c.query("select pg_get_functiondef('claim_web_sales_codex_job(text,integer)'::regprocedure) d")).rows[0].d.includes("IS DISTINCT FROM 'codex_app'"));
 await c.query('ROLLBACK');console.log('PASS rollback: RLS, atomic import, replay, conflict, active job, stale analysis, no queue, preserved root');
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
