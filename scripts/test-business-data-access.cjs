const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'node:crypto') return crypto;
    if (name === 'server-only') return {};
    throw Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', 'process', 'console', code)(localRequire, module, module.exports,
    { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } }, { error() {} });
  return module.exports;
}
const contracts = load('lib/data-access/contracts.ts');
const business = load('lib/data-access/business-contracts.ts', { './contracts': contracts });
const { validateBusinessInput } = business;
const id = '00000000-0000-4000-8000-000000000001';
const version = 'a'.repeat(32);
const mutation = { action: 'prepare', table: 'recipes', operation: 'update', key: { id }, expectedVersion: version, values: { selling_price: 4157.4075 }, idempotencyKey: 'price-update-0001' };
const invalid = value => assert.throws(() => validateBusinessInput(value), error => error.code === 'INVALID_INPUT');

function contractChecks() {
  assert.deepEqual(validateBusinessInput({ action: 'catalog' }), { action: 'catalog', payload: {} });
  assert.equal(validateBusinessInput({ action: 'catalog', table: 'recipes' }).payload.table, 'recipes');
  const read = { action: 'read', table: 'recipe_items', filters: { recipe_id: id, cost: 54, tax_included: false, material_id: null }, columns: ['id', 'cost'], limit: 100, offset: 10000 };
  assert.deepEqual(validateBusinessInput(read).payload.filters, read.filters);
  assert.deepEqual(validateBusinessInput(mutation).payload.values, mutation.values);
  assert.equal(validateBusinessInput({ action: 'prepare', table: 'recipes', operation: 'create', values: { name: 'new', category: 'OEM', selling_price: 100 }, idempotencyKey: 'new-recipe-0001' }).payload.operation, 'create');
  assert.equal(validateBusinessInput({ action: 'prepare', table: 'account_master', operation: 'update', key: { account_code: '5301' }, expectedVersion: version, values: { account_name: 'name' }, idempotencyKey: 'natural-key-0001' }).payload.key.account_code, '5301');
  const { values: _ignored, ...withoutValues } = mutation;
  assert.equal(validateBusinessInput({ ...withoutValues, operation: 'delete' }).payload.operation, 'delete');
  assert.equal(validateBusinessInput({ action: 'apply', id }).payload.id, id);
  for (const value of [null, [], {}, { action: 'sql', sql: 'select 1' }, { action: 'read', table: 'public.recipes' }, { action: 'read', table: 'recipes;drop_table' }, { action: 'catalog', table: 'recipes', url: 'https://example.invalid' }, { action: 'apply', id, values: { name: 'replacement' } }, { action: 'apply', id: 'not-uuid' }, { ...mutation, expectedVersion: undefined }, { ...mutation, idempotencyKey: 'short' }, { ...mutation, key: {} }, { ...mutation, key: { id: [id] } }, { ...mutation, values: {} }, { ...mutation, operation: 'create' }, { ...mutation, operation: 'delete' }]) invalid(value);
  for (const limit of [0, 101, 1.1, '1', null]) invalid({ action: 'read', table: 'recipes', limit });
  for (const offset of [-1, 10001, 1.1, '1', null]) invalid({ action: 'read', table: 'recipes', offset });
  for (const columns of [[], ['id', 'public.secret'], ['id', 1], 'id']) invalid({ action: 'read', table: 'recipes', columns });
  for (const filters of [[], { id: [id] }, { id: { nested: id } }, { 'id;drop': id }]) invalid({ action: 'read', table: 'recipes', filters });
  invalid({ ...mutation, values: { name: 'unsafe\u0000' } });
  invalid({ ...mutation, values: { selling_price: Infinity } });
  invalid({ ...mutation, values: JSON.parse('{"constructor":{"polluted":true}}') });
  let deeplyNested = 'value';
  for (let depth = 0; depth < 16; depth++) deeplyNested = { nested: deeplyNested };
  invalid({ ...mutation, values: { snapshot: deeplyNested } });
}

