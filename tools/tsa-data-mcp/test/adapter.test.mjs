import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createApiClient, DataApiError, loadConfiguration } from '../api-client.mjs';
import { changeSchema } from '../change-schemas.mjs';

const token = `tsa_data_${'x'.repeat(43)}`; // Synthetic test fixture; never a live connection.
const id = 'b90fe014-e1a1-4790-be31-cf26ff3f5a00';
const changeId = '0f0cbb17-ae1a-4d66-8660-173fd89bf178';
const config = { origin: 'https://tsa.example.test', token };

test('configuration: HTTPS only, exact API base path, no URL credentials/query/fragment; localhost requires explicit opt-in', () => {
  assert.deepEqual(loadConfiguration({ TSA_DATA_API_URL: 'https://tsa.example.test/api/data-access/v1', TSA_DATA_API_TOKEN: token }), config);
  for (const url of ['http://tsa.example.test', 'https://user:pass@tsa.example.test', 'https://tsa.example.test?token=bad', 'https://tsa.example.test/#bad', 'https://tsa.example.test/other', 'http://127.0.0.1:3000']) {
    assert.throws(() => loadConfiguration({ TSA_DATA_API_URL: url, TSA_DATA_API_TOKEN: token }), DataApiError);
  }
  assert.equal(loadConfiguration({ TSA_DATA_API_URL: 'http://127.0.0.1:3000', TSA_DATA_API_TOKEN: token, TSA_DATA_ALLOW_LOCALHOST: '1' }).origin, 'http://127.0.0.1:3000');
  assert.throws(() => loadConfiguration({ TSA_DATA_API_URL: config.origin, TSA_DATA_API_TOKEN: 'bad\nheader' }), DataApiError);
});

test('fixed routes, no redirects, response limits and sanitized errors', async () => {
  const calls = [];
  const api = createApiClient(config, { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ok: true, data: { name: 'sample', faultyEcho: token }, requestId: 'req_123' });
  } });
  const result = await api.read({ resource: 'recipes', limit: 1 });
  assert.equal(result.data.faultyEcho, '[redacted]');
  assert.equal(calls[0].url, `${config.origin}/api/data-access/v1/read`);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
  assert.throws(() => api.apply('../secrets'), /UUID/);
  assert.equal(calls.length, 1);
  const redirect = createApiClient(config, { fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://untrusted.example.test' } }) });
  await assert.rejects(redirect.read({}), error => error.code === 'REDIRECT_BLOCKED');
  const oversized = createApiClient(config, { fetchImpl: async () => Response.json({ ok: true, data: 'x'.repeat(512 * 1024) }) });
  await assert.rejects(oversized.read({}), error => error.code === 'RESPONSE_TOO_LARGE');
  const unsafe = createApiClient(config, { fetchImpl: async () => Response.json({ ok: false, error: { code: 'FORBIDDEN', message: token }, requestId: 'req_123' }, { status: 403 }) });
  await assert.rejects(unsafe.read({}), error => error.code === 'FORBIDDEN' && !error.message.includes(token) && error.requestId === 'req_123');
  const requestOversized = createApiClient(config, { fetchImpl: async () => { throw new Error('must not fetch'); } });
  await assert.rejects(requestOversized.prepare({ data: 'x'.repeat(32 * 1024) }), error => error.code === 'REQUEST_TOO_LARGE');
});

