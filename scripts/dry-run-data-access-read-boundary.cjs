const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { TABLES, verifyReadBoundary } = require('./verify-data-access-read-boundary.cjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
const ident = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
async function snapshot(client) {
  const result = await client.query(
    "select c.relname,c.relacl::text,c.relrowsecurity,coalesce((select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname),'[]'::jsonb) policies from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) order by c.relname", [TABLES]);
  const fn = await client.query("select proacl::text,pg_get_functiondef(oid) definition from pg_proc where oid='public.get_web_sales_monthly(text,text)'::regprocedure");
  return JSON.stringify({ tables: result.rows, function: fn.rows });
}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let report;
  try {
    const before = await snapshot(client);
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '20s'");
      await client.query(fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261007153000_data_access_read_boundary.sql'), 'utf8'));
      report = await verifyReadBoundary(client);
      const policies = await client.query("select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename=any($1)", [TABLES]);
      assert.equal(policies.rows.filter(row => row.policyname === 'data_access_admin_scope' && row.permissive === 'RESTRICTIVE').length, 7);
      assert.ok(policies.rows.filter(row => row.policyname === 'data_access_admin_scope').every(row => row.qual.includes('aizubrandhall@gmail.com') && row.with_check.includes('aizubrandhall@gmail.com')));
      const fn = await client.query("select prosrc,proconfig,has_function_privilege('service_role',oid,'execute') service_execute,has_function_privilege('authenticated',oid,'execute') authenticated_execute from pg_proc where oid='public.get_web_sales_monthly(text,text)'::regprocedure");
      assert.ok(fn.rows[0].service_execute && fn.rows[0].authenticated_execute);
      assert.ok(fn.rows[0].prosrc.includes("coalesce(auth.jwt()->>'role', '') <> 'service_role'"));
      assert.ok(fn.rows[0].prosrc.includes("coalesce(lower(auth.jwt()->>'email'), '') <> 'aizubrandhall@gmail.com'"));
      assert.deepEqual(fn.rows[0].proconfig, ['search_path=public, pg_temp']);

      // Only synthetic temporary records are read/updated: never application rows.
      let fixtures = '';
      for (const table of TABLES) {
        const fixture = 'rls_test_' + table;
        fixtures += 'CREATE TEMP TABLE ' + ident(fixture) + '(id int primary key,value text); INSERT INTO ' + ident(fixture) + " VALUES(1,'synthetic'); ALTER TABLE " + ident(fixture) + ' ENABLE ROW LEVEL SECURITY; GRANT SELECT,UPDATE ON ' + ident(fixture) + ' TO authenticated;';
        for (const policy of policies.rows.filter(row => row.tablename === table)) {
          const roles = typeof policy.roles === 'string' ? policy.roles.slice(1,-1).split(',') : policy.roles;
          fixtures += 'CREATE POLICY ' + ident(policy.policyname) + ' ON ' + ident(fixture) + ' AS ' + policy.permissive + ' FOR ' + policy.cmd + ' TO ' + roles.map(ident).join(',') + (policy.qual ? ' USING (' + policy.qual + ')' : '') + (policy.with_check ? ' WITH CHECK (' + policy.with_check + ')' : '') + ';';
        }
      }
      await client.query(fixtures);
      const tempSchema = await client.query("select nspname from pg_namespace where oid=pg_my_temp_schema()");
      await client.query('GRANT USAGE ON SCHEMA ' + ident(tempSchema.rows[0].nspname) + ' TO authenticated');
      for (const email of ['other@example.test', 'aizubrandhall@gmail.com', 'AIZUBRANDHALL@GMAIL.COM']) {
        await client.query('SET LOCAL ROLE authenticated');
        await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: 'authenticated', email })]);
        const batch = TABLES.map(table => 'SELECT ' + literal(table) + ' AS table_name,count(*)::int AS count FROM ' + ident('rls_test_' + table) + '; UPDATE ' + ident('rls_test_' + table) + " SET value='synthetic-updated' WHERE id=1 RETURNING id;").join('');
        const results = await client.query(batch);
        for (let i = 0; i < TABLES.length; i++) {
          const expected = email.toLowerCase() === 'aizubrandhall@gmail.com' && TABLES[i] !== 'recipe_reviews' ? 1 : 0;
          assert.equal(results[i * 2].rows[0].count, expected, 'Effective RLS SELECT: ' + TABLES[i]);
          assert.equal(results[i * 2 + 1].rowCount, expected, 'Effective RLS UPDATE: ' + TABLES[i]);
        }
        await client.query('RESET ROLE');
      }
      // Authenticated non-admin RPC is denied before it can read application data.
      await client.query('SAVEPOINT denied_rpc; SET LOCAL ROLE authenticated');
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: 'authenticated', email: 'other@example.test' })]);
      await assert.rejects(client.query("select * from public.get_web_sales_monthly('2000-01-01','2000-02-01')"), error => error.code === '42501');
      await client.query('ROLLBACK TO SAVEPOINT denied_rpc; RESET ROLE');
      // Even planning an anonymous raw SELECT must fail, with no application row reads.
      await client.query('SAVEPOINT denied_anon; SET LOCAL ROLE anon');
      await assert.rejects(client.query('SELECT id FROM public.recipes LIMIT 0'), error => error.code === '42501');
      await client.query('ROLLBACK TO SAVEPOINT denied_anon; RESET ROLE');
      // Existing admin JWT has no sub; all 6 browser table queries still plan successfully.
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: 'authenticated', email: 'aizubrandhall@gmail.com' })]);
      await client.query(TABLES.filter(table => table !== 'recipe_reviews').map(table => 'SELECT id FROM public.' + ident(table) + ' LIMIT 0;').join(''));
      await client.query('RESET ROLE');
      report = { ...report, syntheticRlsSelectAndUpdate: 'admin allowed; other email denied; no sub required', anonymousPlanningDenied: true, nonAdminRpcDenied: true };
    } finally {
      await client.query('ROLLBACK');
    }
    assert.equal(await snapshot(client), before, 'All original ACLs, policies and RPC definition must be restored');
    console.log(JSON.stringify({ ...report, rollbackVerified: true, businessRowsChanged: 0 }));
  } finally {
    await client.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
