// Production smoke test: creates one short-lived synthetic connection, reads only
// business data, and changes/revokes only that connection's permission metadata.
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
const client = new Client({ name: 'tsa-data-production-verification', version: '1.3.0' });
let connectionId;
let connected = false;
const payload = result => result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
const diagnostic = result => JSON.stringify({
  ok: typeof result?.ok === 'boolean' ? result.ok : null,
  code: /^[A-Z_]{1,64}$/.test(result?.error?.code ?? '') ? result.error.code : null,
  requestId: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result?.requestId ?? '') ? result.requestId : null,
});
await db.connect();
try {
  const record = (await db.query('select id from public.recipes order by id limit 1')).rows[0];
  assert.ok(record, 'A recipe is needed for the read-only smoke test.');
  const janCandidates = (await db.query("select id,jan_code from public.jan_codes where jan_code~'^[0-9]{13}$' order by id limit 20")).rows;
  const janRecord = janCandidates.find(row => {
    const sum = [...row.jan_code.slice(0,12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return Number(row.jan_code[12]) === (10 - sum % 10) % 10;
  });
  assert.ok(janRecord, 'A registered valid JAN is needed for the read-only export smoke test.');
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
  assert.equal(tools.tools.length, 29, 'Unexpected MCP tool list.');
  assert.equal(client.getServerVersion().version, '1.3.0', 'Unexpected MCP adapter version.');
  const businessCatalog = payload(await client.callTool({ name: 'tsa_business_catalog', arguments: {} }));
  assert.ok(!businessCatalog.ok && businessCatalog.error.code === 'FORBIDDEN', 'Limited connection unexpectedly accessed the full business catalog.');
  const limitedComposition = payload(await client.callTool({ name: 'tsa_get_recipe_items', arguments: { recipeId: record.id } }));
  assert.ok(!limitedComposition.ok && limitedComposition.error?.code === 'FORBIDDEN', `Limited composition denial failed: ${diagnostic(limitedComposition)}`);
  const limitedJanList = payload(await client.callTool({ name: 'tsa_list_jan_codes', arguments: {} }));
  assert.ok(!limitedJanList.ok && limitedJanList.error?.code === 'FORBIDDEN', `Limited JAN list denial failed: ${diagnostic(limitedJanList)}`);
  const limitedJanExport = payload(await client.callTool({ name: 'tsa_export_barcode', arguments: { janId: janRecord.id, format: 'svg' } }));
  assert.ok(!limitedJanExport.ok && limitedJanExport.error?.code === 'FORBIDDEN', `Limited JAN export denial failed: ${diagnostic(limitedJanExport)}`);
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
  // Exercise the new transport with the same synthetic key. No real connection
  // or recipe/item is changed, and the full capability never leaves this process.
  await db.query("update public.data_access_connections set scopes=array['recipes:read','business:full']::text[],resource_ids='{}'::jsonb where id=$1", [connectionId]);
  const composition = payload(await client.callTool({ name: 'tsa_get_recipe_items', arguments: { recipeId: record.id } }));
  assert.ok(composition.ok && composition.data.recipeId === record.id && composition.data.recipe?.id === record.id,
    `Whole-composition read failed for the explicitly full synthetic connection: ${diagnostic(composition)}`);
  assert.ok(Array.isArray(composition.data.items) && composition.data.items.every(item => item.recipe_id === record.id), 'Whole-composition rows do not belong to the selected recipe.');
  assert.ok(/^[a-f0-9]{32}$/.test(composition.data._version), 'Whole-composition version failed.');
  const replacementPlans = (await db.query('select count(*)::int n from public.recipe_items_replacement_changes where connection_id=$1', [connectionId])).rows[0].n;
  assert.equal(replacementPlans, 0, 'The read-only verification unexpectedly prepared a composition replacement.');
  const janList = payload(await client.callTool({ name: 'tsa_list_jan_codes', arguments: { query: janRecord.jan_code, limit: 1 } }));
  assert.ok(janList.ok && janList.data.items[0]?.id === janRecord.id && /^[a-f0-9]{32}$/.test(janList.data.items[0]._version), `JAN read failed: ${diagnostic(janList)}`);
  assert.ok(Array.isArray(janList.data.items[0].recipes), 'JAN recipe assignments missing.');
  for (const format of ['svg', 'eps', 'png']) {
    const exported = await client.callTool({ name: 'tsa_export_barcode', arguments: { janId: janRecord.id, format } });
    const result = payload(exported);
    assert.ok(result.ok && result.data.janCode === janRecord.jan_code, `JAN export failed: ${diagnostic(result)}`);
    const file = result.data.file;
    assert.equal(file.filename, `barcode_${janRecord.jan_code}.${format}`);
    if (format === 'png') {
      assert.equal(file.encoding, 'base64'); assert.equal(file.mimeType, 'image/png');
      assert.equal(Buffer.from(file.content, 'base64').subarray(0,8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(exported.content.some(item => item.type === 'image' && item.mimeType === 'image/png'));
    } else {
      assert.equal(file.encoding, 'utf8');
      assert.ok(file.content.startsWith(format === 'svg' ? '<svg' : '%!PS-Adobe-3.0 EPSF-3.0'));
      assert.ok(file.content.includes(janRecord.jan_code));
    }
  }
  const janOperations = (await db.query('select count(*)::int n from public.jan_code_operations where connection_id=$1', [connectionId])).rows[0].n;
  assert.equal(janOperations, 0, 'Read-only verification unexpectedly issued, assigned, or updated a JAN.');
  await db.query('update public.data_access_connections set revoked_at=now() where id=$1', [connectionId]);
  const revoked = payload(await client.callTool({ name: 'tsa_search_recipes', arguments: {} }));
  assert.ok(!revoked.ok && revoked.error.code === 'UNAUTHORIZED', 'Immediate revocation failed.');
  const revokedComposition = payload(await client.callTool({ name: 'tsa_get_recipe_items', arguments: { recipeId: record.id } }));
  assert.ok(!revokedComposition.ok && revokedComposition.error?.code === 'UNAUTHORIZED', `Composition access ignored immediate revocation: ${diagnostic(revokedComposition)}`);
  for (const [name, args] of [['tsa_list_jan_codes', {}], ['tsa_export_barcode', { janId: janRecord.id, format: 'svg' }]]) {
    const revokedJan = payload(await client.callTool({ name, arguments: args }));
    assert.ok(!revokedJan.ok && revokedJan.error?.code === 'UNAUTHORIZED', `JAN ignored revocation: ${diagnostic(revokedJan)}`);
  }
  for (const [pathname, method] of [['/api/data-access/connections', 'GET'], ['/api/recipe', 'GET'], ['/api/web-sales-period', 'POST']]) {
    const response = await fetch(origin + pathname, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
      ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}) });
    assert.equal(response.status, 401, 'Anonymous legacy access was not rejected.');
  }
  console.log(JSON.stringify({ production: true, mcpHandshake: true, tools: 29, adapterVersion: '1.3.0', scopedRead: true, versionedDetail: true,
    recordRestriction: true, resourceRestriction: true, limitedBusinessCatalogDenied: true, limitedCompositionDenied: true,
    limitedJanListDenied: true, limitedJanExportDenied: true, fullJanRead: true, janExports: ['svg','eps','png'], janOperations: 0, janRevocation: true, wholeCompositionRead: true, wholeCompositionVersion: true, readOnlyWriteDenied: true, preparedChanges: 0, replacementPlans: 0,
    immediateRevocation: true, compositionRevocation: true, anonymousLegacyAccessDenied: true }));
} finally {
  try {
    if (connectionId) await db.query('update public.data_access_connections set revoked_at=coalesce(revoked_at,now()) where id=$1', [connectionId]);
  } finally {
    try { if (connected) await client.close(); }
    finally { await db.end(); }
  }
}
