const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sdk = require('@supabase/supabase-js');
const root = path.join(__dirname, '..');
function load(file, modules, windowValue = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'window', 'globalThis', code)(
    name => { if (!Object.hasOwn(modules, name)) throw new Error('Unexpected dependency: ' + name); return modules[name]; },
    mod, mod.exports,
    { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } },
    windowValue === "SSR" ? undefined : windowValue, {},
  );
  return mod.exports;
}
async function main() {
  let calls = 0;
  let session = { supabaseAccessToken: 'first-test-token' };
  let resolveSession;
  const auth = { getSession: options => {
    assert.equal(options.broadcast, false);
    calls++;
    return new Promise(resolve => { resolveSession = () => resolve(session); });
  } };
  const resolver = load('lib/supabase/nextauth-access-token.ts', { 'next-auth/react': auth });
  const a = resolver.getNextAuthSupabaseAccessToken();
  const b = resolver.getNextAuthSupabaseAccessToken();
  assert.equal(a, b, 'Concurrent requests share only the in-flight session read');
  assert.equal(calls, 1);
  resolveSession();
  assert.equal(await a, 'first-test-token');
  session = null;
  const signedOut = resolver.getNextAuthSupabaseAccessToken(); resolveSession();
  assert.equal(await signedOut, null, 'Logout does not retain an old bearer');
  session = { supabaseAccessToken: 'rotated-test-token' };
  const rotated = resolver.getNextAuthSupabaseAccessToken(); resolveSession();
  assert.equal(await rotated, 'rotated-test-token');
  const serverResolver = load('lib/supabase/nextauth-access-token.ts', { 'next-auth/react': { getSession: () => { throw new Error('SSR must not use browser session'); } } }, "SSR");
  assert.equal(await serverResolver.getNextAuthSupabaseAccessToken(), null);

  let currentToken = 'synthetic-first-bearer';
  const requests = [];
  const callback = async () => currentToken;
  const clientFactory = (url, key, options = {}) => sdk.createClient(url, key, {
    ...options,
    global: { fetch: async (url, options) => {
      const headers = new Headers(options.headers);
      requests.push({ url: String(url), authorization: headers.get('Authorization'), apikey: headers.get('apikey') });
      return Response.json([]);
    } },
  });
  const clients = load('lib/supabase.ts', {
    '@supabase/supabase-js': { createClient: clientFactory },
    './supabase/nextauth-access-token': { getNextAuthSupabaseAccessToken: callback },
  });
  await clients.supabase.from('recipes').select('id').limit(1);
  assert.equal(requests.at(-1).authorization, 'Bearer synthetic-first-bearer');
  assert.equal(requests.at(-1).apikey, 'public-test-key');
  currentToken = 'synthetic-rotated-bearer';
  await clients.supabase.from('ingredients').select('id').limit(1);
  assert.equal(requests.at(-1).authorization, 'Bearer synthetic-rotated-bearer', 'SDK reads the renewed token per request');
  currentToken = null;
  await clients.supabase.from('recipes').select('id').limit(1);
  assert.equal(requests.at(-1).authorization, 'Bearer public-test-key', 'Signed-out client has only the anonymous key, whose table access is revoked');
  const browser = load('lib/supabase/browser.ts', {
    '@supabase/ssr': { createBrowserClient: clientFactory },
    './nextauth-access-token': { getNextAuthSupabaseAccessToken: callback },
  });
  const first = browser.getSupabaseBrowserClient();
  assert.equal(first, browser.getSupabaseBrowserClient(), 'Existing browser singleton remains stable');
  currentToken = 'synthetic-browser-bearer';
  await first.from('web_sales_summary').select('id').limit(1);
  assert.equal(requests.at(-1).authorization, 'Bearer synthetic-browser-bearer');
  assert.throws(() => clients.createAuthenticatedSupabaseClient(''), /missing/);
  console.log('NextAuth Supabase client: session dedupe, logout, rotation, SSR and installed SDK Authorization checks passed');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
