// Apply only after the JWT-enabled browser application is deployed.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { verifyReadBoundary } = require('./verify-data-access-read-boundary.cjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Use the rollback dry-run script first; actual apply requires --apply.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('begin');
    await db.query(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261007153000_data_access_read_boundary.sql'), 'utf8'));
    const verification = await verifyReadBoundary(db);
    await db.query("notify pgrst, 'reload schema'");
    await db.query('commit');
    console.log(JSON.stringify({ applied: true, businessRowsChanged: 0, ...verification }));
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
