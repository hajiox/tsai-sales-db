// Production smoke test: creates one short-lived read-only connection, never business data.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
if (process.env.TSA_VERIFY_PRODUCTION !== '1') throw new Error('Set TSA_VERIFY_PRODUCTION=1 to run the read-only production smoke test.');
const origin = 'https://v0-tsa-19.vercel.app';
const mcpDir = path.join(root, 'tools', 'tsa-data-mcp');
const resolveMcp = createRequire(path.join(mcpDir, 'package.json'));
const { Client } = await import(pathToFileURL(resolveMcp.resolve('@modelcontextprotocol/client')).href);
const { StdioClientTransport } = await import(pathToFileURL(resolveMcp.resolve('@modelcontextprotocol/client/stdio')).href);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = new Client({ name: 'tsa-data-production-verification', version: '1.1.0' });
let connectionId;
let connected = false;
const payload = result => result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
await db.connect();
try {
  const record = (await db.query('select id from public.recipes order by id limit 1')).rows[0];
  assert.ok(record, 'A recipe is needed for the read-only smoke test.');
  const token = `tsa_data_${randomBytes(32).toString('base64url')}`;
  connectionId = (await db.query(`insert into public.data_access_connections(label,token_hash,scopes,resource_ids,max_limit,expires_at,created_by)
    values('本番接続検証（読取専用・自動停止）',$1,$2,$3::jsonb,1,now()+interval '15 minutes','deployment verification') returning id`,
  [createHash('sha256').update(token).digest('hex'), ['recipes:read'], JSON.stringify({ recipes: [record.id] })])).rows[0].id;
  // The adapter receives no DB, deployment, browser or application administrator credentials.
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'LOCALAPPDATA'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(mcpDir, 'server.mjs')], cwd: mcpDir,
    env: { ...env, TSA_DATA_API_URL: origin, TSA_DATA_API_TOKEN: token }, stderr: 'pipe' });
  await client.connect(transport);
  connected = true;
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 21, 'Unexpected MCP tool list.');
  assert.equal(client.getServerVersion().version, '1.1.0', 'Unexpected MCP adapter version.');
  const businessCatalog = payload(await client.callTool({ name: 'tsa_business_catalog', arguments: {} }));
  assert.ok(!businessCatalog.ok && businessCatalog.error.code === 'FORBIDDEN', 'Limited connection unexpectedly accessed the full business catalog.');
  const read = payload(await client.callTool({ name: 'tsa_search_recipes', arguments: { limit: 100 } }));
  assert.ok(read.ok && read.data.items.length === 1 && read.data.items[0].id === record.id, 'Scoped read failed.');
  const detail = payload(await client.callTool({ name: 'tsa_get_recipe', arguments: { id: record.id } }));
  assert.ok(detail.ok && /^[a-f0-9]{32}$/.test(detail.data.items[0]._version), 'Versioned detail failed.');
  const other = payload(await client.callTool({ name: 'tsa_get_recipe', arguments: { id: randomUUID() } }));
  assert.ok(!other.ok && other.error.code === 'FORBIDDEN', 'Record restriction failed.');
  const forbidden = payload(await client.callTool({ name: 'tsa_search_ingredients', arguments: {} }));
  assert.ok(!forbidden.ok && forbidden.error.code === 'FORBIDDEN', 'Resource restriction failed.');
  const write = payload(await client.callTool({ name: 'tsa_prepare_recipe_change', arguments: {
    operation: 'update', id: record.id, expectedVersion: detail.data.items[0]._version,
    idempotencyKey: `readonly-denial-${randomUUID()}`, values: { manufacturing_notes: 'Must never be written.' },
  } }));
  assert.ok(!write.ok && write.error.code === 'FORBIDDEN', 'Read-only write denial failed.');
  const plans = (await db.query('select count(*)::int n from public.data_access_changes where connection_id=$1', [connectionId])).rows[0].n;
  assert.equal(plans, 0, 'The read-only verification unexpectedly prepared a change.');
  await db.query('update public.data_access_connections set revoked_at=now() where id=$1', [connectionId]);
  const revoked = payload(await client.callTool({ name: 'tsa_search_recipes', arguments: {} }));
  assert.ok(!revoked.ok && revoked.error.code === 'UNAUTHORIZED', 'Immediate revocation failed.');
  for (const [pathname, method] of [['/api/data-access/connections', 'GET'], ['/api/recipe', 'GET'], ['/api/web-sales-period', 'POST']]) {
    const response = await fetch(origin + pathname, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
      ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}) });
    assert.equal(response.status, 401, 'Anonymous legacy access was not rejected.');
  }
  console.log(JSON.stringify({ production: true, mcpHandshake: true, tools: 21, adapterVersion: '1.1.0', scopedRead: true, versionedDetail: true,
    recordRestriction: true, resourceRestriction: true, limitedBusinessCatalogDenied: true, readOnlyWriteDenied: true, preparedChanges: 0, immediateRevocation: true, anonymousLegacyAccessDenied: true }));
} finally {
  try {
    if (connectionId) await db.query('update public.data_access_connections set revoked_at=coalesce(revoked_at,now()) where id=$1', [connectionId]);
  } finally {
    try { if (connected) await client.close(); }
    finally { await db.end(); }
  }
}
