import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const token = `tsa_data_${'r'.repeat(43)}`; // Synthetic test credential only.
const recipeId = 'c90fe014-e1a1-4790-be31-cf26ff3f5a00';
const itemId = 'd90fe014-e1a1-4790-be31-cf26ff3f5a00';
const changeId = '1f0cbb17-ae1a-4d66-8660-173fd89bf178';
const version = 'b'.repeat(32);
const payload = result => result.structuredContent ?? JSON.parse(result.content[0].text);

test('recipe whole-item replacement uses three fixed tools over real STDIO and rejects invalid input before HTTP', async () => {
  const requests = [];
  let denied = false;
  const http = createHttpServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    requests.push({ url: req.url, body, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (denied) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: token }, requestId: 'recipe_items_denied' }));
      return;
    }
    const data = body.action === 'read'
      ? { recipeId, recipe: { id: recipeId, name: '合成レシピ' }, items: [{ id: itemId, recipe_id: recipeId, item_type: 'ingredient', item_name: '合成食材', usage_amount: 1 }], _version: version }
      : body.action === 'prepare'
        ? { id: changeId, recipeId, requiresApproval: false, status: 'pending', before: { items: [{ id: itemId }] }, after: { items: body.items } }
        : { id: changeId, status: 'applied', recipeId, items: [{ id: itemId }], _version: version };
    res.end(JSON.stringify({ ok: true, data, requestId: 'recipe_items_mock' }));
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const client = new Client({ name: 'tsa-recipe-items-test', version: '1.2.0' });
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
    assert.equal(client.getServerVersion().version, '1.3.0');
    const { tools } = await client.listTools();
    assert.equal(tools.length, 29);
    assert.equal(tools.find(tool => tool.name === 'tsa_get_recipe_items').annotations.readOnlyHint, true);
    assert.equal(tools.find(tool => tool.name === 'tsa_prepare_recipe_items_replacement').annotations.destructiveHint, false);
    assert.equal(tools.find(tool => tool.name === 'tsa_apply_recipe_items_replacement').annotations.destructiveHint, true);

    const detail = await client.callTool({ name: 'tsa_get_recipe_items', arguments: { recipeId } });
    assert.equal(detail.isError, undefined);
    assert.equal(payload(detail).data._version, version);
    assert.deepEqual(requests[0].body, { action: 'read', recipeId });

    const preparation = { recipeId, expectedVersion: version, items: [
      { id: itemId, usage_amount: 2, unit_quantity: -1, unit_weight: null, tax_included: true },
      { item_type: 'material', material_id: itemId, usage_amount: 1, item_name: '' },
      { item_type: 'expense', item_name: '合成経費', usage_amount: null, unit_price: 100 },
    ], idempotencyKey: 'recipe-items-001' };
    const prepared = await client.callTool({ name: 'tsa_prepare_recipe_items_replacement', arguments: preparation });
    assert.equal(prepared.isError, undefined);
    assert.equal(payload(prepared).data.requiresApproval, false);
    assert.deepEqual(requests.at(-1).body, { action: 'prepare', ...preparation });
    const applied = await client.callTool({ name: 'tsa_apply_recipe_items_replacement', arguments: { changeId: payload(prepared).data.id } });
    assert.equal(applied.isError, undefined);
    assert.equal(payload(applied).data.status, 'applied');
    assert.deepEqual(requests.at(-1).body, { action: 'apply', id: changeId });
    await client.callTool({ name: 'tsa_apply_recipe_items_replacement', arguments: { changeId } });
    assert.deepEqual(requests.at(-1).body, requests.at(-2).body, 'Unknown application outcome must reuse the same change ID.');
    const clear = await client.callTool({ name: 'tsa_prepare_recipe_items_replacement', arguments: { ...preparation, items: [], idempotencyKey: 'recipe-items-clear' } });
    assert.equal(clear.isError, undefined);
    assert.deepEqual(requests.at(-1).body.items, [], 'The explicit empty array must reach the API unchanged.');
    assert.ok(requests.every(request => request.url === '/api/data-access/v1/recipe-items' && request.authorization === `Bearer ${token}`));

    const invalidItems = [
      [{ id: itemId, cost: 1 }],
      [{ id: itemId, recipe_id: recipeId }],
      [{ id: itemId, created_at: '2026-10-10' }],
      [{ id: itemId, usage_amount: '1' }],
      [{ id: itemId, unit_price: 1e9 + 1 }],
      [{ id: itemId, unit_quantity: -1e9 - 1 }],
      [{ id: itemId, item_type: 'unknown' }],
      [{ id: itemId, tax_included: 'true' }],
      [{ id: itemId, item_name: 'bad\u0000name' }],
      [{ id: itemId, item_name: 'x'.repeat(2001) }],
      [{ id: itemId, ingredient_id: itemId, material_id: itemId }],
      [{ id: itemId, item_type: 'ingredient', material_id: itemId }],
      [{ item_type: 'ingredient', item_name: 'Missing usage' }],
      [{ item_type: 'ingredient', usage_amount: 1 }],
      [{ item_type: 'ingredient', usage_amount: 1, item_name: ' ' }],
      [{ item_type: 'ingredient', usage_amount: 1, ingredient_id: '../secrets' }],
      [{ id: itemId }, { id: itemId.toUpperCase() }],
      Array.from({ length: 101 }, () => ({ item_type: 'expense', item_name: 'item', usage_amount: 1 })),
    ];
    const invalid = invalidItems.map(items => ['tsa_prepare_recipe_items_replacement', { ...preparation, items }]);
    invalid.push(
      ['tsa_get_recipe_items', { recipeId: '../secrets' }],
      ['tsa_get_recipe_items', { recipeId, sql: 'select 1' }],
      ['tsa_prepare_recipe_items_replacement', { ...preparation, expectedVersion: 'stale' }],
      ['tsa_prepare_recipe_items_replacement', { ...preparation, expectedVersion: undefined }],
      ['tsa_prepare_recipe_items_replacement', { ...preparation, items: undefined }],
      ['tsa_prepare_recipe_items_replacement', { ...preparation, idempotencyKey: 'bad' }],
      ['tsa_prepare_recipe_items_replacement', { ...preparation, url: 'https://other.example.test' }],
      ['tsa_apply_recipe_items_replacement', { changeId: '../secrets' }],
      ['tsa_apply_recipe_items_replacement', { changeId, items: [] }],
    );
    const count = requests.length;
    for (const [name, args] of invalid) {
      const rejected = await client.callTool({ name, arguments: args });
      assert.equal(rejected.isError, true, `${name}: invalid recipe item request accepted`);
    }
    const oversized = await client.callTool({ name: 'tsa_prepare_recipe_items_replacement', arguments: { ...preparation, items: Array.from({ length: 20 }, () => ({ item_type: 'expense', item_name: 'x'.repeat(2000), usage_amount: 1 })) } });
    assert.equal(oversized.isError, true);
    assert.equal(payload(oversized).error.code, 'REQUEST_TOO_LARGE');
    assert.equal(requests.length, count, 'Invalid/oversized input must not issue HTTP requests.');

    denied = true;
    const forbidden = await client.callTool({ name: 'tsa_get_recipe_items', arguments: { recipeId } });
    assert.equal(forbidden.isError, true);
    assert.equal(payload(forbidden).error.code, 'FORBIDDEN');
    assert.ok(!JSON.stringify(forbidden).includes(token));
    assert.ok(!stderr.includes(token));
  } finally {
    await client.close();
    await new Promise(resolve => http.close(resolve));
  }
});
