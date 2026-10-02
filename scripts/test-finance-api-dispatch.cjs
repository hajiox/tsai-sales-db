const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
let db;
let salesOutcome;
let savedBridgeJobs = [];
let previousApiRun;
let savedSalesRun;
const salesFilters = [];
let inserted = 0;
let salesCalls = 0;
let officialFinanceCalls = 0;
let bridgeAllowed = false;
const bridgeCalls = [];
let configuredCapabilities = [{ kind: 'sales', channel: 'yahoo', preferred_route: 'api', api_ready: true }];
const writes = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../web-sales-automation/sync' && parent.filename.endsWith(`${path.sep}dispatch.ts`)) return {
    getWebSalesAutomationServiceClient: () => db,
    runChannelSync: async () => { salesCalls++; return salesOutcome; },
  };
  if (request === '../web-sales-codex/server') return { enqueueCodexJobs: async (input) => {
    if (!bridgeAllowed) throw new Error('Unexpected Bridge enqueue');
    bridgeCalls.push(input); return [{ id: 'bridge-run', ...input }];
  } };
  if (request === './capabilities') return { getFinanceCapabilities: async () => configuredCapabilities };
  if (request === './run' && parent.filename.endsWith(`${path.sep}dispatch.ts`)) return { runOfficialFinanceAcquisition: async () => {
    officialFinanceCalls++; throw new Error('Unexpected finance acquisition');
  } };
  return originalLoad.call(this, request, parent, isMain);
};
const { enqueueFinanceAcquisitions, executeAcquisitionRun } = require('../lib/finance-acquisition/dispatch.ts');
const period = { startDate: '2026-09-01', endDate: '2026-09-30', reportMonth: '2026-09-01' };
const queuedRow = { id: 'api-run', kind: 'sales', channel: 'yahoo', status: 'queued', route: 'api',
  period_start: period.startDate, period_end: period.endDate, report_month: period.reportMonth, result: {} };
