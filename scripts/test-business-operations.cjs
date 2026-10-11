const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.join(__dirname, '..');
let session = null;
function load(file, imports = {}, environment = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  const requireStub = name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'server-only') return {};
    if (name.startsWith('node:')) return require(name);
    if (name === 'next/server') return { NextRequest, NextResponse: { json: Response.json } };
    if (name === 'next-auth') return { getServerSession: async () => session };
    if (name === '@/app/api/auth/[...nextauth]/route') return { authOptions: {} };
    throw Error(`Unexpected test dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', 'process', 'console', code)(requireStub, testModule, testModule.exports, { env: environment }, { error() {} });
  return testModule.exports;
}
const contracts = load('lib/data-access/contracts.ts');
const operationContracts = load('lib/data-access/operation-contracts.ts', { './contracts': contracts });
const context = load('lib/data-access/business-operation-context.ts');
const auth = load('lib/recipe-request-auth.ts', { '@/lib/data-access/business-operation-context': context });
const connectionId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const token = `tsa_data_${crypto.randomBytes(32).toString('base64url')}`;
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const { validateOperationEnvelope, validateOperationSchema, validateOperationJson, routeOperation, businessFileSchema, decodeBusinessFile } = operationContracts;
const strictBody = { type: 'object', additionalProperties: false, properties: { body: { type: 'object', additionalProperties: false, required: ['value'], properties: { value: { type: 'integer', minimum: 0, maximum: 100 } } } }, required: ['body'] };

function contractChecks() {
  assert.deepEqual(validateOperationEnvelope({ action: 'catalog' }), { action: 'catalog' });
  assert.deepEqual(validateOperationEnvelope({ action: 'status', idempotencyKey: 'fixture-key-1' }), { action: 'status', idempotencyKey: 'fixture-key-1' });
  for (const input of [{ action: 'catalog', url: 'https://example.invalid' }, { action: 'status' }, { action: 'status', operationId: connectionId, idempotencyKey: 'fixture-key-1' }, { action: 'run', operation: '../sql' }, { action: 'run', operation: 'fixture', input: [] }, { action: 'run', operation: 'fixture', idempotencyKey: 'short' }]) assert.throws(() => validateOperationEnvelope(input));
  validateOperationSchema(strictBody, { body: { value: 2 } });
  for (const value of [{ body: { value: 2, sql: 'select 1' } }, { body: { value: 2.2 } }, { body: { value: Infinity } }, { body: { value: 101 } }, { body: { value: -1 } }, { body: {} }, { body: { value: '2' } }, { body: { value: 1 }, url: '/api/auth' }]) assert.throws(() => validateOperationSchema(strictBody, value));
  for (const schema of [{ type: 'string', unknownKeyword: true }, { type: 'string', format: 'uri' }, { type: 'string', pattern: '^safe$' }, { type: 'string', maxLength: 1 }]) assert.throws(() => validateOperationSchema(schema, 'unsafe'));
  for (const value of ['2026-02-30', '2026-13-01', '2026-1-01']) assert.throws(() => validateOperationSchema({ type: 'string', format: 'date' }, value));
  validateOperationSchema({ anyOf: [{ type: 'integer' }, { type: 'null' }] }, null);
  assert.throws(() => validateOperationSchema({ anyOf: [{ type: 'integer' }, { type: 'null' }] }, '1'));
  assert.throws(() => validateOperationSchema({ anyOf: [{ type: 'string', notSupported: true }, { type: 'integer' }] }, 1), 'Unsupported schema branches cannot be silently ignored');
  assert.throws(() => validateOperationSchema({ type: 'string', format: 'date-time' }, '2026-02-30T00:00:00Z'));
  assert.throws(() => validateOperationSchema({ type: 'array', items: { type: 'string' }, maxItems: 1 }, ['a', 'b']));
  assert.throws(() => validateOperationJson(JSON.parse('{"constructor":{}}')));
  let nested = {}; for (let i = 0; i < 25; i++) nested = { nested };
  assert.throws(() => validateOperationJson(nested));
  const bytes = Buffer.from('synthetic CSV\n');
  const file = { field: 'file', filename: 'fixture.csv', mimeType: 'text/csv', base64: bytes.toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  assert.deepEqual(decodeBusinessFile(file).bytes, bytes);
  for (const changed of [{ ...file, filename: '../x.csv' }, { ...file, base64: `${file.base64}\n` }, { ...file, sha256: 'a'.repeat(64) }, { ...file, url: 'https://example.invalid' }]) assert.throws(() => decodeBusinessFile(changed));
  return file;
}

let calls = 0;
let failHandler = false;
let throwHandler = false;
let failFinish = false;
let denied = null;
let binary = false;
let throwRead = false;
let releaseHandler = null;
function syntheticDatabaseUrl(host) {
  const url = new URL(`postgresql://${host}/fixture`);
  url.username = 'synthetic-user'; url.password = 'synthetic-fixture-password';
  return url.href;
}
const syntheticEnvironment = {
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-fixture-value',
  GEMINI_API_KEY: 'synthetic-gemini-fixture-value',
  OPENAI_API_KEY: 'synthetic-openai-fixture-value',
  NEXTAUTH_SECRET: 'synthetic-nextauth-fixture-value',
  DATABASE_URL: syntheticDatabaseUrl('database.invalid'),
  BLOB_READ_WRITE_TOKEN: 'synthetic-blob-fixture-value',
};
const unknownApiKey = `AIza${'g'.repeat(35)}`;
const unknownJwt = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"sub":"synthetic"}').toString('base64url')}.${'s'.repeat(32)}`;
const errorFixture = [
  ...Object.values(syntheticEnvironment), encodeURIComponent(syntheticEnvironment.NEXTAUTH_SECRET),
  `https://google.example/v1/models?key=${unknownApiKey}`, unknownJwt,
  'Bearer synthetic-upstream-bearer-value', 'https://upstream.example/v1?api_key=synthetic-query-secret',
  syntheticDatabaseUrl('other.invalid'),
].join(' ');
const ledger = new Map();
const rpcCalls = [];
async function rpc(_name, { p_token_hash, p_action, p_payload }) {
  rpcCalls.push(p_action);
  if (p_token_hash !== tokenHash || denied) return { data: null, error: { message: `DA_${denied || 'UNAUTHORIZED'}` } };
  const data = { connectionId, actor: `data-access:${connectionId}` };
  if (p_action === 'authorize') return { data, error: null };
  if (p_action === 'claim') {
    let row = ledger.get(p_payload.idempotencyKey);
    if (row && (row.inputHash !== p_payload.inputHash || row.operation !== p_payload.operation)) return { data: null, error: { message: 'DA_IDEMPOTENCY_CONFLICT' } };
    const claimed = !row;
    if (!row) { row = { operationId: crypto.randomUUID(), operation: p_payload.operation, inputHash: p_payload.inputHash, state: 'running' }; ledger.set(p_payload.idempotencyKey, row); }
    return { data: { ...data, claimed, operation: { ...row } }, error: null };
  }
  const row = p_payload.idempotencyKey ? ledger.get(p_payload.idempotencyKey) : [...ledger.values()].find(item => item.operationId === p_payload.operationId);
  if (!row) return { data: null, error: { message: 'DA_NOT_FOUND' } };
  if (p_action === 'finish') {
    if (failFinish) return { data: null, error: { message: 'DB unavailable' } };
    if (row.state === 'running') Object.assign(row, { state: p_payload.state, result: p_payload.result });
  }
  return { data: { ...data, operation: { ...row } }, error: null };
}
const operations = [routeOperation({ name: 'fixture_write', description: 'Synthetic write', mutation: true, method: 'POST', pathname: '/api/recipe/fixture', schema: strictBody,
  execute: async (_input, execution) => {
    calls++;
    assert.equal(await auth.requireRecipeAdminRequest(execution.request), null);
    assert.equal((await context.getBusinessAdminSession()).user.email, `data-access:${connectionId}`);
    assert.equal((await auth.requireRecipeAdminRequest(new NextRequest('https://tsa.example.test/api/auth', { method: 'POST' }))).status, 401);
    if (releaseHandler) await new Promise(resolve => { releaseHandler.resolve = resolve; });
    if (throwHandler) throw new Error(`must not leak ${token}`);
    if (binary) return new Response(Buffer.from('synthetic file'), { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="fixture.pdf"' } });
    return Response.json({ ok: !failHandler, value: 2, access_token: 'must-not-leak', accessToken: 'must-not-leak', reflected: token, signed: 'https://blob.example/file?x-amz-signature=secret', error: { message: errorFixture }, full_prompt: 'must-not-leak-prompt', prompt_summary: 'business summary' }, { status: failHandler ? 422 : 200 });
  },
}), routeOperation({ name: 'fixture_read', description: 'Synthetic read', mutation: false, method: 'GET', pathname: '/api/recipe/fixture', schema: { type: 'object', additionalProperties: false }, execute: async () => { calls++; if (throwRead) throw new contracts.DataAccessError('INVALID_INPUT', errorFixture); return Response.json({ data: 'read' }); } }),
routeOperation({ name: 'fixture_invalid_prepare', description: 'Reject before claim', mutation: true, method: 'POST', pathname: '/api/recipe/fixture', schema: { type: 'object', additionalProperties: false }, buildRequest: () => new Request('https://other.invalid/api/recipe/fixture', { method: 'POST' }), execute: async () => { throw Error('Invalid requests must not invoke a handler'); } })];
const server = load('lib/data-access/operation-server.ts', {
  './contracts': contracts,
  './operation-contracts': operationContracts,
  './business-operation-context': context,
  './recipe-operations': { recipeOperations: operations }, './finance-operations': { financeOperations: [] }, './other-operations': { otherOperations: [] },
  './server': { tokenHashFromRequest: req => { if (req.headers.get('authorization') !== `Bearer ${token}`) throw new contracts.DataAccessError('UNAUTHORIZED', 'Token required', 401); return tokenHash; }, createDataAccessAdminClient: () => ({ rpc }), RPC_ERRORS: { UNAUTHORIZED: [401, 'Unauthorized'], FORBIDDEN: [403, 'Forbidden'], NOT_FOUND: [404, 'Not found'], IDEMPOTENCY_CONFLICT: [409, 'Conflict'] } },
}, syntheticEnvironment);
function request(body, authorized = true) { return new Request('https://tsa.example.test/api/data-access/v1/operations', { method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); }
const run = (key, value = 2) => server.handleBusinessOperations(request({ action: 'run', operation: 'fixture_write', input: { body: { value } }, idempotencyKey: key }));
async function httpChecks() {
  assert.equal((await server.handleBusinessOperations(request({ action: 'catalog' }, false))).status, 401);
  const catalog = await (await server.handleBusinessOperations(request({ action: 'catalog' }))).json();
  assert.equal(catalog.data.operations.length, 3);
  assert.equal(calls, 0);
  assert.ok(!rpcCalls.includes('claim'), 'Catalog does not write an operation ledger');
  for (const code of ['UNAUTHORIZED', 'FORBIDDEN']) { denied = code; assert.equal((await run('denied-fixture')).status, code === 'UNAUTHORIZED' ? 401 : 403); }
  denied = null;
  assert.equal(calls, 0);
  const claimsBeforeInvalid = rpcCalls.filter(action => action === 'claim').length;
  assert.equal((await server.handleBusinessOperations(request({ action: 'run', operation: 'fixture_invalid_prepare', input: {}, idempotencyKey: 'invalid-request-fixture' }))).status, 400);
  assert.equal(rpcCalls.filter(action => action === 'claim').length, claimsBeforeInvalid, 'Invalid preparation cannot consume an operation key');
  assert.equal((await server.handleBusinessOperations(request({ action: 'run', operation: 'fixture_write', input: { body: { value: 2 } } }))).status, 400);
  assert.equal((await server.handleBusinessOperations(request({ action: 'run', operation: 'arbitrary_sql', input: {} }))).status, 400);
  let result = await (await run('success-fixture')).json();
  assert.equal(result.data.state, 'completed');
  assert.equal(calls, 1);
  assert.equal(result.data.result.body.reflected, '[redacted]');
  assert.equal(result.data.result.body.signed, '[redacted signed URL]');
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
  assert.equal((await (await run('success-fixture')).json()).data.operationId, result.data.operationId);
  assert.equal(calls, 1, 'Completed operations are never executed twice');
  assert.equal((await run('success-fixture', 3)).status, 409);
  assert.equal((await (await server.handleBusinessOperations(request({ action: 'status', idempotencyKey: 'success-fixture' }))).json()).data.state, 'completed');
  assert.equal((await server.handleBusinessOperations(request({ action: 'status', operationId: otherId }))).status, 404);
  releaseHandler = {};
  const pending = run('concurrent-fixture');
  for (let i = 0; i < 100 && !releaseHandler.resolve; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(releaseHandler.resolve);
  assert.equal((await (await run('concurrent-fixture')).json()).data.state, 'running');
  assert.equal(calls, 2, 'Concurrent same-key claims execute one handler');
  releaseHandler.resolve(); releaseHandler = null; await pending;
  throwHandler = true;
  result = await (await run('unknown-fixture')).json();
  assert.equal(result.data.state, 'unknown');
  assert.ok(!JSON.stringify(result).includes(token));
  throwHandler = false;
  await run('unknown-fixture'); assert.equal(calls, 3, 'Uncertain operations are never restarted');
  failFinish = true;
  assert.equal((await (await run('finish-failed-fixture')).json()).data.state, 'unknown');
  failFinish = false;
  await run('finish-failed-fixture'); assert.equal(calls, 4, 'A lost completion record does not replay a write');
  failHandler = true;
  result = await (await run('failed-fixture')).json();
  assert.equal(result.data.state, 'failed'); failHandler = false;
  assert.equal(result.data.result.body.prompt_summary, 'business summary');
  const capturedError = JSON.stringify(result.data.result);
  for (const secret of [...Object.values(syntheticEnvironment), unknownApiKey, unknownJwt, 'synthetic-upstream-bearer-value', 'synthetic-query-secret', 'synthetic-url-password', 'must-not-leak-prompt']) assert.ok(!capturedError.includes(secret), 'Existing handler errors must not expose credentials or full prompts');
  assert.deepEqual(ledger.get('failed-fixture').result, result.data.result, 'The ledger stores only the sanitized result');
  binary = true;
  result = await (await run('file-fixture')).json(); binary = false;
  assert.equal(result.data.result.file.filename, 'fixture.pdf');
  assert.equal(result.data.result.file.encoding, 'base64');
  assert.equal(result.data.result.file.sha256, crypto.createHash('sha256').update('synthetic file').digest('hex'));
  const before = ledger.size;
  const read = await (await server.handleBusinessOperations(request({ action: 'run', operation: 'fixture_read', input: {} }))).json();
  assert.equal(read.data.result.body.data, 'read'); assert.equal(ledger.size, before);
  throwRead = true;
  const readError = await (await server.handleBusinessOperations(request({ action: 'run', operation: 'fixture_read', input: {} }))).json();
  throwRead = false;
  assert.equal(readError.error.code, 'INVALID_INPUT');
  for (const secret of [...Object.values(syntheticEnvironment), unknownApiKey, unknownJwt, 'synthetic-query-secret']) assert.ok(!JSON.stringify(readError).includes(secret), 'Gateway error text must be sanitized too');
  const large = request({ action: 'catalog' }); large.headers.set('content-length', String(operationContracts.MAX_OPERATION_INPUT_BYTES + 1));
  assert.equal((await server.handleBusinessOperations(large)).status, 413);
  const file = contractChecks();
  const prepared = routeOperation({ name: 'fixture_upload', description: 'Upload', mutation: true, method: 'POST', pathname: '/api/recipe/[id]', schema: { type: 'object' }, load: async () => ({ POST: async (req, ctx) => {
    assert.equal((await ctx.params).id, connectionId);
    assert.equal((await req.formData()).get('file').name, 'fixture.csv');
    return Response.json({ ok: true });
  } }) }).prepare({ params: { id: connectionId }, files: [file] }, 'https://tsa.example.test');
  await prepared.execute({ request: prepared.request, actor: `data-access:${connectionId}`, connectionId });
  const escaped = routeOperation({ name: 'fixture_escaped', description: 'No forwarding', mutation: false, method: 'GET', pathname: '/api/recipe/fixture', schema: { type: 'object' }, load: async () => ({}), buildRequest: () => new Request('https://other.example/api/recipe/fixture') });
  assert.throws(() => escaped.prepare({}, 'https://tsa.example.test'));
  const emptyPost = routeOperation({ name: 'fixture_empty_post', description: 'JSON semantics', mutation: true, method: 'POST', pathname: '/api/recipe/fixture', schema: { type: 'object' }, load: async () => ({}) }).prepare({}, 'https://tsa.example.test');
  assert.deepEqual(await emptyPost.request.json(), {}, 'Bodyless business POSTs preserve the usual JSON request contract');
  session = null;
  assert.equal(context.hasBusinessOperationContext(), false);
  assert.equal((await auth.requireRecipeAdminRequest(new NextRequest('https://tsa.example.test/api/recipe/fixture', { headers: { 'x-data-access-connection': connectionId } }))).status, 401);
}
httpChecks().then(() => console.log('Business operation contracts, scoped context, at-most-once claims, uncertainty, files and redaction passed.')).catch(error => { console.error(error); process.exitCode = 1; });
