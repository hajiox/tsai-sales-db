const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(relative, aliases = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = instance.require.bind(instance);
  instance.require = id => Object.hasOwn(aliases, id) ? aliases[id] : originalRequire(id);
  instance._compile(compiled, filename);
  return instance.exports;
}

const amounts = loadTs('lib/web-sales-amounts.ts');
const productSummary = loadTs('lib/web-sales-product-summary.ts', { './web-sales-amounts': amounts });
const build = productSummary.buildWebSalesProductSummary;
const empty = Object.fromEntries(amounts.WEB_SALES_CHANNELS.map(channel => [`${channel}_count`, 0]));
const sale = (product_id, report_month, fields) => ({ ...empty, product_id, report_month, ...fields });
const products = [
  { id: 'same-a', name: '同名商品', series_code: 1, series: '共通名' },
  { id: 'same-b', name: '同名商品', series_code: 2, series: '共通名' },
  { id: 'same-code', name: '別の商品', series_code: '1', series: '別名' },
  { id: 'zero', name: '無料商品', series_code: 3, series: 'ゼロ' },
  { id: 'unknown', name: '未取得商品', series_code: 4, series: '未取得' },
  { id: 'amount-only', name: '金額のみ', series_code: 5, series: '金額のみ' },
  { id: 'invalid-code', name: '未分類商品', series_code: 'invalid', series: null },
  { id: 'ads-only', name: '広告のみ商品', series_code: 99, series: '広告だけ' },
];
const rows = [
  sale('same-a', '2025-10-01', { amazon_count: 50, amazon_amount: 5000 }),
  sale('same-a', '2025-11-01', { amazon_count: 1, amazon_amount: 20 }),
  sale('same-a', '2025-12-01', { amazon_count: 3, amazon_amount: 98.25 }),
  sale('same-a', '2026-01-01', { amazon_count: 2, amazon_amount: 101.75, unit_price: 99999 }),
  sale('same-a', '2026-02-01', { amazon_count: 60, amazon_amount: 6000 }),
  sale('same-b', '2026-01-01', { yahoo_count: 1, yahoo_amount: 50 }),
  sale('same-code', '2026-01-01', { base_count: 1, base_amount: 30 }),
  sale('zero', '2026-01-01', { amazon_count: 2, amazon_amount: 0 }),
  sale('unknown', '2025-12-01', { yahoo_count: 1, yahoo_amount: 90 }),
  sale('unknown', '2026-01-01', { yahoo_count: 1, yahoo_amount: null, unit_price: 99999 }),
  sale('amount-only', '2026-01-01', { amazon_count: 0, amazon_amount: 12.75 }),
  sale('invalid-code', '2026-01-01', { amazon_count: 1, amazon_amount: 8 }),
  sale('missing-master', '2026-01-01', { amazon_count: 1, amazon_amount: 7 }),
];
const master = new Map(products.map(product => [product.id, product]));
const january = rows.filter(row => row.report_month === '2026-01-01');
const before = structuredClone({ products, rows });
const monthlyProducts = build(january, master, 'month');
const monthly = new Map(monthlyProducts.map(product => [product.productId, product]));
assert.equal(monthly.get('same-a').count, 2);
assert.equal(monthly.get('same-a').sales, 101.75, 'saved revenue stays precise and is never price times count');
assert.equal(monthly.get('same-b').sales, 50, 'same product names do not merge different product IDs');
assert.equal(monthly.get('same-code').seriesCode, 1, 'numeric saved series codes match monthly grouping');
assert.equal(monthly.get('zero').sales, 0, 'a sold product may have an explicitly recorded zero');
assert.equal(monthly.get('unknown').sales, null, 'sold revenue not yet acquired stays unknown');
assert.equal(monthly.get('amount-only').sales, 0, 'monthly summary excludes channels with zero count');
assert.equal(monthly.get('invalid-code').seriesCode, null);
assert.equal(monthly.get('missing-master').productName, '商品名未登録');
assert.equal(monthly.get('missing-master').seriesName, '未分類');
assert.equal(monthly.get('missing-master').seriesCode, null);
const periodProducts = new Map(build(rows.filter(row => row.report_month >= '2025-11-01' && row.report_month <= '2026-01-01'), master, 'period').map(product => [product.productId, product]));
assert.equal(periodProducts.get('same-a').count, 6);
assert.equal(periodProducts.get('same-a').sales, 220, 'the same product is summed across the selected months');
assert.equal(periodProducts.get('unknown').sales, null, 'one missing month invalidates that product total, not just that row');
assert.equal(periodProducts.get('amount-only').sales, 12.75, 'period scope preserves its existing all-channel amount basis');
assert.deepEqual(build([], master, 'period'), []);
assert.deepEqual({ products, rows }, before, 'summary construction is read-only');

