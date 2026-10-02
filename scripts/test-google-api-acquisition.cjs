const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const modules = new Map();
function loadTs(filename) {
  filename = path.resolve(__dirname, '..', filename);
  if (modules.has(filename)) return modules.get(filename).exports;
  const instance = new Module(filename, module);
  modules.set(filename, instance);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = instance.require.bind(instance);
  instance.require = id => id.startsWith('.') && fs.existsSync(path.resolve(path.dirname(filename), `${id}.ts`))
    ? loadTs(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)))
    : originalRequire(id);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
  return instance.exports;
}
const { normalizeGooglePerformance, prepareGoogleCostAllocation } = loadTs('lib/finance-acquisition/google-policy.ts');
const campaign = (id, name, date, micros, type = 'SEARCH') => ({ campaign: { id, name, advertisingChannelType: type, status: 'ENABLED' }, segments: { date }, metrics: { costMicros: String(micros), impressions: '10', clicks: '1' } });
const start = '2026-09-01', end = '2026-09-30';
assert.throws(() => normalizeGooglePerformance([campaign('1', 'A', '2026-08-31', 10)], [], new Map(), start, end), /対象期間/);
assert.throws(() => normalizeGooglePerformance([campaign('1', 'A', start, 10), campaign('2', 'A', end, 20)], [], new Map(), start, end), /同名/);
assert.throws(() => normalizeGooglePerformance([campaign('1', 'A', start, 10), campaign('1', 'A', start, 10)], [], new Map(), start, end), /重複/);
const pmax = campaign('1', 'P-MAX', start, 20_000_000, 'PERFORMANCE_MAX');
const asset = { ...pmax, assetGroup: { name: '麺', status: 'ENABLED' }, metrics: { costMicros: '10000000' } };
const normalized = normalizeGooglePerformance([pmax], [asset], new Map([['麺', 1]]), start, end);
assert.equal(normalized.reduce((sum, row) => sum + row.cost_micros, 0), 20_000_000, 'P-MAX residual must retain official campaign total');
assert.equal(prepareGoogleCostAllocation(normalized, new Map()).needsReview, true, 'Unmapped P-MAX residual is not silently assigned');
assert.throws(() => normalizeGooglePerformance([pmax], [{ ...asset, metrics: { costMicros: '21000000' } }], new Map(), start, end), /合計/);
const shopping = campaign('2', '標準ショッピング BASE 注文上位', start, 9_000_000, 'SHOPPING');
const mapped = campaign('3', '麺', start, 1_000_000);
const store = campaign('4', '食ブラ来店', start, 20_000_000);
const allocation = prepareGoogleCostAllocation(normalizeGooglePerformance([shopping, mapped, store], [], new Map([['麺', 1]]), start, end), new Map([[1, 3], [2, 1]]));
assert.deepEqual([...allocation.costs], [[1, 8], [2, 2]], 'Integer shared allocation preserves WEB cost and excludes physical-store ads');
assert.equal(allocation.classified.excludedStoreMicros, 20_000_000);

const { runGoogleAdvertisingAcquisition } = loadTs('lib/finance-acquisition/google.ts');
const names = ['GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'];
const priorEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;
for (const name of names) process.env[name] = name.includes('CUSTOMER_ID') ? '1234567890' : 'unit-test-placeholder';
function client(oldTotal, mappingRows) {
  const db = { advertising_costs: [{ series_code: 1, google_cost: oldTotal, meta_cost: 777 }], google_ads_series_mapping: mappingRows };
  let rpcCalls = 0;
  return {
    get rpcCalls() { return rpcCalls; }, db,
    from(table) {
      return { select() { return this; }, eq() { return this; }, gt() { return this; }, not() { return this; }, in() { return this; },
        then(resolve, reject) { return Promise.resolve({ data: db[table] || [], error: null }).then(resolve, reject); } };
    },
    async rpc(name, args) {
      assert.equal(name, 'apply_google_ads_api_acquisition');
      assert.equal(args.p_expected_existing_total, oldTotal);
      rpcCalls++;
      for (const row of db.advertising_costs) row.google_cost = args.p_cost_rows.find(cost => cost.series_code === row.series_code)?.google_cost || 0;
      return { data: {}, error: null };
    },
  };
}
let campaignPages = 0;
global.fetch = async (url, init) => {
  if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'unit-test-token' });
  const body = JSON.parse(init.body);
  if (body.query.includes('FROM customer')) return Response.json({ results: [{ customer: { currencyCode: 'JPY', timeZone: 'Asia/Tokyo' } }] });
  if (body.query.includes('FROM asset_group')) return Response.json({ results: [] });
  campaignPages++;
  if (body.pageToken) return Response.json({ results: [campaign('1', '麺', end, 60_000_000)] });
  return Response.json({ results: [campaign('1', '麺', start, 50_000_000)], nextPageToken: 'unit-test-page' });
};
(async () => {
  const period = { startDate: start, endDate: end, reportMonth: '2026-09' };
  const match = client(110, [{ asset_group_name: '麺', series_code: 1 }]);
  const saved = await runGoogleAdvertisingAcquisition(period, { supabase: match });
  assert.equal(saved.status, 'success');
  assert.equal(saved.totalCost, 110);
  assert.equal(saved.metadata.persisted, true);
  assert.equal(match.rpcCalls, 1);
  assert.equal(match.db.advertising_costs[0].meta_cost, 777, 'Google updates preserve the other advertising medium');
  assert.equal(campaignPages, 2, 'All official search pages must be retrieved');
  const mismatch = client(999, [{ asset_group_name: '麺', series_code: 1 }]);
  const guarded = await runGoogleAdvertisingAcquisition(period, { supabase: mismatch });
  assert.equal(guarded.status, 'needs_review');
  assert.equal(guarded.preservedExisting, true);
  assert.equal(mismatch.rpcCalls, 0, 'Different official amount cannot overwrite saved monthly amount');
  const unknown = client(110, []);
  assert.equal((await runGoogleAdvertisingAcquisition(period, { supabase: unknown })).status, 'needs_review');
  assert.equal(unknown.rpcCalls, 0);
  const dry = client(110, [{ asset_group_name: '麺', series_code: 1 }]);
  assert.equal((await runGoogleAdvertisingAcquisition(period, { supabase: dry, dryRun: true })).metadata.persisted, false);
  assert.equal(dry.rpcCalls, 0, 'Dry run must not persist performance or costs');
  await assert.rejects(() => runGoogleAdvertisingAcquisition({ ...period, endDate: '2026-09-15' }, { supabase: match }), /月初から月末/);
  console.log('Google API acquisition: pagination, P-MAX, shared allocation, saved-total guard, mapping, dry run and other-media preservation passed');
})().finally(() => {
  global.fetch = originalFetch;
  for (const name of names) priorEnv[name] === undefined ? delete process.env[name] : process.env[name] = priorEnv[name];
}).catch(error => { console.error(error.message); process.exitCode = 1; });
