// Uses synthetic fixtures only. Every fixture and DDL change is rolled back by default.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const { Client } = require('pg');
const migrationPath = path.join(root, 'supabase/migrations/20261011130000_business_operations.sql');
async function verify(db) {
  const row = (await db.query("select has_function_privilege('anon','public.tsa_business_operation_v1(text,text,jsonb)','execute') anon_rpc,has_function_privilege('authenticated','public.tsa_business_operation_v1(text,text,jsonb)','execute') authenticated_rpc,has_function_privilege('service_role','public.tsa_business_operation_v1(text,text,jsonb)','execute') service_rpc,has_table_privilege('service_role','public.business_operation_runs','update') service_update,has_table_privilege('anon','public.business_operation_runs','select') anon_read")).rows[0];
  assert.deepEqual(row, { anon_rpc: false, authenticated_rpc: false, service_rpc: true, service_update: false, anon_read: false });
  const metadata = (await db.query("select public.tsa_business_metadata('jan_codes') data")).rows[0].data;
  assert.equal(metadata.writable, false);
  assert.ok(metadata.fields.every(field => !field.creatable && !field.writable));
  assert.equal((await db.query("select 'business_operation_runs'=any(public.tsa_business_tables()) exposed")).rows[0].exposed, false);
}
async function fixtures(db) {
  const hash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
  const otherHash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
  const payload = { operation: 'synthetic_operation', idempotencyKey: `synthetic-${crypto.randomUUID()}`, inputHash: 'a'.repeat(64) };
  const connectionId = (await db.query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by) values('__synthetic_operations__',$1,array['business:full'],now()+interval '1 hour','fixture') returning id", [hash])).rows[0].id;
  await db.query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by) values('__synthetic_other_operations__',$1,array['business:full'],now()+interval '1 hour','fixture')", [otherHash]);
  const call = async (action, input, tokenHash = hash) => (await db.query('select public.tsa_business_operation_v1($1,$2,$3::jsonb) data', [tokenHash, action, JSON.stringify(input)])).rows[0].data;
  let savepoint = 0, checks = 0;
  const denied = async (fn, code) => {
    const name = `operation_fixture_${++savepoint}`;
    await db.query(`savepoint ${name}`);
    let message; try { await fn(); } catch (error) { message = error.message; }
    await db.query(`rollback to savepoint ${name}`); await db.query(`release savepoint ${name}`);
    assert.equal(message, code); checks++;
  };
  assert.equal((await call('authorize', {})).actor, `data-access:${connectionId}`);
  const claimed = await call('claim', payload);
  assert.equal(claimed.claimed, true);
  const id = claimed.operation.operationId;
  assert.equal((await call('claim', payload)).claimed, false);
  assert.equal((await call('claim', payload)).operation.state, 'running');
  await denied(() => call('claim', { ...payload, inputHash: 'b'.repeat(64) }), 'DA_IDEMPOTENCY_CONFLICT');
  await denied(() => call('claim', { ...payload, operation: 'different_operation' }), 'DA_IDEMPOTENCY_CONFLICT');
  await denied(() => call('status', { operationId: id }, otherHash), 'DA_NOT_FOUND');
  assert.equal((await call('status', { idempotencyKey: payload.idempotencyKey })).operation.operationId, id);
  await call('finish', { operationId: id, state: 'unknown', result: { status: 'unconfirmed' } });
  assert.equal((await call('claim', payload)).operation.state, 'unknown');
  assert.equal((await call('finish', { operationId: id, state: 'completed', result: {} })).operation.state, 'unknown', 'Uncertain writes cannot later be replayed or relabelled');
  await denied(() => db.query("update public.business_operation_runs set input_hash=repeat('c',64) where id=$1", [id]), 'DA_CONFLICT');
  await denied(() => db.query('delete from public.business_operation_runs where id=$1', [id]), 'DA_INVALID_INPUT');
  await db.query("update public.data_access_connections set scopes=array['recipes:read'] where id=$1", [connectionId]);
  await denied(() => call('authorize', {}), 'DA_FORBIDDEN');
  await db.query("update public.data_access_connections set scopes=array['business:full'],resource_ids='{\"recipes\":[]}'::jsonb where id=$1", [connectionId]);
  await denied(() => call('authorize', {}), 'DA_FORBIDDEN');
  await db.query("update public.data_access_connections set resource_ids='{}'::jsonb,expires_at=now()-interval '1 second' where id=$1", [connectionId]);
  await denied(() => call('status', { operationId: id }), 'DA_UNAUTHORIZED');
  await db.query("update public.data_access_connections set expires_at=now()+interval '1 hour',revoked_at=now() where id=$1", [connectionId]);
  await denied(() => call('authorize', {}), 'DA_UNAUTHORIZED');
  return { denialChecks: checks };
}
async function main() {
  if (process.argv.includes('--apply')) throw new Error('This verification script always rolls back. Apply the reviewed migration through the deployment workflow.');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('begin'); await db.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
    await db.query(fs.readFileSync(migrationPath, 'utf8')); await verify(db);
    const result = await fixtures(db);
    await db.query(fs.readFileSync(migrationPath, 'utf8')); await verify(db);
    await db.query('rollback');
    console.log(JSON.stringify({ dryRun: true, rolledBack: true, migrationIdempotent: true, ...result }));
  } catch (error) { await db.query('rollback').catch(() => {}); throw error; }
  finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { migrationPath, verify, fixtures };
