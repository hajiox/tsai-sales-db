const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
let db;
let fetched;
let providerCalls = 0;
let credentialNames = new Set();
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@/lib/ec-channel-lifecycle') return originalLoad.call(this, path.join(__dirname, '../lib/ec-channel-lifecycle.ts'), parent, isMain);
  if (request === '@supabase/supabase-js') return { createClient: () => db };
  if (request === '@/lib/csvHelpers') return { findBestMatchSimplified: () => null };
  if (request === '@/lib/sales-price-reconciliation') return { hasPackConflict: () => false };
  if (request === '@/lib/unitPriceHelper') return {
    getBulkProductUnitPrices: async (_client, ids) => new Map(ids.map(id => [id, { unit_price: 99999, unit_profit_rate: 10 }])),
  };
  if (request === './connectors' && parent.filename.endsWith(`${path.sep}sync.ts`)) return {
    fetchChannelSales: async () => { providerCalls++; if (fetched instanceof Error) throw fetched; return fetched; },
  };
  if (request.includes('finance-acquisition/credential-store')) return {
    getConfiguredApiCredentialNames: async () => credentialNames,
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { reconcileApiSales, isFullCalendarMonth } = require('../lib/web-sales-automation/sales-reconciliation.ts');
const { runChannelSync, rerunMappingFinalization } = require('../lib/web-sales-automation/sync.ts');
const { getChannelConfigStatusAsync } = require('../lib/web-sales-automation/config.ts');
const { SalesApiError, apiDeadline } = require('../lib/web-sales-automation/api-common.ts');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const period = { startDate: '2026-09-01', endDate: '2026-09-30', reportMonth: '2026-09-01' };
const metadata = { acquisitionPath: 'api', sourceBasis: 'official_orders', amountBasis: 'actual', reconciliationRequired: true };
function item(key, quantity, amount) {
  return { externalOrderId: key, externalLineId: '1', externalProductKey: key, externalProductName: key,
    occurredAt: '2026-09-01T00:00:00Z', quantity, amount, sourceStatus: 'complete', rawData: {} };
}
function fixture(summary = []) {
  const state = { runs: [], items: [], summary, calls: [], race: false };
  const client = {
    ...state,
    rpc: async (name, args) => { state.calls.push({ name, args }); return { error: state.race ? { message: 'baseline changed' } : null }; },
    from(table) {
      const query = { action: 'select', values: undefined, filters: {},
        select() { return this; }, insert(value) { this.action = 'insert'; this.values = value; return this; },
        update(value) { this.action = 'update'; this.values = value; return this; },
        delete() { this.action = 'delete'; return this; }, upsert() { this.action = 'upsert'; return this; },
        eq(key, value) { this.filters[key] = value; return this; }, order() { return this; }, limit() { return this; },
        range(start, end) { this.bounds = [start, end]; return this; },
        in() { return this; }, contains() { return this; },
        single() { return this.result(true); }, maybeSingle() { return this.result(true); },
        then(resolve, reject) { return Promise.resolve(this.result(false)).then(resolve, reject); },
        result(single) {
          if (table === 'web_sales_sync_runs') {
            if (this.action === 'insert') { state.runs.push({ ...this.values, id: `run-${state.runs.length}` }); return { data: state.runs.at(-1), error: null }; }
            const row = state.runs.find(run => run.id === this.filters.id) || state.runs.at(-1);
            if (this.action === 'update') Object.assign(row, this.values);
            return { data: single ? row : row ? [row] : [], error: null };
          }
          if (table === 'web_sales_sync_items') {
            if (this.action === 'insert') { state.items.push(...this.values); return { error: null }; }
            const rows = state.items.filter(row => row.run_id === this.filters.run_id);
            return { data: this.bounds ? rows.slice(this.bounds[0], this.bounds[1] + 1) : rows, error: null };
          }
          if (table === 'web_sales_summary') return { data: state.summary, error: null };
          if (table === 'web_sales_external_mappings') return { data: ['A', 'B'].map(key => ({ external_product_key: key, product_id: key })), error: null };
          if (table === 'products') return { data: ['A', 'B'].map(id => ({ id, name: id })), error: null };
          return { data: [], error: null };
        },
      };
      return query;
    },
  };
  return { state, client };
}
async function run(summary, items = [item('A', 2, 1234)], options = {}) {
  const fixtureDb = fixture(summary); db = fixtureDb.client;
  fetched = { items, metadata: options.metadata || metadata };
  if (options.error) fetched = options.error;
  fixtureDb.state.race = Boolean(options.race);
  const result = await runChannelSync('base', options.period || period, 'manual');
  return { result, ...fixtureDb };
}
async function main() {
  credentialNames = new Set(['BASE_CLIENT_ID', 'BASE_CLIENT_SECRET', 'BASE_REFRESH_TOKEN', 'BASE_REDIRECT_URI', 'BASE_SHOP_ID']);
  assert.equal((await getChannelConfigStatusAsync('base')).configured, true, 'managed credentials support setup without environment tokens');
  credentialNames.delete('BASE_SHOP_ID');
  assert.equal((await getChannelConfigStatusAsync('base')).configured, false, 'shop identity is required');
  credentialNames = new Set(['BASE_ACCESS_TOKEN', 'BASE_SHOP_ID']);
  assert.equal((await getChannelConfigStatusAsync('base')).configured, true, 'access-only API credential is supported with the same shop lock');
  credentialNames = new Set(['RAKUTEN_RMS_SERVICE_SECRET', 'RAKUTEN_RMS_LICENSE_KEY']);
  assert.equal((await getChannelConfigStatusAsync('rakuten')).configured, true, 'managed RMS credentials remain enabled');
  credentialNames = new Set(['AMAZON_SP_API_ACCESS_TOKEN', 'AMAZON_SP_API_SELLER_ID']);
  assert.equal((await getChannelConfigStatusAsync('amazon')).configured, true);
  credentialNames.delete('AMAZON_SP_API_SELLER_ID');
  assert.equal((await getChannelConfigStatusAsync('amazon')).configured, false);
  credentialNames = new Set(['YAHOO_SHOPPING_CLIENT_ID', 'YAHOO_SHOPPING_CLIENT_SECRET', 'YAHOO_SHOPPING_REFRESH_TOKEN', 'YAHOO_SHOPPING_ACCESS_TOKEN', 'YAHOO_SHOPPING_SELLER_ID']);
  const yahooStatus = await getChannelConfigStatusAsync('yahoo');
  assert.equal(yahooStatus.configured, false, 'Yahoo API acquisition remains disabled under the selected Bridge policy');
  assert.deepEqual(yahooStatus.missing, [], 'Bridge policy is not a missing-credential condition');
  db = fixture().client;
  const callsBeforeYahoo = providerCalls;
  assert.equal((await runChannelSync('yahoo', period, 'manual')).status, 'skipped', 'Direct legacy API sync cannot bypass Yahoo Bridge policy');
  assert.equal(providerCalls, callsBeforeYahoo, 'Yahoo Bridge policy must stop the provider call before collection');
  credentialNames = new Set(['BASE_ACCESS_TOKEN', 'BASE_SHOP_ID']);
  assert.equal(isFullCalendarMonth(period), true);
  assert.equal(isFullCalendarMonth({ ...period, endDate: '2026-09-15' }), false);
  assert.equal(isFullCalendarMonth({ startDate: '2028-02-01', endDate: '2028-02-29', reportMonth: '2028-02-01' }), true);
  const summary = [{ product_id: 'A', base_count: 2, base_amount: 1234 }];
  let result = await run(summary);
  assert.equal(result.result.status, 'success');
  assert.equal(result.state.calls[0].name, 'replace_verified_api_sales_summary');
  assert.equal(result.state.calls[0].args.p_rows[0].amount, 1234, 'catalog unit price cannot change official amount');
  assert.deepEqual(result.state.calls[0].args.p_expected_summary, [{ product_id: 'A', quantity: 2, amount: 1234 }]);
  assert.equal(result.state.runs[0].metadata.sourceBasis, metadata.sourceBasis, 'basis must survive finalization and retry');
  result = await run(summary, [item('A', 2, 1200)]);
  assert.equal(result.result.status, 'needs_review');
  assert.match(result.result.error, /total_mismatch/);
  assert.equal(result.state.calls.length, 0, 'different actual report totals cannot overwrite CSV');
  result = await run([{ product_id: 'A', base_count: 1, base_amount: 100 }, { product_id: 'B', base_count: 1, base_amount: 200 }],
    [item('A', 1, 200), item('B', 1, 100)]);
  assert.match(result.result.error, /product_mismatch/, 'equal grand totals cannot hide different products');
  assert.equal(result.state.calls.length, 0);
  result = await run([]);
  assert.match(result.result.error, /requires_verified_report/, 'order basis cannot be treated as aggregate-report parity in a new month');
  result = await run(summary, [item('A', 2, 1234)], { period: { ...period, endDate: '2026-09-15' } });
  assert.match(result.result.error, /partial_period_staged/);
  assert.equal(result.state.items.length, 1, 'partial API rows remain reviewable');
  assert.equal(result.state.calls.length, 0, 'partial API data never replaces the full monthly total');
  result = await run(summary, [item('A', 2, 1234)], { race: true });
  assert.equal(result.result.status, 'needs_review', 'transactional baseline rejection remains reviewable');
  result = await run(summary, [item('A', 2, 1234)], { metadata: { ...metadata,
    reviewReasonCodes: ['shop_coupon_allocation_requires_review'], unresolvedOrderCount: 1 } });
  assert.match(result.result.error, /semantic_review/);
  assert.equal(result.state.items.length, 1, 'verified partial lines are staged');
  assert.equal(result.state.calls.length, 0, 'unresolved coupon orders must block replacement even if remaining totals accidentally match');
  assert.equal((await rerunMappingFinalization(result.result.runId)).status, 'needs_review', 'mapping retry cannot erase semantic review markers');
  result = await run(summary, [item('A', 2, 1234)], { error: new SalesApiError('base', 'permission_required', 403) });
  assert.equal(result.result.status, 'needs_review');
  assert.equal(result.result.errorCode, 'permission_required', 'fixed auth failure code survives the sales outcome for operator-wait dispatch');
  assert.equal(result.state.calls.length, 0);
  result = await run(summary);
  result = await run([{ product_id: 'A', base_count: 1001, base_amount: 1001 }],
    Array.from({ length: 1001 }, (_, i) => ({ ...item('A', 1, 1), externalOrderId: `order-${i}` })));
  assert.equal(result.result.status, 'success', 'monthly orders must finalize all pages beyond the PostgREST 1000-row default');
  assert.equal(result.state.calls[0].args.p_rows[0].quantity, 1001);
  result = await run(summary);
  result.state.summary = [{ product_id: 'A', base_count: 2, base_amount: 1500 }];
  const retry = await rerunMappingFinalization(result.result.runId);
  assert.equal(retry.status, 'needs_review', 'mapping retry reloads original API basis and repeats reconciliation');
  assert.equal(result.state.calls.length, 1, 'retry cannot bypass comparison');
  assert.equal(reconcileApiSales('yahoo', new Map([['A', { quantity: 2, amount: 1234 }]]),
    [{ product_id: 'A', yahoo_count: 2, yahoo_amount: null }], false).code, 'saved_actual_amount_unverified');
  const clock = Date.now; let now = 0; Date.now = () => now;
  delete process.env.FINANCE_API_LOCAL_WORKER;
  const httpBudget = apiDeadline('yahoo'); now = 211000; assert.throws(httpBudget, /bounded_run/);
  process.env.FINANCE_API_LOCAL_WORKER = '1'; const localBudget = apiDeadline('yahoo'); now += 211000; localBudget();
  now += 4 * 60 * 60 * 1000; assert.throws(localBudget, /bounded_run/);
  Date.now = clock; delete process.env.FINANCE_API_LOCAL_WORKER;
  console.log('API sales reconciliation tests passed: managed credentials, actual amounts, per-product parity, partial staging, retries, transaction race and bounded local worker.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
