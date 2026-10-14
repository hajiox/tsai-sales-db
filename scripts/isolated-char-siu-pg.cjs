'use strict';
// Isolated regression infrastructure. Never reads env/config/production credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { Client } = require('../node_modules/pg');
const REPO = path.resolve(__dirname, '..');
const PG = 'C:/Program Files/PostgreSQL/17/bin';
const OLD = [
  '20260802_char_siu_production_cost.sql', '20260802_char_siu_production_sources.sql',
  '20260803_char_siu_delivery_note_intake.sql', '20260803_char_siu_sugar_and_minced_output.sql',
  '202610140001_char_siu_packaging_date.sql', '202610140002_char_siu_stage_labor.sql',
];
function native(program, args) {
  try { execFileSync(path.join(PG, program), args, { windowsHide: true, stdio: 'ignore', timeout: 25000 }); return ''; }
  catch (error) { throw new Error(`Isolated PostgreSQL ${program} failed (exit ${error.status ?? 'unknown'}).`); }
}
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
module.exports = async function isolatedCharSiuPg(filename, test) {
  if (!/^\d{8,14}_char_siu_[a-z_]+\.sql$/.test(filename) || typeof test !== 'function') throw new Error('Fixed migration filename and fixture callback required.');
  const artifactRoot = path.join(REPO, '.vercel');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const fixtureRoot = path.join(artifactRoot, `char-siu-staff-pg-${crypto.randomUUID()}`);
  fs.mkdirSync(fixtureRoot, { recursive: false });
  const dataDir = path.join(fixtureRoot, 'data'), port = await availablePort();
  const config = { host: '127.0.0.1', port, user: 'fixture_owner', database: 'postgres', password: '', connectionTimeoutMillis: 5000 };
  let client, started = false;
  try {
    native('initdb.exe', ['-D', dataDir, '-U', 'fixture_owner', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--locale=C']);
    native('pg_ctl.exe', ['start', '-D', dataDir, '-w', '-t', '15', '-l', path.join(fixtureRoot, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -F`]);
    started = true;
    client = new Client(config); await client.connect();
    await client.query("SET statement_timeout='10000ms'; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.ingredients (id uuid PRIMARY KEY); CREATE TABLE public.recipes (id uuid PRIMARY KEY); CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);");
    for (const file of OLD) await client.query(fs.readFileSync(path.join(REPO, 'supabase', 'migrations', file), 'utf8'));
    const legacy = (await client.query("INSERT INTO public.char_siu_production_runs(production_date,packaging_date,worker_count,work_hours,hourly_wage,total_person_hours,material_cost,labor_cost,total_cost,notes) VALUES('2026-10-13','2026-10-14',3,3.25,1200,9.75,150,11700,11850,'isolated legacy fixture') RETURNING id,to_jsonb(char_siu_production_runs) AS snapshot")).rows[0];
    const boundarySql = `SELECT c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') AS anon_select,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('char_siu_production_runs','char_siu_production_settings','char_siu_production_materials','char_siu_production_outputs','char_siu_delivery_note_scans') ORDER BY c.relname`;
    const oldBoundary = (await client.query(boundarySql)).rows;
    // Simulate Supabase default grants; new tables must explicitly remove these grants.
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role,anon,authenticated;');
    const migration = fs.readFileSync(path.join(REPO, 'supabase', 'migrations', filename), 'utf8');
    try { await client.query(migration); await client.query(migration); }
    catch (error) { const offset=Number(error.position||0); const line=offset?migration.slice(0,offset).split('\n').length:0; throw new Error(`Migration fixture error ${error.code}: ${error.message}; line=${line}; context=${error.where||''}`); }
    assert.deepEqual((await client.query('SELECT to_jsonb(r) AS snapshot FROM public.char_siu_production_runs r WHERE id=$1', [legacy.id])).rows[0].snapshot, legacy.snapshot, 'New staff schema must not change a legacy run.');
    assert.deepEqual((await client.query(boundarySql)).rows, oldBoundary, 'Existing RLS and grants must remain unchanged.');
    const result = await test(client, { config, fixtureRoot, legacyId: legacy.id, newClient: async () => { const connection = new Client(config); await connection.connect(); await connection.query("SET statement_timeout='10000ms'"); return connection; } });
    assert.deepEqual((await client.query('SELECT to_jsonb(r) AS snapshot FROM public.char_siu_production_runs r WHERE id=$1', [legacy.id])).rows[0].snapshot, legacy.snapshot, 'Fixture operations must not mutate the legacy snapshot.');
    const report = { isolated: true, productionConnected: false, postgresVersion: 17, migration: filename, migrationSha256: crypto.createHash('sha256').update(migration).digest('hex'), migrationAppliedTwice: true, legacySnapshotPreserved: true, existingRlsAndGrantsPreserved: true, ...result, fixtureRoot };
    fs.writeFileSync(path.join(fixtureRoot, 'result.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return report;
  } finally {
    if (client) await client.end().catch(() => {});
    if (started || fs.existsSync(path.join(dataDir, 'postmaster.pid'))) {
      native('pg_ctl.exe', ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '15']);
      if (fs.existsSync(path.join(dataDir, 'postmaster.pid'))) throw new Error('Isolated PostgreSQL shutdown was not confirmed.');
      process.stdout.write(`${JSON.stringify({ isolatedPostgresStopped: true, fixtureRoot })}\n`);
    }
  }
};
