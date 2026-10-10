const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  const localRequire = name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'node:crypto') return crypto;
    if (name === 'server-only') return {};
    throw Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', 'process', 'console', code)(localRequire, loaded, loaded.exports,
    { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } }, { error() {} });
  return loaded.exports;
}
const contracts = load('lib/data-access/contracts.ts');
const replacement = load('lib/data-access/recipe-items-contracts.ts', { './contracts': contracts });
const { validateRecipeItemsInput } = replacement;
const id = '00000000-0000-4000-8000-000000000001';
const source = '00000000-0000-4000-8000-000000000002';
const version = 'a'.repeat(32);
const prepare = { action: 'prepare', recipeId: id, expectedVersion: version, items: [{ id, usage_amount: 10 }, { item_type: 'ingredient', ingredient_id: source, usage_amount: 20 }], idempotencyKey: 'replacement-test-0001' };
function contractChecks() {
  assert.deepEqual(validateRecipeItemsInput({ action: 'read', recipeId: id }), { action: 'read', payload: { recipeId: id } });
  assert.deepEqual(validateRecipeItemsInput(prepare).payload.items, prepare.items);
  assert.deepEqual(validateRecipeItemsInput({ ...prepare, items: [] }).payload.items, []);
  assert.deepEqual(validateRecipeItemsInput({ action: 'apply', id }), { action: 'apply', payload: { id } });
  for (const item of [
    { item_type: 'product', intermediate_recipe_id: source, usage_amount: 10, unit_quantity: -1, unit_weight: 20 },
    { item_type: 'material', item_name: 'manual', usage_amount: null, tax_included: null, unit_price: null },
    { id, unit_price: -1, unit_quantity: 0 },
  ]) assert.equal(validateRecipeItemsInput({ ...prepare, items: [item] }).payload.items.length, 1);
  const invalid = input => assert.throws(() => validateRecipeItemsInput(input), error => error.code === 'INVALID_INPUT');
  for (const input of [null, [], {}, { action: 'sql' }, { action: 'read', recipeId: 'bad' }, { action: 'read', recipeId: id, url: 'https://example.invalid' }, { action: 'apply', id, items: [] }, { ...prepare, expectedVersion: 'a' }, { ...prepare, idempotencyKey: 'short' }, { ...prepare, items: null }, { ...prepare, items: Array(101).fill({ id }) }, { ...prepare, items: [{ id }, { id: id.toUpperCase() }] }]) invalid(input);
  for (const item of [null, [], {}, { id: null }, { id: 'bad' }, { id, recipe_id: source }, { id, created_at: '2026-01-01' }, { id, cost: 123 }, { id, sql: 'select 1' }, { id, item_type: 'other' }, { item_type: 'ingredient', usage_amount: 1 }, { item_type: 'ingredient', item_name: ' ' , usage_amount: 1 }, { item_type: 'ingredient', item_name: 'manual' }, { id, item_name: null }, { id, item_name: 'x'.repeat(2001) }, { id, item_name: 'x\u0000' }, { id, unit_price: '1' }, { id, unit_price: Infinity }, { id, usage_amount: NaN }, { id, unit_weight: 1000000001 }, { id, tax_included: 'false' }, { id, ingredient_id: 'bad' }, { id, ingredient_id: source, material_id: source }, { id, item_type: 'ingredient', material_id: source }, JSON.parse('{"constructor":{}}')]) invalid({ ...prepare, items: [item] });
}
let rpcCalls = [], rpcResponse = { data: { items: [] }, error: null };
const server = load('lib/data-access/server.ts', {
  './contracts': contracts,
  '@supabase/supabase-js': { createClient: () => ({ rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcResponse; } }) },
});
const route = load('app/api/data-access/v1/recipe-items/route.ts', {
  '@/lib/data-access/contracts': contracts,
  '@/lib/data-access/recipe-items-contracts': replacement,
  '@/lib/data-access/server': server,
});
const token = `tsa_data_${crypto.randomBytes(32).toString('base64url')}`;
const request = (value, authentication = token, extraHeaders = {}) => new Request('https://example.invalid/api/data-access/v1/recipe-items', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(authentication ? { authorization: `Bearer ${authentication}` } : {}), ...extraHeaders }, body: typeof value === 'string' ? value : JSON.stringify(value),
});
async function httpChecks() {
  for (const authentication of [null, 'other_token', 'tsa_data_short']) assert.equal((await route.POST(request({ action: 'read', recipeId: id }, authentication))).status, 401);
  assert.equal(rpcCalls.length, 0);
  let response = await route.POST(request({ action: 'read', recipeId: id }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(rpcCalls[0].name, 'tsa_recipe_items_replace_v1');
  assert.equal(rpcCalls[0].args.p_token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.deepEqual(rpcCalls[0].args.p_payload, { recipeId: id });
  assert.ok(!(await response.text()).includes(token));
  const before = rpcCalls.length;
  for (const input of ['{malformed', { action: 'apply', id, items: [] }, { ...prepare, items: [{ id, cost: 1 }] }]) assert.equal((await route.POST(request(input))).status, 400);
  assert.equal((await route.POST(request(prepare, token, { 'content-type': 'text/plain' }))).status, 400);
  assert.equal((await route.POST(request(prepare, token, { 'content-length': '40000' }))).status, 413);
  assert.equal((await route.POST(request({ ...prepare, items: Array(100).fill({ item_type: 'ingredient', item_name: 'x'.repeat(1000), usage_amount: 1 }) }))).status, 413);
  assert.equal(rpcCalls.length, before);
  for (const input of [prepare, { ...prepare, items: [] }, { action: 'apply', id }]) {
    assert.equal((await route.POST(request(input))).status, 200);
    assert.equal(rpcCalls.at(-1).args.p_action, input.action);
    assert.deepEqual(rpcCalls.at(-1).args.p_payload, Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'action')));
  }
  for (const [code, status] of [['UNAUTHORIZED', 401], ['FORBIDDEN', 403], ['NOT_FOUND', 404], ['CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409], ['EXPIRED', 409], ['REJECTED', 409], ['INVALID_INPUT', 400]]) {
    rpcResponse = { data: null, error: { message: `DA_${code}`, code: 'P0001' } };
    response = await route.POST(request(prepare));
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
  }
  rpcResponse = { data: null, error: { message: 'private SQL and token must not be returned', code: 'XX000' } };
  response = await route.POST(request(prepare));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private SQL'));
  let chunks = 0, cancelled = false;
  const stream = new ReadableStream({ pull(controller) { if (++chunks <= 10) controller.enqueue(new TextEncoder().encode('x'.repeat(20000))); else controller.close(); }, cancel() { cancelled = true; } });
  response = await route.POST(new Request('https://example.invalid/api/data-access/v1/recipe-items', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: stream, duplex: 'half' }));
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.ok(chunks < 10);
}
contractChecks();
httpChecks().then(() => console.log('recipe-items replacement: strict contract and HTTP checks passed')).catch(error => { console.error(error); process.exitCode = 1; });