let rpcCalls = [];
let rpcResponse = { data: { items: [] }, error: null };
const server = load('lib/data-access/server.ts', {
  './contracts': contracts,
  '@supabase/supabase-js': { createClient: () => ({ rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcResponse; } }) },
});
const route = load('app/api/data-access/v1/business/route.ts', {
  '@/lib/data-access/contracts': contracts,
  '@/lib/data-access/business-contracts': business,
  '@/lib/data-access/server': server,
});
const token = `tsa_data_${crypto.randomBytes(32).toString('base64url')}`;
function request(value, authentication = token, extraHeaders = {}) {
  return new Request('https://example.invalid/api/data-access/v1/business', { method: 'POST', headers: { 'content-type': 'application/json', ...(authentication ? { authorization: `Bearer ${authentication}` } : {}), ...extraHeaders }, body: typeof value === 'string' ? value : JSON.stringify(value) });
}
async function httpChecks() {
  for (const authentication of [null, 'other_bridge_key', 'tsa_data_short']) {
    const result = await route.POST(request({ action: 'catalog' }, authentication));
    assert.equal(result.status, 401);
  }
  assert.equal(rpcCalls.length, 0);
  let result = await route.POST(request({ action: 'catalog' }));
  assert.equal(result.status, 200);
  assert.equal(rpcCalls[0].name, 'tsa_business_access_v1');
  assert.equal(rpcCalls[0].args.p_token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.deepEqual(rpcCalls[0].args.p_payload, {});
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(!(await result.text()).includes(token));
  const before = rpcCalls.length;
  for (const value of [{ action: 'read', table: 'recipes', sql: 'select 1' }, { action: 'apply', id, values: { selling_price: 1 } }, '{malformed']) {
    result = await route.POST(request(value));
    assert.equal(result.status, 400);
    assert.equal(rpcCalls.length, before);
  }
  result = await route.POST(request({ action: 'catalog' }, token, { 'content-type': 'text/plain' }));
  assert.equal(result.status, 400);
  result = await route.POST(request({ action: 'catalog' }, token, { 'content-length': '40000' }));
  assert.equal(result.status, 413);
  result = await route.POST(request({ ...mutation, values: { manufacturing_notes: 'x'.repeat(33000) } }));
  assert.equal(result.status, 413);
  assert.equal(rpcCalls.length, before);
  result = await route.POST(request(mutation));
  assert.equal(result.status, 200);
  assert.equal(rpcCalls.at(-1).args.p_action, 'prepare');
  assert.equal(rpcCalls.at(-1).args.p_payload.values.selling_price, 4157.4075);
  result = await route.POST(request({ action: 'apply', id }));
  assert.equal(result.status, 200);
  assert.deepEqual(rpcCalls.at(-1).args.p_payload, { id });
  for (const [code, status] of [['UNAUTHORIZED', 401], ['FORBIDDEN', 403], ['NOT_FOUND', 404], ['CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409], ['EXPIRED', 409], ['REJECTED', 409], ['INVALID_INPUT', 400]]) {
    rpcResponse = { data: null, error: { message: `DA_${code}`, code: 'P0001' } };
    result = await route.POST(request({ action: 'catalog' }));
    assert.equal(result.status, status);
    assert.equal((await result.json()).error.code, code);
  }
  rpcResponse = { data: null, error: { message: 'private SQL and token must not be returned', code: 'XX000' } };
  result = await route.POST(request({ action: 'catalog' }));
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes('private SQL'));
  // An absent/falsified Content-Length must not make the server buffer an unlimited stream.
  let chunks = 0, cancelled = false;
  const stream = new ReadableStream({ pull(controller) { if (++chunks <= 10) controller.enqueue(new TextEncoder().encode('x'.repeat(20000))); else controller.close(); }, cancel() { cancelled = true; } });
  const streaming = new Request('https://example.invalid/api/data-access/v1/business', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: stream, duplex: 'half' });
  result = await route.POST(streaming);
  assert.equal(result.status, 413);
  assert.equal(cancelled, true, 'Oversized request streams are cancelled before buffering the entire body');
  assert.ok(chunks < 10);
}

async function adminChecks() {
  let session = null;
  let updated = null;
  let selected = null;
  let dbCalls = 0;
  let exists = true;
  const chain = new Proxy({}, { get(_target, method) {
    if (method === 'then') return resolve => Promise.resolve({ data: exists ? { id, scopes: updated?.scopes, resource_ids: updated?.resource_ids } : null, error: null }).then(resolve);
    return (...args) => { if (method === 'update') updated = args[0]; if (method === 'select') selected = args[0]; return chain; };
  } });
  const admin = load('lib/data-access-admin.ts', {
    'next-auth': { getServerSession: async () => session },
    '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
    '@supabase/supabase-js': { createClient: () => ({ from() { dbCalls++; return chain; } }) },
  });
  assert.deepEqual(admin.validateDataConnectionPermissions({ scopes: ['business:full'] }), { scopes: ['business:full'], resource_ids: {} });
  assert.throws(() => admin.validateDataConnectionPermissions({ scopes: ['business:full'], resourceIds: { recipes: [id] } }));
  assert.throws(() => admin.validateDataConnectionPermissions({ scopes: ['recipes:write'] }));
  assert.throws(() => admin.validateDataConnectionPermissions({ scopes: ['admin:write'] }));
  assert.throws(() => admin.validateDataConnectionPermissions({ scopes: [] }));
  const adminRoute = load('app/api/data-access/connections/route.ts', { '@/lib/data-access-admin': admin, 'next/server': { NextResponse: { json: Response.json } } });
  const permissions = { action: 'permissions', id, scopes: ['business:full', 'recipes:read'], resourceIds: {}, token_hash: 'forged', expires_at: '2099-01-01', created_by: 'forged' };
  const post = (value, origin = 'https://example.invalid') => request(value, null, { origin });
  assert.equal((await adminRoute.POST(post(permissions))).status, 401);
  assert.equal(dbCalls, 0);
  session = { user: { email: 'other@example.invalid' } };
  assert.equal((await adminRoute.POST(post(permissions))).status, 401);
  session = { user: { email: 'AIZUBRANDHALL@GMAIL.COM' } };
  assert.equal((await adminRoute.POST(post(permissions, 'https://other.example.invalid'))).status, 403);
  assert.equal(dbCalls, 0);
  const response = await adminRoute.POST(post(permissions));
  assert.equal(response.status, 200);
  assert.deepEqual(updated, { scopes: ['business:full', 'recipes:read'], resource_ids: {} });
  assert.ok(!selected.includes('token_hash'));
  assert.ok(!(await response.text()).includes('forged'));
  exists = false;
  assert.equal((await adminRoute.POST(post(permissions))).status, 409);
  const source = ts.createSourceFile('page.tsx', fs.readFileSync(path.join(root, 'app/system/data-access/page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length, 0, 'Management JSX remains syntactically valid');
}

async function main() {
  contractChecks();
  await httpChecks();
  await adminChecks();
  console.log('business contracts, HTTP authentication/bounds/safe errors, management permission updates and JSX passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