test('declared mutation fields: price/pack/tax update with validation, immutable version and idempotency required', () => {
  const update = { operation: 'update', id, expectedVersion: 'a'.repeat(32), values: { manufacturing_notes: '確認済みの更新' }, idempotencyKey: 'test-update-1' };
  assert.equal(changeSchema('recipes').safeParse(update).success, true);
  assert.equal(changeSchema('recipes').safeParse({ ...update, values: { selling_price: 123, category: 'OEM', amazon_fee_enabled: undefined } }).success, false);
  assert.equal(changeSchema('recipes').safeParse({ ...update, values: { selling_price: 123, category: 'OEM' } }).success, true);
  for (const values of [{ selling_price: -1 }, { catchcopy: 'external synchronization required' }, { sql: 'DROP TABLE recipes' }, {}, { manufacturing_notes: 'a\u0000b' }]) {
    assert.equal(changeSchema('recipes').safeParse({ ...update, values }).success, false);
  }
  for (const values of [{ price: 50 }, { unit_quantity: 500 }, { tax_included: true }]) {
    assert.equal(changeSchema('ingredients').safeParse({ ...update, values }).success, true);
  }
  assert.equal(changeSchema('recipes').safeParse({ ...update, expectedVersion: undefined }).success, false);
  assert.equal(changeSchema('recipes').safeParse({ ...update, idempotencyKey: 'bad' }).success, false);
  assert.equal(changeSchema('ingredients').safeParse({ operation: 'create', values: { name: '検証用材料', unit_quantity: 500, price: 123, tax_included: true }, idempotencyKey: 'test-create-1' }).success, true);
  assert.equal(changeSchema('ingredients').safeParse({ operation: 'create', values: { name: '検証用材料', unit_quantity: null, price: null, tax_included: false }, idempotencyKey: 'test-create-2' }).success, true);
  assert.equal(changeSchema('ingredients').safeParse({ operation: 'create', values: { name: '検証用材料', unit_quantity: 500, price: 123 }, idempotencyKey: 'test-create-3' }).success, false);
  assert.equal(changeSchema('ingredients').safeParse({ operation: 'create', id, values: { name: '検証用材料' }, idempotencyKey: 'test-create-1' }).success, false);
  assert.equal(changeSchema('recipes').safeParse({ operation: 'create', values: { name: '検証用レシピ' }, idempotencyKey: 'test-create-1' }).success, false);
});

test('actual HTTP request times out without retry', async () => {
  let calls = 0;
  const http = createHttpServer(() => { calls += 1; });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  try {
    const api = createApiClient({ origin: `http://127.0.0.1:${http.address().port}`, token }, { timeoutMs: 100 });
    await assert.rejects(api.read({ resource: 'recipes' }), error => error.code === 'TIMEOUT');
    assert.equal(calls, 1);
  } finally {
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
  }
});

test('real STDIO initialize, tools/list, mock API read and rejection before any business request', async () => {
  const requests = [];
  let rejectRead = false;
  const http = createHttpServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body);
    requests.push({ url: req.url, body: parsed, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (rejectRead) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: token }, requestId: 'mock_forbidden_1' }));
      return;
    }
    const record = { id, name: '検証用レシピ', _version: 'a'.repeat(32) };
    const data = req.url.endsWith('/read') ? { items: [record], nextCursor: null }
      : req.url.endsWith('/apply') ? { id: changeId, status: 'applied', record }
      : { id: changeId, resource: parsed.resource, recordId: parsed.id, status: 'pending', requiresApproval: false, values: parsed.values, before: record };
    res.end(JSON.stringify({ ok: true, data, requestId: 'mock_request_1' }));
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const client = new Client({ name: 'tsa-data-mcp-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    env: { TSA_DATA_API_URL: `http://127.0.0.1:${http.address().port}`, TSA_DATA_API_TOKEN: token, TSA_DATA_ALLOW_LOCALHOST: '1' },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', data => { stderr += data.toString(); });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name, 'tsa-data');
    assert.equal(client.getServerVersion().version, '1.3.0');
    const { tools } = await client.listTools();
    assert.equal(tools.length, 29);
    assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length);
    assert.ok(tools.every(tool => tool.annotations.openWorldHint === false));
    assert.ok(tools.filter(tool => tool.name.includes('search_') || tool.name.includes('get_')).every(tool => tool.annotations.readOnlyHint === true));
    assert.equal(tools.find(tool => tool.name === 'tsa_apply_change').annotations.readOnlyHint, false);
    assert.equal(tools.find(tool => tool.name === 'tsa_apply_change').annotations.destructiveHint, true);
    assert.ok(tools.filter(tool => tool.name.includes('prepare_')).every(tool => tool.annotations.destructiveHint === false));
    assert.ok(!tools.some(tool => /sql|shell|exec|delete|token|credential/i.test(tool.name)));
    const result = await client.callTool({ name: 'tsa_get_recipe', arguments: { id } });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).data.items[0].name, '検証用レシピ');
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].body, { resource: 'recipes', id });
    assert.equal(requests[0].auth, `Bearer ${token}`);
    for (const args of [{ query: 'a', limit: 101 }, { query: 'a', sql: 'SELECT * FROM users' }, { query: 'a', url: 'https://other.example.test' }, { cursor: '../secrets' }]) {
      const rejected = await client.callTool({ name: 'tsa_search_recipes', arguments: args });
      assert.equal(rejected.isError, true);
    }
    const badDate = await client.callTool({ name: 'tsa_search_sales', arguments: { from: '2026-02-30' } });
    assert.equal(badDate.isError, true);
    const unknown = await client.callTool({ name: 'tsa_sql', arguments: {} }).catch(error => error);
    assert.ok(unknown instanceof Error || unknown.isError);
    assert.equal(requests.length, 1);
    const mutation = { operation: 'update', id, expectedVersion: 'a'.repeat(32), values: { manufacturing_notes: '更新の検証だけ' }, idempotencyKey: 'mock-update-001' };
    const prepared = await client.callTool({ name: 'tsa_prepare_recipe_change', arguments: mutation });
    assert.equal(prepared.isError, undefined);
    assert.deepEqual(requests[1].body, { resource: 'recipes', ...mutation });
    assert.equal(requests[1].url, '/api/data-access/v1/changes');
    const preparedId = JSON.parse(prepared.content[0].text).data.id;
    assert.equal(preparedId, changeId);
    const applied = await client.callTool({ name: 'tsa_apply_change', arguments: { changeId: preparedId } });
    assert.equal(applied.isError, undefined);
    assert.equal(requests[2].url, `/api/data-access/v1/changes/${changeId}/apply`);
    assert.deepEqual(requests[2].body, {});
    const replacement = await client.callTool({ name: 'tsa_apply_change', arguments: { changeId, values: { name: 'invalid' } } });
    assert.equal(replacement.isError, true);
    assert.equal(requests.length, 3);
    rejectRead = true;
    const forbidden = await client.callTool({ name: 'tsa_get_recipe', arguments: { id } });
    assert.equal(forbidden.isError, true);
    assert.equal(JSON.parse(forbidden.content[0].text).error.code, 'FORBIDDEN');
    assert.ok(!forbidden.content[0].text.includes(token));
    assert.ok(!stderr.includes(token));
  } finally {
    await client.close();
    await new Promise(resolve => http.close(resolve));
  }
});

