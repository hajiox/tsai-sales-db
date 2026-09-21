const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260921090000_recipe_reviews.sql'), 'utf8'));
    const result = await db.query("select relname, relrowsecurity from pg_class where oid in ('public.recipe_reviews'::regclass,'public.recipe_review_sources'::regclass,'public.recipe_review_analyses'::regclass,'public.recipe_review_collections'::regclass)");
    if (result.rows.length !== 4 || result.rows.some(r => !r.relrowsecurity)) throw new Error('RLS verification failed');
    const access = await db.query("select has_table_privilege('anon','public.recipe_reviews','SELECT') as anon, has_table_privilege('authenticated','public.recipe_reviews','INSERT') as authenticated, has_table_privilege('service_role','public.recipe_reviews','INSERT') as service");
    if (access.rows[0].anon || access.rows[0].authenticated || !access.rows[0].service) throw new Error('Access verification failed');
    await db.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
    console.log(process.argv.includes('--apply') ? 'Reviews migration applied; RLS and privileges verified.' : 'Reviews migration dry run passed; rolled back.');
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
