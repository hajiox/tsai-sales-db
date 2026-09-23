const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(process.argv[2] || '.env.local'), quiet: true });
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260923080000_bridge_task_model_policy.sql'), 'utf8');
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    // Lock queue writes during the short integrity check, never run/claim a job.
    await client.query('LOCK TABLE web_sales_codex_jobs IN SHARE ROW EXCLUSIVE MODE');
    const snapshot = async () => (await client.query(`SELECT
      md5(string_agg(id::text || status || (parameters - 'model' - 'reasoningEffort')::text, '' ORDER BY id)) business,
      md5(string_agg(id::text || parameters::text, '' ORDER BY id) FILTER (WHERE status NOT IN ('queued','waiting_for_user'))) immutable
      FROM web_sales_codex_jobs`)).rows[0];
    const before = await snapshot();
    const definition = async () => (await client.query("SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) definition")).rows[0].definition;
    const original = await definition();
    await client.query(migration);
    const changed = await definition();
    if (original.replace(/gpt-6-(astra|sol)/g, 'MODEL') !== changed.replace(/gpt-6-(astra|sol)/g, 'MODEL')) throw Error('Non-model claim contract changed');
    if (!changed.includes('gpt-6-sol')) throw Error('Sol capability guards missing');
    const after = await snapshot();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Business inputs, statuses or running/terminal parameters changed');
    await client.query(migration);
    if (await definition() !== changed || JSON.stringify(await snapshot()) !== JSON.stringify(after)) throw Error('Migration is not idempotent');
    const apply = process.argv.includes('--apply');
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ applied: apply, claimGuardsPreserved: true, businessInputsPreserved: true, statusesPreserved: true, runningAndTerminalPreserved: true, idempotent: true }));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
