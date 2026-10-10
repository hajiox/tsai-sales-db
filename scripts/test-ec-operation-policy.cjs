const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(relative, mocks = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }, exports);
  return exports;
}
const lifecycle = load('lib/ec-channel-lifecycle.ts');
const policy = load('lib/ec-operation-policy.ts', { './ec-channel-lifecycle': lifecycle });
const fixedNow = Date.now;
Date.now = () => Date.parse('2026-10-10T12:00:00+09:00');

async function main() {
  try {
    for (const task of ['web_sales_import', 'ad_cost_import', 'ec_profit_import']) {
      for (const channel of ['mercari', 'qoo10', 'tiktok', 'makeshop']) {
        assert.deepEqual(policy.inactiveEcJobTargets({ task_key: task, channel, start_date: '2026-09-01', end_date: '2026-09-30' }), [channel],
          'New external acquisition stays blocked even for a historical report month');
      }
    }
    for (const task of ['ec_price_update', 'ec_product_name_update', 'ec_product_content_update']) {
      const job = { task_key: task, parameters: { targets: ['amazon', 'qoo10', 'base'] } };
      const before = JSON.stringify(job);
      assert.deepEqual(policy.inactiveEcJobTargets(job), ['qoo10']);
      assert.equal(JSON.stringify(job), before, 'Locked targets must not be rewritten');
    }
    assert.deepEqual(policy.inactiveEcJobTargets({ task_key: 'ec_product_register', parameters: { target: 'qoo10' } }), ['qoo10']);
    for (const task of ['web_sales_analysis', 'recipe_reviews_analyze', 'recipe_sns_publish'])
      assert.deepEqual(policy.inactiveEcJobTargets({ task_key: task, channel: 'qoo10' }), [], 'Saved analysis and unrelated work stay available');
    assert.deepEqual(policy.inactiveEcOperationTargets(['amazon', 'rakuten', 'yahoo', 'base', 'google', 'meta']), []);
    assert.deepEqual(policy.inactiveEcOperationTargets(['qoo10', 'qoo10']), ['qoo10']);

    // An old durable queued job must not leave the server for an EC operation.
    const queued = [
      { id: 'closed', task_key: 'web_sales_import', channel: 'qoo10' },
      { id: 'mixed', task_key: 'ec_price_update', parameters: { targets: ['amazon', 'mercari'] } },
      { id: 'allowed', task_key: 'web_sales_import', channel: 'base' },
    ];
    const mutations = [];
    let existing = null;
    const client = {
      from(table) {
        let operation = 'read', value = null;
        const filters = {};
        const query = {
          select() { return query; }, eq(key, val) { filters[key] = val; return query; },
          update(val) { operation = 'update'; value = val; return query; },
          upsert(val) { mutations.push({ table, operation: 'upsert', value: val }); return query; },
          insert(val) { mutations.push({ table, operation: 'insert', value: val }); return query; },
          async maybeSingle() {
            if (operation === 'update') { mutations.push({ table, operation, value, filters }); return { data: { id: filters.id }, error: null }; }
            return { data: table === 'web_sales_codex_workers' ? existing : { status: 'running', lease_expires_at: '2099-01-01T00:00:00Z' }, error: null };
          },
          then(resolve, reject) {
            if (operation === 'update') mutations.push({ table, operation, value, filters });
            return Promise.resolve({ error: null }).then(resolve, reject);
          },
        };
        return query;
      },
      async rpc() { return { data: queued.length ? [queued.shift()] : [], error: null }; },
    };
    const route = load('app/api/web-sales/codex-bridge/claim/route.ts', {
      'next/server': { NextResponse: { json: (body, options) => ({ body, options }) } },
      '@/lib/ec-operation-policy': policy,
      '@/lib/web-sales-automation/sync': { getWebSalesAutomationServiceClient: () => client },
      '@/lib/web-sales-codex/server': { isCodexBridgeAuthorized: () => true, normalizeWorkerId: x => x },
      '@/lib/web-sales-codex/bridge-version': { isRetiredLegacyTsaCodexBridge: () => false, REQUIRED_TSA_CODEX_BRIDGE_VERSION: 'test' },
    });
    const request = { json: async () => ({ workerId: 'worker', version: 'test' }) };
    const response = await route.POST(request);
    assert.equal(response.body.job.id, 'allowed');
    const cancelled = mutations.filter(x => x.table === 'web_sales_codex_jobs');
    assert.deepEqual(cancelled.map(x => x.filters.id), ['closed', 'mixed']);
    assert.ok(cancelled.every(x => x.value.status === 'cancelled' && x.filters.status === 'running' && x.filters.worker_id === 'worker'));
    assert.equal(mutations.filter(x => x.table === 'web_sales_codex_job_events').length, 2, 'Blocked jobs retain an audit event');
    assert.equal(mutations.at(-1).value.current_job_id, 'allowed');

    mutations.length = 0;
    assert.equal((await route.POST(request)).body.job, null);
    assert.equal(mutations.at(-1).value.status, 'online');
    existing = { current_job_id: 'active-sns' };
    mutations.length = 0;
    assert.equal((await route.POST(request)).body.busy, true);
    assert.equal(mutations.length, 0, 'An existing running worker is never interrupted');
    console.log('EC operation policy: retired acquisition, immutable targets, durable queue guard and busy-worker preservation passed.');
  } finally { Date.now = fixedNow; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
