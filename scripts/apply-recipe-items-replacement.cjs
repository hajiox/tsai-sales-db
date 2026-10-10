const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('pg');
const root = path.join(__dirname, '..');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const migrationPath = path.join(root, 'supabase/migrations/20261010150000_recipe_items_replacement.sql');
const signature = 'public.tsa_recipe_items_replace_v1(text,text,jsonb)';

async function verify(db) {
  const grants = (await db.query("select has_function_privilege('anon',$1,'EXECUTE') anon_rpc,has_function_privilege('authenticated',$1,'EXECUTE') authenticated_rpc,has_function_privilege('service_role',$1,'EXECUTE') service_rpc,has_table_privilege('anon','public.recipe_items_replacement_changes','SELECT') anon_plans,has_table_privilege('authenticated','public.recipe_items_replacement_audit','SELECT') authenticated_audit,has_table_privilege('service_role','public.recipe_items_replacement_changes','UPDATE') service_update", [signature])).rows[0];
  if (grants.anon_rpc || grants.authenticated_rpc || !grants.service_rpc || grants.anon_plans || grants.authenticated_audit || grants.service_update) throw Error('Replacement access grants differ from the contract');
  const security = (await db.query("select count(*)::int n from pg_class where oid in ('public.recipe_items_replacement_changes'::regclass,'public.recipe_items_replacement_audit'::regclass) and relrowsecurity")).rows[0];
  if (security.n !== 2) throw Error('Replacement RLS is incomplete');
  const triggers = (await db.query("select count(*)::int n from pg_trigger where not tgisinternal and tgname in ('recipe_items_replacement_changes_immutable','recipe_items_replacement_audit_immutable')")).rows[0];
  if (triggers.n !== 2) throw Error('Replacement immutability is incomplete');
  return { publicPrivilegesClosed: true, rlsEnabled: true, immutablePlansAndAudit: true };
}
async function main() {
  if (!process.argv.includes('--apply')) return require('./test-recipe-items-replacement-migration.cjs').main();
  const index = process.argv.indexOf('--backup-dir');
  if (index < 0 || !process.argv[index + 1]) throw Error('--backup-dir is required; use an existing protected directory outside the checkout');
  const backupDir = path.resolve(process.argv[index + 1]);
  const relative = path.relative(root, backupDir);
  if (!fs.statSync(backupDir).isDirectory() || relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw Error('Use a protected backup directory outside the checkout');
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL not configured');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='10s'; set local statement_timeout='60s'");
    const previous = await db.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('tsa_recipe_items_immutable_plan','tsa_recipe_items_snapshot','tsa_recipe_items_normalize','tsa_recipe_items_replace_v1')");
    const tables = await db.query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('recipe_items_replacement_changes','recipe_items_replacement_audit')");
    const source = fs.readFileSync(migrationPath, 'utf8');
    fs.writeFileSync(path.join(backupDir, 'recipe-items-replacement-before.json'), JSON.stringify({ recordedAt: new Date().toISOString(), migrationSha256: createHash('sha256').update(source).digest('hex'), functions: previous.rows, tables: tables.rows }, null, 2), { flag: 'wx', mode: 0o600 });
    await db.query(source);
    const result = await verify(db);
    await db.query('commit');
    console.log(JSON.stringify({ applied: true, businessDataChanged: false, ...result }));
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  } finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error('Recipe-items replacement migration failed:', error.message); process.exitCode = 1; });
module.exports = { migrationPath, verify };
