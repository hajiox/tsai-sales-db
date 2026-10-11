import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createApiClient } from '../api-client.mjs';

const token = `tsa_data_${'o'.repeat(43)}`;
const operationId = 'c309e74f-1538-49b6-a02c-a2981ce93025';
test('business operations use the fixed endpoint, bounded file transport, no replay and sanitized failures', async () => {
  let calls = 0;
  const api = createApiClient({ origin: 'https://tsa.example.test', token }, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://tsa.example.test/api/data-access/v1/operations');
    assert.equal(options.redirect, 'manual');
    assert.equal(JSON.parse(options.body).action, 'run');
    return Response.json({ ok: true, data: { operationId, result: { sample: 'x'.repeat(600 * 1024) } } });
  } });
  const result = await api.operations('run', { operation: 'csv_parse', input: { bytes: 'x'.repeat(100 * 1024) } });
  assert.equal(result.data.operationId, operationId);
  assert.equal(calls, 1);
  await assert.rejects(api.operations('run', { input: 'x'.repeat(12 * 1024 * 1024) }), error => error.code === 'REQUEST_TOO_LARGE');
  assert.equal(calls, 1);
  const timeout = createApiClient({ origin: 'https://tsa.example.test', token }, { fetchImpl: async () => {
    const error = new Error('synthetic'); error.name = 'TimeoutError'; throw error;
  } });
  await assert.rejects(timeout.operations('run', {}), error => error.code === 'TIMEOUT' && !error.message.includes(token));
});

test('real SDK exposes operation catalog/run/status; uncertain submission can be looked up by its original key', async () => {
  const requests = [];
  const http = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url, body: JSON.parse(raw) });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, data: { operationId, state: 'completed', result: { accepted: true } } }));
  });
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const client = new Client({ name: 'tsa-operation-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    env: { TSA_DATA_API_URL: `http://127.0.0.1:${http.address().port}`, TSA_DATA_API_TOKEN: token, TSA_DATA_ALLOW_LOCALHOST: '1' }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 32);
    for (const name of ['tsa_operation_catalog', 'tsa_run_operation', 'tsa_get_operation']) assert.ok(tools.some(tool => tool.name === name));
    for (const [name, args] of [
      ['tsa_operation_catalog', {}],
      ['tsa_run_operation', { operation: 'recipe.reviews.collect', input: { recipeId: operationId }, idempotencyKey: 'synthetic-reviews-1' }],
      ['tsa_get_operation', { operationId }],
      ['tsa_get_operation', { idempotencyKey: 'synthetic-reviews-1' }],
    ]) assert.equal((await client.callTool({ name, arguments: args })).isError, undefined);
    assert.deepEqual(requests.map(request => request.body.action), ['catalog', 'run', 'status', 'status']);
    assert.ok(requests.every(request => request.path === '/api/data-access/v1/operations'));
    const count = requests.length;
    for (const [name, args] of [
      ['tsa_operation_catalog', { url: 'https://other.invalid' }],
      ['tsa_run_operation', { operation: '../secret', input: {} }],
      ['tsa_run_operation', { operation: 'recipe.reviews.collect', sql: 'select 1' }],
      ['tsa_get_operation', {}], ['tsa_get_operation', { operationId, idempotencyKey: 'synthetic-reviews-1' }],
    ]) assert.equal((await client.callTool({ name, arguments: args })).isError, true);
    assert.equal(requests.length, count);
  } finally { await client.close(); await transport.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); }
});
