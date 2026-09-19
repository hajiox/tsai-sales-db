const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260919090000_web_sales_abcd.sql'), 'utf8'));
    const result = await db.query("select relname, relrowsecurity from pg_class where oid in ('public.web_sales_abcd_snapshots'::regclass,'public.web_sales_abcd_actions'::regclass)");
    if (result.rows.length !== 2 || result.rows.some(r => !r.relrowsecurity)) throw new Error('RLS verification failed');
    const access = await db.query("select has_table_privilege('anon','public.web_sales_abcd_snapshots','SELECT') as anon, has_table_privilege('authenticated','public.web_sales_abcd_snapshots','INSERT') as authenticated, has_table_privilege('service_role','public.web_sales_abcd_snapshots','INSERT') as service");
    if (access.rows[0].anon || access.rows[0].authenticated || !access.rows[0].service) throw new Error('Access verification failed');
    await db.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
    console.log(process.argv.includes('--apply') ? 'ABCD migration applied; RLS and privileges verified.' : 'ABCD migration dry run passed; rolled back.');
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