// Exercise the actual API attachments with an in-memory read-only query contract.
const tables = {
  products,
  web_sales_summary: rows,
  ec_profit_monthly: [],
  advertising_costs: [{ report_month: '2026-01-01', series_code: 99, google_cost: 5 }],
  web_sales_codex_jobs: [],
};
const queryCalls = [];
const db = { from(table) {
  queryCalls.push(table);
  let selected = [...(tables[table] || [])];
  let columns = '*';
  const chain = {
    select(value) { columns = value; return chain; },
    eq(key, value) { selected = selected.filter(row => row[key] === value); return chain; },
    in(key, values) { selected = selected.filter(row => values.includes(row[key])); return chain; },
    gte(key, value) { selected = selected.filter(row => row[key] >= value); return chain; },
    lte(key, value) { selected = selected.filter(row => row[key] <= value); return chain; },
    order() { return chain; },
    range(start, end) { selected = selected.slice(start, end + 1); return chain; },
    then(resolve, reject) {
      const data = selected.map(row => columns === '*' ? { ...row } : Object.fromEntries(columns.split(',').map(key => [key, row[key]])));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return chain;
} };
let authorized = true;
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
const aliases = {
  'next/server': next,
  '@/lib/web-sales-amounts': amounts,
  '@/lib/web-sales-product-summary': productSummary,
  '@/lib/web-sales-automation/sync': { getWebSalesAutomationServiceClient: () => db },
  '@/lib/data-access/business-operation-context': {
    getBusinessAdminSession: async () => authorized ? { user: { email: 'admin@example.invalid' } } : null,
    isBusinessAdminSession: session => Boolean(session),
  },
  '@/lib/web-sales-codex/ec-profit-retry': { isQoo10SettledDetailUnavailable: () => false },
  '@/lib/web-sales-codex/finance-job-state': { selectEffectiveFinanceJob: () => null },
  '@/lib/recipe-request-auth': { requireRecipeAdminRequest: async () => authorized ? null : next.NextResponse.json({ error: 'login required' }, { status: 401 }) },
  '@supabase/supabase-js': { createClient: () => db },
};
const request = (month, length) => new Request('https://example.invalid/api/web-sales-period', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_month: month, period_months: length }),
});
async function verifyApiAttachments() {
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    // Fixture-only values; no database or network connection is created.
    for (const key of keys) process.env[key] = 'fixture-only';
    const monthApi = loadTs('app/api/web-sales/ec-profit/route.ts', aliases);
    const periodApi = loadTs('app/api/web-sales-period/route.ts', aliases);
    const result = await monthApi.GET(new Request('https://example.invalid/api/web-sales/ec-profit?month=2026-01'));
    assert.equal(result.status, 200);
    const byCode = new Map(result.body.series.map(series => [series.seriesCode, series]));
    assert.deepEqual(byCode.get(1).products.map(product => product.productId).sort(), ['same-a', 'same-code'], 'monthly attachment follows series code even when names differ');
    assert.deepEqual(byCode.get(2).products.map(product => product.productId), ['same-b'], 'identical series names with different codes remain separate in month scope');
    assert.deepEqual(byCode.get(null).products.map(product => product.productId).sort(), ['invalid-code', 'missing-master']);
    assert.deepEqual(byCode.get(99).products, [], 'advertising-only series never invent product sales');
    assert.equal(byCode.get(1).count, 3);
    assert.equal(byCode.get(1).sales, 131.75);
    assert.equal(byCode.get(4).sales, null);
    assert.equal(byCode.get(5).sales, 0);
    for (const series of result.body.series) {
      assert.equal(series.products.reduce((sum, product) => sum + product.count, 0), series.count);
      const sales = series.products.some(product => product.sales === null) ? null : series.products.reduce((sum, product) => sum + product.sales, 0);
      assert.equal(sales, series.sales, 'monthly attached detail reconciles with its unchanged series total');
    }
    const period = await periodApi.POST(request('2026-01', 3));
    assert.equal(period.status, 200);
    const byName = new Map(period.body.seriesSummary.map(series => [series.seriesName, series]));
    assert.deepEqual(byName.get('共通名').products.map(product => product.productId).sort(), ['same-a', 'same-b'], 'period attachment follows its existing series-name grouping');
    assert.deepEqual(byName.get('別名').products.map(product => product.productId), ['same-code']);
    assert.equal(byName.get('共通名').count, 7);
    assert.equal(byName.get('共通名').sales, 270, 'three-month range includes November through January, excluding adjacent months');
    assert.equal(byName.get('金額のみ').sales, 12.75);
    assert.equal(byName.get('未取得').sales, null);
    for (const series of period.body.seriesSummary) {
      assert.equal(series.products.reduce((sum, product) => sum + product.count, 0), series.count);
      const sales = series.products.some(product => product.sales === null) ? null : series.products.reduce((sum, product) => sum + product.sales, 0);
      assert.equal(sales, series.sales, 'period attached detail reconciles with its unchanged series total');
    }
    const single = await periodApi.POST(request('2026-01', 1));
    assert.equal(single.body.seriesSummary.find(series => series.seriesName === '共通名').sales, 151.75);
    const noData = await periodApi.POST(request('2024-01', 1));
    assert.deepEqual(noData.body.seriesSummary, []);
    queryCalls.length = 0;
    assert.equal((await periodApi.POST(request('2026-01', 0))).status, 400);
    assert.equal((await monthApi.GET(new Request('https://example.invalid/api/web-sales/ec-profit?month=2026-13'))).status, 400);
    authorized = false;
    assert.equal((await periodApi.POST(request('2026-01', 3))).status, 401);
    assert.equal((await monthApi.GET(new Request('https://example.invalid/api/web-sales/ec-profit?month=2026-01'))).status, 401);
    assert.deepEqual(queryCalls, [], 'invalid or unauthorized requests never query sales');
    assert.deepEqual({ products, rows }, before, 'API responses cannot mutate saved inputs');
  } finally {
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    }
  }
  console.log('PASS: series product summaries preserve identity, saved amounts, null/zero, month/period grouping, date ranges and read-only API authorization');
}
verifyApiAttachments().catch(error => { console.error(error); process.exitCode = 1; });
