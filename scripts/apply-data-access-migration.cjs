const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261007150000_data_access.sql');

async function verify(client) {
  const tables = await client.query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)", [['data_access_connections','data_access_changes','data_access_audit']]);
  assert.equal(tables.rows.length, 3);
  assert.ok(tables.rows.every(row => row.relrowsecurity));
  const acl = await client.query("select has_function_privilege('anon','public.tsa_data_access_v1(text,text,jsonb)','execute') anon_rpc,has_function_privilege('authenticated','public.tsa_data_access_v1(text,text,jsonb)','execute') authenticated_rpc,has_function_privilege('service_role','public.tsa_data_access_v1(text,text,jsonb)','execute') service_rpc,has_table_privilege('anon','public.data_access_connections','select') anon_tokens,has_table_privilege('authenticated','public.data_access_changes','select') authenticated_plans");
  assert.deepEqual(acl.rows[0], { anon_rpc:false, authenticated_rpc:false, service_rpc:true, anon_tokens:false, authenticated_plans:false });
  return { tables:3, rlsEnabled:true, publicPrivilegesClosed:true };
}
async function fixtures(client, { approvalRequired = true } = {}) {
  assert.equal((await client.query("select public.tsa_data_access_name_key($1) value",['　ＡＢＣ　 商品　'])).rows[0].value,'abc 商品');
  const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
  const id = randomUUID(), recipeId = randomUUID();
  const connection = (await client.query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by,max_limit) values('rollback fixture',$1,$2,now()+interval '1 hour','test',1) returning id",[tokenHash,['recipes:read','recipes:write','ingredients:read','ingredients:write','materials:read','materials:write','expenses:read','expenses:write','sales:read','reviews:read']])).rows[0].id;
  await client.query("insert into public.ingredients(id,name,unit_quantity,price,product_description) values($1,$2,100,12,'before')",[id,`__data_access_test_${id}`]);
  await client.query("insert into public.recipes(id,name,category) values($1,$2,'OEM')",[recipeId,`__data_access_test_${recipeId}`]);
  const itemId = randomUUID();
  await client.query("insert into public.recipe_items(id,recipe_id,item_type,item_name,ingredient_id) values($1,$2,'ingredient',$3,$4)",[itemId,recipeId,`__data_access_test_${id}`,id]);
  const call = async (action,payload,hash=tokenHash) => (await client.query('select public.tsa_data_access_v1($1,$2,$3::jsonb) result',[hash,action,JSON.stringify(payload)])).rows[0].result;
  let savepoint=0;
  const denied = async (run,code) => {
    const name=`denial_${savepoint++}`; await client.query(`savepoint ${name}`);
    try { await run(); assert.fail(`expected ${code}`); } catch(error) { assert.equal(error.message,code); } finally { await client.query(`rollback to savepoint ${name}`); await client.query(`release savepoint ${name}`); }
  };
  await denied(()=>call('read',{resource:'ingredients'},'f'.repeat(64)),'DA_UNAUTHORIZED');
  const initial = await call('read',{resource:'ingredients',id});
  assert.equal(initial.items[0].product_description,'before'); assert.match(initial.items[0]._version,/^[a-f0-9]{32}$/);
  const detail = await call('read',{resource:'recipes',id:recipeId}); assert.equal(detail.items[0].recipe_items.length,1);
  const readLimit = await call('read',{resource:'ingredients',limit:100}); assert.equal(readLimit.items.length,1); assert.ok(readLimit.nextCursor);
  await denied(()=>call('prepare',{resource:'ingredients',operation:'update',id,expectedVersion:initial.items[0]._version,values:{price:999},idempotencyKey:'test-forbidden-price'}),'DA_INVALID_INPUT');
  const input={resource:'ingredients',operation:'update',id,expectedVersion:initial.items[0]._version,values:{product_description:'after'},idempotencyKey:'test-normal-update'};
  const plan=await call('prepare',input); assert.equal(plan.requiresApproval,false);
  assert.equal((await call('prepare',input)).id,plan.id);
  await denied(()=>call('prepare',{...input,values:{product_description:'different'}}),'DA_IDEMPOTENCY_CONFLICT');
  await denied(()=>call('apply',{id:plan.id,values:{product_description:'replaced'}}),'DA_INVALID_INPUT');
  const applied=await call('apply',{id:plan.id}); assert.equal(applied.record.product_description,'after');
  assert.deepEqual(await call('apply',{id:plan.id}),applied);
  assert.equal((await client.query('select count(*)::int n from public.data_access_audit where change_id=$1',[plan.id])).rows[0].n,1);
  await denied(()=>client.query('update public.data_access_audit set actor=$1 where change_id=$2',['tampered',plan.id]),'DA_INVALID_INPUT');
  await denied(()=>client.query('delete from public.data_access_audit where change_id=$1',[plan.id]),'DA_INVALID_INPUT');
  const next=await call('read',{resource:'ingredients',id});
  const stale=await call('prepare',{...input,expectedVersion:next.items[0]._version,idempotencyKey:'test-stale-update',values:{product_description:'stale'}});
  await client.query("update public.ingredients set product_description='concurrent' where id=$1",[id]);
  await denied(()=>call('apply',{id:stale.id}),'DA_CONFLICT');
  const create=await call('prepare',{resource:'ingredients',operation:'create',values:{name:`__data_access_created_${id}`,unit_quantity:250,price:75,tax_included:true},idempotencyKey:'test-new-registration'});
  assert.equal(create.requiresApproval,approvalRequired);
  if (approvalRequired) {
    await denied(()=>call('apply',{id:create.id}),'DA_APPROVAL_REQUIRED');
    await client.query('select public.tsa_data_access_review_plan($1,$2,$3)',[create.id,'approve','test admin']);
  }
  const created=await call('apply',{id:create.id}); assert.equal(created.record.unit_quantity,250); assert.equal(created.record.price,75);
  // Stable master identity drives related name synchronization, with an audit snapshot of both sides.
  const forRename=await call('read',{resource:'ingredients',id});
  const rename=await call('prepare',{...input,expectedVersion:forRename.items[0]._version,idempotencyKey:'test-sensitive-name',values:{name:`__data_access_renamed_${id}`}});
  assert.equal(rename.requiresApproval,approvalRequired);
  if (approvalRequired) {
    await denied(()=>call('apply',{id:rename.id}),'DA_APPROVAL_REQUIRED');
    await client.query('select public.tsa_data_access_review_plan($1,$2,$3)',[rename.id,'approve','test admin']);
  }
  await call('apply',{id:rename.id});
  const changedDetail=await call('read',{resource:'recipes',id:recipeId});
  assert.equal(changedDetail.items[0].recipe_items[0].item_name,`__data_access_renamed_${id}`);
  assert.notEqual(changedDetail.items[0]._version,detail.items[0]._version);
  const relatedAudit=(await client.query('select related_before,related_after from public.data_access_audit where change_id=$1',[rename.id])).rows[0];
  assert.equal(relatedAudit.related_before.length,1); assert.equal(relatedAudit.related_after.length,1);
  for(const resource of ['recipes','materials','expenses']) {
    const values=resource==='recipes'?{name:`__data_access_${resource}_${id}`,category:'OEM',manufacturing_notes:'fixture'}:resource==='materials'?{name:`__data_access_${resource}_${id}`,unit_quantity:'100枚',price:50,tax_included:true}:{name:`__data_access_${resource}_${id}`,unit_quantity:1,unit_price:2,tax_included:false};
    const createPlan=await call('prepare',{resource,operation:'create',values,idempotencyKey:`test-create-${resource}`});
    assert.equal(createPlan.requiresApproval,approvalRequired);
    if (approvalRequired) await client.query('select public.tsa_data_access_review_plan($1,$2,$3)',[createPlan.id,'approve','test admin']);
    const newRecord=(await call('apply',{id:createPlan.id})).record;
    const field=resource==='recipes'?'manufacturing_notes':'notes';
    const updatePlan=await call('prepare',{resource,operation:'update',id:newRecord.id,expectedVersion:newRecord._version,values:{[field]:'normal metadata'},idempotencyKey:`test-update-${resource}`});
    assert.equal(updatePlan.requiresApproval,false);assert.equal((await call('apply',{id:updatePlan.id})).record[field],'normal metadata');
  }
  const scopedHash=createHash('sha256').update(randomUUID()).digest('hex');
  await client.query("insert into public.data_access_connections(label,token_hash,scopes,resource_ids,expires_at,created_by) values('scoped fixture',$1,$2,$3::jsonb,now()+interval '1 hour','test')",[scopedHash,['recipes:read'],JSON.stringify({recipes:[recipeId]})]);
  const scoped=await call('read',{resource:'recipes'},scopedHash); assert.deepEqual(scoped.items.map(row=>row.id),[recipeId]);
  await denied(()=>call('apply',{id:plan.id},scopedHash),'DA_NOT_FOUND');
  await denied(()=>call('read',{resource:'ingredients',id},scopedHash),'DA_FORBIDDEN');
  await denied(()=>call('read',{resource:'recipes',id:randomUUID()},scopedHash),'DA_FORBIDDEN');
  // An audit failure must roll the data change and plan status back in the same transaction.
  const current=await call('read',{resource:'ingredients',id});
  const atomic=await call('prepare',{...input,expectedVersion:current.items[0]._version,idempotencyKey:'test-atomic-audit',values:{product_description:'must-roll-back'}});
  await client.query("create function pg_temp.fail_data_access_audit() returns trigger language plpgsql as $$begin raise exception 'fixture_audit_failure'; end$$");
  await client.query('create trigger fixture_audit_failure before insert on public.data_access_audit for each row execute function pg_temp.fail_data_access_audit()');
  await denied(()=>call('apply',{id:atomic.id}),'fixture_audit_failure');
  assert.equal((await call('read',{resource:'ingredients',id})).items[0].product_description,'concurrent');
  assert.equal((await client.query('select status from public.data_access_changes where id=$1',[atomic.id])).rows[0].status,'pending');
  await client.query('drop trigger fixture_audit_failure on public.data_access_audit');
  await denied(()=>client.query("update public.data_access_changes set values='{}'::jsonb where id=$1",[atomic.id]),'DA_INVALID_INPUT');
  await client.query('update public.data_access_connections set revoked_at=now() where id=$1',[connection]);
  await denied(()=>call('apply',{id:atomic.id}),'DA_UNAUTHORIZED');
  return { authDenial:true, scopedReads:true, resultLimit:true, normalUpdate:true, registration:true, requiresApproval:approvalRequired, allFourWriteDomains:true, immutablePlans:true, immutableAudit:true, relatedNameAudit:true, staleConflict:true, idempotency:true, auditAtomicity:true, revocation:true };
}
async function main() {
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=disable')?undefined:{rejectUnauthorized:false}});
  await client.connect();
  try {
    await client.query('begin'); await client.query(fs.readFileSync(migrationPath,'utf8'));
    const verification=await verify(client);
    if(process.argv.includes('--apply')) { await client.query('commit'); console.log(JSON.stringify({applied:true,...verification})); }
    else { const checks=await fixtures(client); await client.query('rollback'); console.log(JSON.stringify({dryRun:true,rolledBack:true,...verification,...checks})); }
  } catch(error) { await client.query('rollback').catch(()=>{}); throw error; }
  finally { await client.end(); }
}
if(require.main===module) main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1});
module.exports={migrationPath,verify,fixtures};