db = { from(table) {
  const query = { action: 'select', fields: '', values: undefined,
    select(fields) { this.fields = fields; return this; }, eq(field, value) {
      if (table === 'web_sales_sync_runs') salesFilters.push([field, value]); return this;
    }, lte() { return this; }, gte() { return this; },
    not(field, operator, value) { assert.deepEqual([field, operator, value], ['completed_at', 'is', null]); return this; },
    in() { return this; }, order() { return this; }, limit() { return this; },
    update(values) { this.action = 'update'; this.values = values; return this; },
    insert(values) { this.action = 'insert'; this.values = values; inserted++; return this; },
    single() { return this.result(true); }, maybeSingle() { return this.result(true); },
    then(resolve, reject) { return Promise.resolve(this.result(false)).then(resolve, reject); },
    result(single) {
      if (table === 'web_sales_codex_jobs') return { data: single ? null : savedBridgeJobs, error: null };
      if (table === 'web_sales_sync_runs') return { data: savedSalesRun || null, error: null };
      assert.equal(table, 'web_sales_acquisition_runs');
      if (this.action === 'update') { writes.push(this.values); return { data: this.fields === 'id' ? { id: 'api-run' } : null, error: null }; }
      if (this.action === 'insert') return { data: { id: 'new-api-run' }, error: null };
      return { data: this.fields === '*' ? queuedRow : previousApiRun || null, error: null };
    },
  }; return query;
} };
function outcome(code) {
  return { runId: 'sales-run', channel: 'yahoo', status: 'needs_review', itemCount: 0, quantityTotal: 0,
    matchedCount: 0, unmatchedCount: 0, error: `yahoo: API ${code}`, errorCode: code };
}
async function main() {
  for (const code of ['authentication_required', 'permission_required', 'account_verification_required', 'required_credentials',
    'source_ip_not_allowed', 'business_id_not_registered', 'seller_not_allowed', 'order_api_not_approved']) {
    writes.length = 0; salesOutcome = outcome(code);
    const result = await executeAcquisitionRun('api-run');
    assert.equal(result.status, 'waiting_for_user', `${code} must remain an operator wait instead of a completed/reviewable data result`);
    assert.equal(writes.at(-1).status, 'waiting_for_user');
    assert.equal(writes.at(-1).result.errorCode, code);
    assert.equal(writes.at(-1).result.persisted, false);
  }
  salesOutcome = outcome('shop_coupon_allocation_requires_review');
  assert.equal((await executeAcquisitionRun('api-run')).status, 'needs_review', 'coupon ambiguity remains semantic review, not a login wait');
  salesOutcome = { ...outcome('connection_or_timeout'), status: 'failed' };
  assert.equal((await executeAcquisitionRun('api-run')).status, 'failed');
  salesOutcome = { ...outcome('unused'), status: 'success', error: undefined, errorCode: undefined, itemCount: 10 };
  assert.equal((await executeAcquisitionRun('api-run')).status, 'completed');
  assert.equal(writes.at(-1).result.persisted, true);
  savedBridgeJobs = [
    { task_key: 'web_sales_import', status: 'failed', created_at: '2026-10-02T00:00:00Z', result: {} },
    { task_key: 'web_sales_import', status: 'completed', created_at: '2026-10-01T00:00:00Z', result: {} },
  ];
  inserted = 0;
  const saved = await enqueueFinanceAcquisitions({ kind: 'sales', channels: ['yahoo'], period, incompleteOnly: true, allowBridge: true });
  assert.equal(saved.results[0].status, 'skipped', 'later failed retry cannot hide an earlier completed same-period sales import');
  assert.equal(inserted, 0);
  savedBridgeJobs = [{ task_key: 'web_sales_import', status: 'failed', created_at: '2026-10-02T00:00:00Z', result: {} }];
  const missing = await enqueueFinanceAcquisitions({ kind: 'sales', channels: ['yahoo'], period, incompleteOnly: true, allowBridge: true });
  assert.equal(missing.results[0].status, 'queued', 'a truly incomplete sales period can still be acquired');
  assert.equal(inserted, 1);
  savedSalesRun = { id: 'verified-csv-run' };
  salesFilters.length = 0;
  const csvPreserved = await enqueueFinanceAcquisitions({ kind: 'sales', channels: ['yahoo'], period, incompleteOnly: true });
  assert.equal(csvPreserved.results[0].status, 'skipped', 'same-period successful saved CSV/API result is preserved regardless of later Bridge failures');
  assert.equal(inserted, 1);
  assert.deepEqual(salesFilters, [['channel', 'yahoo'], ['period_start', period.startDate], ['period_end', period.endDate], ['status', 'success']],
    'only the locked channel and identical completed period may suppress acquisition');
  const explicitReconciliation = await enqueueFinanceAcquisitions({ kind: 'sales', channels: ['yahoo'], period, incompleteOnly: false });
  assert.equal(explicitReconciliation.results[0].status, 'queued', 'explicit new API reconciliation is still allowed for a saved CSV period');
  assert.equal(inserted, 2);
  savedSalesRun = undefined;
  previousApiRun = { id: 'api-wait', status: 'waiting_for_user', result: { persisted: false } };
  const waiting = await enqueueFinanceAcquisitions({ kind: 'sales', channels: ['yahoo'], period, triggerType: 'scheduled_previous_month' });
  assert.equal(waiting.results[0].status, 'waiting_for_user', 'scheduled acquisition must preserve operator wait');
  assert.equal(inserted, 2);
  configuredCapabilities = ['sales', 'ec_profit', 'advertising'].map(kind => ({ kind, channel: 'yahoo', preferred_route: 'bridge',
    api_ready: false, api_disabled_by_policy: true, reason: 'Yahoo!はBridgeで取得します' }));
  bridgeAllowed = true;
  const insertedBeforePolicy = inserted;
  for (const [kind, taskKey] of [['sales', 'web_sales_import'], ['ec_profit', 'ec_profit_import'], ['advertising', 'ad_cost_import']]) {
    const selectedBridge = await enqueueFinanceAcquisitions({ kind, channels: ['yahoo'], period, allowBridge: true });
    assert.equal(selectedBridge.results[0].route, 'bridge');
    assert.equal(selectedBridge.results[0].status, 'queued');
    assert.equal(selectedBridge.jobs.length, 1);
    assert.deepEqual(bridgeCalls.at(-1), { taskKey, channels: ['yahoo'], startDate: period.startDate, endDate: period.endDate,
      triggerType: 'manual', requestedBy: undefined, idempotencyPrefix: undefined }, 'The Bridge job must keep the locked kind, channel and period');
    assert.equal(inserted, insertedBeforePolicy, 'Yahoo Bridge selection must not enqueue API acquisition');
    const bridgeCallsBefore = bridgeCalls.length;
    const withheld = await enqueueFinanceAcquisitions({ kind, channels: ['yahoo'], period, allowBridge: false });
    assert.equal(withheld.jobs.length, 0, 'Bridge cannot launch when its caller disallows Bridge');
    assert.equal(bridgeCalls.length, bridgeCallsBefore);
    assert.equal(inserted, insertedBeforePolicy, 'Disallowed Bridge must not silently fall back to Yahoo API');
  }
  const salesCallsBeforePolicy = salesCalls;
  const officialFinanceCallsBeforePolicy = officialFinanceCalls;
  for (const kind of ['sales', 'ec_profit', 'advertising']) {
    queuedRow.kind = kind;
    writes.length = 0;
    const abandoned = await executeAcquisitionRun('api-run');
    assert.equal(abandoned.status, 'skipped', 'An old queued Yahoo API run is terminalized after explicit Bridge selection');
    assert.equal(abandoned.persisted, false);
    assert.equal(writes.at(-1).status, 'skipped');
    assert.equal(writes.at(-1).result.persisted, false);
    assert.equal(salesCalls, salesCallsBeforePolicy, 'Stale queued Yahoo sales must not call the API provider');
    assert.equal(officialFinanceCalls, officialFinanceCallsBeforePolicy, 'Stale queued Yahoo costs must not call a finance API provider');
  }
  await assert.rejects(enqueueFinanceAcquisitions({kind:'sales',channels:['yahoo'],period:{startDate:'2099-01-01',endDate:'2099-01-31',reportMonth:'2099-01-01'}}), /未来の期間/, 'future periods cannot be saved as empty completed results');
  console.log('Finance dispatch regression tests passed: auth waits, actual persistence, retry prevention, Yahoo Bridge selection and abandoned API runs.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
