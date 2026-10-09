const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {randomUUID,createHash}=require('node:crypto');const {Client}=require('pg');
const {migrationPath:baseMigration,verify,fixtures}=require('./apply-data-access-migration.cjs');
const migrationPath=path.join(__dirname,'../supabase/migrations/20261009120000_data_access_no_approval.sql');
const signature='public.tsa_data_access_v1(text,text,jsonb)';
async function verifyPolicy(db){
 const source=(await db.query('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
 assert(!source.includes('DA_APPROVAL_REQUIRED'));assert(source.includes("'requiresApproval',false"));
 assert(source.includes('perform public.tsa_data_access_validate_values(resource,plan.operation,plan.values)'));
 return {...await verify(db),perChangeApproval:false};
}
async function legacyFixture(db){
 const tokenHash=createHash('sha256').update(randomUUID()).digest('hex');
 const connection=(await db.query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by) values('rollback legacy approval fixture',$1,$2,now()+interval '1 hour','test') returning id",[tokenHash,['recipes:read','recipes:write']])).rows[0].id;
 const call=async(action,input)=>(await db.query('select public.tsa_data_access_v1($1,$2,$3::jsonb) result',[tokenHash,action,JSON.stringify(input)])).rows[0].result;
 const values={name:`__no_approval_${randomUUID()}`,category:'OEM'};
 const input={resource:'recipes',operation:'create',values,idempotencyKey:'legacy-pending-001'};
 const plan=await call('prepare',input);assert.equal(plan.requiresApproval,true);
 const rejected=await call('prepare',{...input,values:{...values,name:values.name+'_rejected'},idempotencyKey:'legacy-rejected-001'});
 await db.query('select public.tsa_data_access_review_plan($1,$2,$3)',[rejected.id,'reject','fixture']);
 const expired=await call('prepare',{...input,values:{...values,name:values.name+'_expired'},idempotencyKey:'legacy-expired-001'});
 // Fixtures use a connection expiry to check revocation; plan expiry is verified from the unchanged SQL below.
 await db.query(fs.readFileSync(migrationPath,'utf8'));
 const replay=await call('prepare',input);assert.equal(replay.id,plan.id);assert.equal(replay.requiresApproval,false);
 const applied=await call('apply',{id:plan.id});assert.equal(applied.status,'applied');assert.deepEqual(await call('apply',{id:plan.id}),applied);
 const stored=(await db.query('select requires_approval,approved_by from public.data_access_changes where id=$1',[plan.id])).rows[0];assert.equal(stored.requires_approval,true);assert.equal(stored.approved_by,null);
 let savepoint=0;const denied=async(run,message)=>{const name=`legacy_denial_${savepoint++}`;await db.query(`savepoint ${name}`);try{await run();assert.fail('Expected rejection');}catch(e){assert.equal(e.message,message);}finally{await db.query(`rollback to savepoint ${name}`);await db.query(`release savepoint ${name}`);}};
 await denied(()=>call('apply',{id:rejected.id}),'DA_REJECTED');
 await db.query("update public.data_access_connections set expires_at=now()-interval '1 second' where id=$1",[connection]);
 await denied(()=>call('apply',{id:expired.id}),'DA_UNAUTHORIZED');
 return {legacyPendingApplied:true,legacyReplayNoApproval:true,noFabricatedApproval:true,rejectedPreserved:true,expiredConnectionDenied:true};
}
async function main(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL not configured');
 const db=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=disable')?undefined:{rejectUnauthorized:false}});await db.connect();
 try{
  await db.query('begin');await db.query("set local lock_timeout='10s'");
  if(process.argv.includes('--apply')){
   const backupIndex=process.argv.indexOf('--backup-dir');if(backupIndex<0||!process.argv[backupIndex+1])throw Error('--backup-dir required');
   const backupDir=path.resolve(process.argv[backupIndex+1]);assert(fs.statSync(backupDir).isDirectory());
   const previous=(await db.query('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
   assert(previous.includes('DA_APPROVAL_REQUIRED')||previous.includes('Registration and permitted updates use connection authorization'),'Unexpected live function');
   fs.writeFileSync(path.join(backupDir,'tsa-data-access-v1-before.sql'),previous,{flag:'wx',mode:0o600});
   await db.query(fs.readFileSync(migrationPath,'utf8'));const result=await verifyPolicy(db);await db.query('commit');console.log(JSON.stringify({applied:true,...result}));
  }else{
   await db.query(fs.readFileSync(baseMigration,'utf8'));const legacy=await legacyFixture(db);const result=await verifyPolicy(db);const checks=await fixtures(db,{approvalRequired:false});
   await db.query(fs.readFileSync(migrationPath,'utf8'));await verifyPolicy(db);
   await db.query('rollback');console.log(JSON.stringify({dryRun:true,rolledBack:true,...result,...checks,...legacy,migrationIdempotent:true}));
  }
 }catch(e){await db.query('rollback').catch(()=>{});throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