test('business tools over real STDIO: catalog, bounded reads, versioned CRUD plans, fixed apply ID and pre-HTTP validation', async () => {
  const requests = [];
  let forbidden = false;
  const record = { id, recipe_id: id, unit_price: 250, _version: 'a'.repeat(32) };
  const http = createHttpServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body);
    requests.push({ url: req.url, body: parsed, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (forbidden) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: token }, requestId: 'business_denied_1' }));
      return;
    }
    const data = parsed.action === 'catalog'
      ? { tables: [{ table: 'recipe_items', primaryKey: ['id'], fields: [{ name: 'unit_price', type: 'numeric', writable: true, creatable: true }], writable: true }] }
      : parsed.action === 'read' ? { items: [record], nextOffset: 25 }
      : parsed.action === 'prepare' ? { id: changeId, table: parsed.table, operation: parsed.operation, key: parsed.key ?? {}, status: 'pending', requiresApproval: false, values: parsed.values, before: parsed.operation === 'create' ? null : record }
      : { id: changeId, status: 'applied', record, related: {} };
    res.end(JSON.stringify({ ok: true, data, requestId: 'business_request_1' }));
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const client = new Client({ name: 'tsa-business-mcp-test', version: '1.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    env: { TSA_DATA_API_URL: `http://127.0.0.1:${http.address().port}`, TSA_DATA_API_TOKEN: token, TSA_DATA_ALLOW_LOCALHOST: '1' },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', data => { stderr += data.toString(); });
  const payload = result => result.structuredContent ?? JSON.parse(result.content[0].text);
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    for (const name of ['tsa_business_catalog', 'tsa_business_read']) {
      assert.deepEqual(tools.find(tool => tool.name === name).annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
    assert.equal(tools.find(tool => tool.name === 'tsa_prepare_business_change').annotations.destructiveHint, false);
    assert.equal(tools.find(tool => tool.name === 'tsa_apply_business_change').annotations.destructiveHint, true);
    assert.equal(tools.find(tool => tool.name === 'tsa_apply_business_change').annotations.readOnlyHint, false);

    const catalog = await client.callTool({ name: 'tsa_business_catalog', arguments: {} });
    assert.equal(catalog.isError, undefined);
    assert.equal(payload(catalog).data.tables[0].table, 'recipe_items');
    assert.deepEqual(requests[0].body, { action: 'catalog' });
    await client.callTool({ name: 'tsa_business_catalog', arguments: { table: 'recipe_items' } });
    assert.deepEqual(requests[1].body, { action: 'catalog', table: 'recipe_items' });

    const readArgs = { table: 'recipe_items', filters: { recipe_id: id, unit_price: 250 }, columns: ['id', 'unit_price'], limit: 25, offset: 50 };
    const read = await client.callTool({ name: 'tsa_business_read', arguments: readArgs });
    assert.equal(read.isError, undefined);
    assert.equal(payload(read).data.items[0]._version, record._version);
    assert.deepEqual(requests[2].body, { action: 'read', ...readArgs });
    await client.callTool({ name: 'tsa_business_read', arguments: { table: 'recipes' } });
    assert.deepEqual(requests[3].body, { action: 'read', table: 'recipes', limit: 25, offset: 0 });

    const plans = [
      { table: 'recipe_items', operation: 'create', values: { recipe_id: id, unit_price: 250, name: '検証用明細', metadata: { labels: ['確認'], enabled: true } }, idempotencyKey: 'business-create-001' },
      { table: 'recipe_items', operation: 'update', key: { id }, expectedVersion: record._version, values: { unit_price: 300 }, idempotencyKey: 'business-update-001' },
      { table: 'recipe_items', operation: 'delete', key: { id }, expectedVersion: record._version, idempotencyKey: 'business-delete-001' },
    ];
    for (const plan of plans) {
      const prepared = await client.callTool({ name: 'tsa_prepare_business_change', arguments: plan });
      assert.equal(prepared.isError, undefined);
      assert.equal(payload(prepared).data.id, changeId);
      assert.equal(payload(prepared).data.requiresApproval, false);
      assert.deepEqual(requests.at(-1).body, { action: 'prepare', ...plan });
    }
    const applied = await client.callTool({ name: 'tsa_apply_business_change', arguments: { changeId } });
    assert.equal(applied.isError, undefined);
    assert.equal(payload(applied).data.status, 'applied');
    assert.deepEqual(requests.at(-1).body, { action: 'apply', id: changeId });
    assert.ok(requests.every(request => request.url === '/api/data-access/v1/business' && request.auth === `Bearer ${token}`));

    const requestsBeforeRejections = requests.length;
    const invalid = [
      ['tsa_business_catalog', { table: 'recipes;drop_table' }],
      ['tsa_business_catalog', { sql: 'select * from recipes' }],
      ['tsa_business_read', { table: 'recipes', limit: 101 }],
      ['tsa_business_read', { table: 'recipes', offset: -1 }],
      ['tsa_business_read', { table: 'recipes', columns: ['*'] }],
      ['tsa_business_read', { table: 'recipes', filters: { id: { eq: id } } }],
      ['tsa_business_read', { table: 'recipes', url: 'https://other.example.test' }],
      ['tsa_prepare_business_change', { ...plans[1], expectedVersion: undefined }],
      ['tsa_prepare_business_change', { ...plans[1], expectedVersion: 'stale' }],
      ['tsa_prepare_business_change', { ...plans[1], key: {} }],
      ['tsa_prepare_business_change', { ...plans[1], values: {} }],
      ['tsa_prepare_business_change', { ...plans[1], idempotencyKey: 'bad' }],
      ['tsa_prepare_business_change', { ...plans[1], sql: 'update recipes set selling_price=0' }],
      ['tsa_prepare_business_change', { ...plans[0], key: { id } }],
      ['tsa_prepare_business_change', { ...plans[2], values: { unit_price: 1 } }],
      ['tsa_apply_business_change', { changeId: '../secrets' }],
      ['tsa_apply_business_change', { changeId, values: { unit_price: 1 } }],
    ];
    for (const [name, args] of invalid) {
      const rejected = await client.callTool({ name, arguments: args });
      assert.equal(rejected.isError, true, `${name}: invalid business request was accepted`);
    }
    assert.equal(requests.length, requestsBeforeRejections, 'Invalid business inputs must not issue HTTP requests.');

    forbidden = true;
    const denied = await client.callTool({ name: 'tsa_business_catalog', arguments: {} });
    assert.equal(denied.isError, true);
    assert.equal(payload(denied).error.code, 'FORBIDDEN');
    assert.equal(payload(denied).requestId, 'business_denied_1');
    assert.ok(!denied.content[0].text.includes(token));
    assert.ok(!stderr.includes(token));
  } finally {
    await client.close();
    await new Promise(resolve => http.close(resolve));
  }
});
