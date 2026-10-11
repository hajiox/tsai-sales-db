// Reviewed schema only. No existing connection, key, business data or job is changed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const root = path.join(__dirname, '..');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const files = ['20261011130000_business_operations.sql', '20261011151000_business_finance_coverage.sql'];
async function main() {
  const apply = process.argv.includes('--apply');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
    for (const file of files) await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
    await require('./test-business-operations-migration.cjs').verify(db);
    const resources = (await db.query('select public.tsa_business_tables() resources')).rows[0].resources;
    assert.equal(resources.length, 152);
    assert.ok(resources.includes('rakuten_search_request_histories'));
    const metadata = (await db.query('select public.tsa_business_metadata(resource) data from unnest(public.tsa_business_tables()) resource')).rows.map(row => row.data);
    const writable = metadata.filter(resource => resource.writable).length;
    assert.equal(writable, 132);
    await db.query(apply ? 'commit' : 'rollback');
    console.log(JSON.stringify({ applied: apply, rolledBack: !apply, migrations: files.length, resources: resources.length, writable, readOnly: resources.length - writable, existingConnectionsUnchanged: true, jobsUnchanged: true }));
  } catch (error) {
    await db.query('rollback').catch(() => {});
    // DB messages may contain values. Publish only the fixed error category.
    console.error('BUSINESS_OPERATIONS_MIGRATION_FAILED');
    if (error?.code && /^[A-Z0-9_]{1,30}$/.test(error.code)) console.error(error.code);
    process.exitCode = 1;
  } finally { await db.end(); }
}
main();
