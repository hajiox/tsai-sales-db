const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const migrationPath = path.join(__dirname, '../supabase/migrations/20260907183000_bridge_astra_medium.sql');
async function verify(client) {
  const { rows } = await client.query("SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) AS definition");
  const definition = rows[0].definition;
  const required = ['gpt-6-astra', 'recipeSnsProtocolVersion', 'recipeSnsPublishProtocolVersion', 'docScannerFaxSummaryProtocolVersion', 'ingredientLabelAiProtocolVersion'];
  for (const token of required) {
    if (!definition.includes(token)) throw new Error(`Missing preserved claim contract: ${token}`);
  }
  if (/gpt-5\.6-(sol|luna)/.test(definition)) throw new Error('Legacy model claim contract remains');
  for (const key of ['ingredientLabelAiReasoningEffort', 'docScannerFaxSummaryReasoningEffort']) {
    if (!definition.includes(`'${key}' = 'medium'`) && !definition.includes(`'${key}'::text) = 'medium'::text`)) {
      throw new Error(`Medium claim contract missing: ${key}`);
    }
  }
  return { astra: true, medium: true, protocolGuardsPreserved: true };
}
async function main() {
  require('dotenv').config({ path: path.resolve(process.argv[2] || '.env.local'), quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const apply = process.argv.includes('--apply');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(migrationPath, 'utf8'));
    const checks = await verify(client);
    // Run twice to verify the migration is idempotent.
    await client.query(fs.readFileSync(migrationPath, 'utf8'));
    await verify(client);
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ applied: apply, ...checks }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { migrationPath, verify };
