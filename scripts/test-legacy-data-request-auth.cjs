const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const origin = 'https://tsa.example.test';
let session = null;
let databaseCalls = 0;
let inputReads = 0;
const client = new Proxy({}, { get: () => () => { databaseCalls++; throw new Error('Database sentinel'); } });
function load(file, additional = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'console', code)(name => {
    if (Object.hasOwn(additional, name)) return additional[name];
    if (name === 'next/server') return { NextResponse: Response };
    if (name === 'next-auth') return { getServerSession: async () => session };
    if (name === '@/app/api/auth/[...nextauth]/route') return { authOptions: {} };
    if (name === '@supabase/supabase-js') return { createClient: () => client };
    if (name === '@/lib/recipe-data-server') return { createRecipeDataAdminClient: () => client };
    if (name === '@/lib/db') return { pool: { connect: () => { databaseCalls++; throw new Error('Database sentinel'); } } };
    if (name === '@google/generative-ai') return { GoogleGenerativeAI: class {} };
    if (name === '@vercel/blob') return { put: () => { throw new Error('Unexpected upload'); } };
    if (name === '@/app/kpi/actions') return { getKpiSummary: () => { databaseCalls++; throw new Error('Database sentinel'); } };
    if (name.startsWith('@/lib/')) return {};
    throw new Error('Unexpected dependency: ' + name);
  }, mod, mod.exports, { env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-test-key',
  } }, { log() {}, error() {}, warn() {} });
  return mod.exports;
}
const auth = load('lib/recipe-request-auth.ts');
function request(method, headers = {}) {
  const req = new Request(origin + '/api/test', { method, headers });
  req.json = req.formData = async () => { inputReads++; throw new Error('Input sentinel'); };
  return req;
}
const routes = ['import/amazon','import/csv-confirm','import/register','label/analyze','label/update','label/upload-images','products/delete','products-master','quote/analyze','quote/update','report/amazon','series','setup-kpi','test-kpi','verify/amazon-sales','verify/rakuten-sales','verify/yahoo-sales','web-sales/channel-delete','web-sales-analyze','web-sales-data','web-sales-period'];
async function main() {
  let handlers = 0;
  for (const route of routes) {
    const exported = load('app/api/' + route + '/route.ts', { '@/lib/recipe-request-auth': auth });
    for (const [method, handler] of Object.entries(exported)) {
      if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(method)) continue;
      if (route === 'series' && method === 'GET') continue; // Public series names contain no protected data.
      if (route === 'setup-kpi' && method === 'GET') {
        for (const identity of [null, { user: { email: 'aizubrandhall@gmail.com' } }]) {
          session = identity; const before = databaseCalls;
          const response = await handler(request('GET', { origin: 'https://other.example.test' }));
          assert.equal(response.status, 405);
          assert.equal(response.headers.get('Allow'), 'POST');
          assert.equal(databaseCalls, before, 'DDL must never execute via GET');
        }
        continue;
      }
      handlers++;
      for (const identity of [null, { user: { email: 'other@example.test' } }]) {
        session = identity;
        const before = { databaseCalls, inputReads };
        const response = await handler(request(method, { origin }));
        assert.equal(response.status, identity ? 403 : 401, route + ' ' + method);
        assert.deepEqual({ databaseCalls, inputReads }, before, 'Rejected request must not read inputs or touch DB');
      }
      session = { user: { email: 'aizubrandhall@gmail.com' } };
      if (method !== 'GET') {
        const before = { databaseCalls, inputReads };
        assert.equal((await handler(request(method, { origin: 'https://other.example.test' }))).status, 403);
        assert.deepEqual({ databaseCalls, inputReads }, before, 'Cross-origin write must stop before DB and body');
      }
      // Authorized callers reach the existing validation/business code with synthetic inputs only.
      try {
        const response = await handler(request(method, { origin }));
        assert.ok(![401, 403].includes(response.status), 'Existing same-origin admin caller remains authorized');
      } catch (error) {
        assert.match(error.message, /sentinel/, 'Only synthetic business dependencies may abort an authorized call');
      }
    }
  }
  assert.equal(handlers, 26);
  console.log('Legacy data API guards: ' + routes.length + ' routes / ' + handlers + ' handlers; anonymous, wrong account, origin and read-only GET checks passed');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
