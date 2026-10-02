const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const root = path.resolve(__dirname, '..');
let admin = true;
const queueCalls = [];
const financeCalls = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'next/server') return {
    NextRequest: Request, NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status || 200 }) },
  };
  if (request === '@/lib/finance-acquisition/auth') return {
    isFinanceAdmin: async () => admin,
    isSameOriginFinanceRequest: request => !request.headers.get('origin') || request.headers.get('origin') === new URL(request.url).origin,
  };
  if (request === '@/lib/finance-acquisition/dispatch') return {
    enqueueFinanceAcquisitions: async input => { queueCalls.push(input); return {
      ok: true, jobs: [], results: input.channels.map(channel => ({ channel, route: 'api', status: 'queued' })),
    }; },
  };
  if (request === '@/lib/finance-acquisition/run') return {
    runOfficialFinanceAcquisition: async (...args) => { financeCalls.push(args); return {
      status: 'success', coverageLevel: 'complete', importedCount: 2, source: 'Google Ads API',
      details: 'Official Google amount verified', warnings: [], totalCost: 1234, unmatchedCount: 0,
    }; },
  };
  if (request === '@/lib/web-sales-automation/sync') return {
    getWebSalesAutomationServiceClient: () => ({ from: table => {
      const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        single: async () => ({ data: { id: 'job-1', task_key: 'ad_cost_import', channel: 'google', status: 'running', worker_id: 'pc-1',
          period_start: '2026-09-01', period_end: '2026-09-30', report_month: '2026-09-01' }, error: null }),
        then: resolve => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      assert.ok(['ec_profit_monthly', 'web_sales_codex_jobs'].includes(table)); return query;
    } }),
  };
  if (request === '@/lib/web-sales-codex/ec-profit-estimate') return { upsertEcProfitEstimate: async () => ({ status: 'estimated' }) };
  if (request === '@/lib/web-sales-codex/server') return { isCodexBridgeAuthorized: () => true, normalizeWorkerId: value => value };
  if (request === '@supabase/supabase-js') return { createClient: () => ({}) };
  if (request.startsWith('@/app/api/')) return { POST: async () => { throw new Error('Internal job must not bypass public handler auth'); } };
  if (request.startsWith('@/')) return originalLoad.call(this, path.join(root, request.slice(2)) + '.ts', parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
process.env.CRON_SECRET = 'test-only-cron';
const cron = require('../app/api/cron/web-sales-sync/route.ts');
const manual = require('../app/api/web-sales/automation/run/route.ts');
const googleSync = require('../app/api/google-ads/sync/route.ts');
const googleCosts = require('../app/api/google-ads/import-costs/route.ts');
const bridge = require('../app/api/web-sales/codex-bridge/jobs/[id]/ad-import/route.ts');
function post(body, origin = 'https://tsa.example') {
  return new Request('https://tsa.example/api/web-sales/automation/run', { method: 'POST', headers: { origin }, body: JSON.stringify(body) });
}
async function main() {
  admin = false;
  for (const handler of [manual.POST, googleSync.POST, googleCosts.POST]) assert.equal((await handler(post({}))).status, 401);
  assert.equal(queueCalls.length, 0, 'unauthenticated legacy entrypoints cannot acquire or write');
  admin = true;
  for (const handler of [manual.POST, googleSync.POST, googleCosts.POST]) assert.equal((await handler(post({}, 'https://other.example'))).status, 403);
  assert.equal(queueCalls.length, 0);
  let response = await manual.POST(post({ startDate: '2026-09-01', endDate: '2026-09-30', channels: ['amazon', 'yahoo', 'qoo10', 'tiktok'] }));
  assert.equal(response.status, 200);
  assert.deepEqual(queueCalls[0].channels, ['amazon', 'yahoo'], 'closed ECs cannot launch new acquisition');
  assert.equal(queueCalls[0].kind, 'sales');
  assert.equal(queueCalls[0].allowBridge, true);
  assert.equal(queueCalls[0].period.reportMonth, '2026-09-01');
  queueCalls.length = 0;
  response = await cron.GET(new Request('https://tsa.example/api/cron/web-sales-sync?force=1&startDate=2026-09-01&endDate=2026-09-30'));
  assert.equal(response.status, 401);
  response = await cron.GET(new Request('https://tsa.example/api/cron/web-sales-sync?force=1&startDate=2026-09-01&endDate=2026-09-30', { headers: { authorization: 'Bearer test-only-cron' } }));
  assert.equal(response.status, 200);
  assert.deepEqual(queueCalls.map(call => call.kind).sort(), ['advertising', 'ec_profit', 'sales']);
  assert.deepEqual(queueCalls.find(call => call.kind === 'sales').channels, ['amazon', 'rakuten', 'yahoo', 'base']);
  assert.ok(queueCalls.every(call => call.period.reportMonth === '2026-09-01'));
  assert.ok(queueCalls.every(call => call.triggerType === 'scheduled_previous_month'));
  queueCalls.length = 0;
  delete process.env.WEB_SALES_AUTO_ACQUISITION_ENABLED;
  const paused = await cron.GET(new Request('https://tsa.example/api/cron/web-sales-sync', { headers: { authorization: 'Bearer test-only-cron' } }));
  assert.match((await paused.json()).reason, /停止中/);
  assert.equal(queueCalls.length, 0, 'paused schedules cannot be restored by the API queue worker');
  process.env.WEB_SALES_AUTO_ACQUISITION_ENABLED = 'true';
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-10-16T00:00:00Z');
  await cron.GET(new Request('https://tsa.example/api/cron/web-sales-sync', { headers: { authorization: 'Bearer test-only-cron' } }));
  Date.now = originalNow;
  assert.equal(queueCalls.length, 1, '16th snapshot must not also acquire previous-month settlement');
  assert.equal(queueCalls[0].kind, 'sales');
  assert.equal(queueCalls[0].period.endDate, '2026-10-15');
  const form = new FormData(); form.set('workerId', 'pc-1');
  const imported = await bridge.POST(new Request('https://tsa.example/api/bridge/ad-import', { method: 'POST', body: form }), { params: Promise.resolve({ id: 'job-1' }) });
  assert.equal(imported.status, 200);
  const result = await imported.json();
  assert.equal(result.status, 'completed'); assert.equal(result.totalCost, 1234); assert.equal(result.acquisitionPath, 'api');
  assert.equal(financeCalls.length, 1, 'authorized locked Bridge Google task uses the same validated service as API acquisition');
  assert.deepEqual(financeCalls[0].slice(0, 2), ['advertising', 'google']);
  console.log('Finance routing tests passed: legacy auth/origin, API-first cron/manual, active EC exclusions, half-month schedule and locked Google Bridge import.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
