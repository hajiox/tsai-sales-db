const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Evaluate the production utility and shared helper without JSX or a browser.
function loadTs(relative, aliases = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = instance.require.bind(instance);
  instance.require = id => aliases[id] || originalRequire(id);
  instance._compile(compiled, filename);
  return instance.exports;
}
const amounts = loadTs('lib/web-sales-amounts.ts');
const { calculateTotalAllECSites } = loadTs('utils/webSalesUtils.tsx', { '@/lib/web-sales-amounts': amounts });
const empty = Object.fromEntries(amounts.WEB_SALES_CHANNELS.map(channel => [`${channel}_count`, 0]));
const row = { ...empty, product_id: 'verified', price: 2299, unit_price: 2299, yahoo_count: 3, yahoo_amount: 5000, base_count: 2, base_amount: 0 };
assert.deepEqual(calculateTotalAllECSites([row], new Map([['verified', { price: 99999 }]])), { totalCount: 5, totalAmount: 5000 });
assert.equal(amounts.getWebSalesAverageUnitPrice(row, 'yahoo'), 5000 / 3);
assert.equal(amounts.resolveWebSalesAmount(row, 'base'), 0, 'explicit zero is an actual amount');
assert.deepEqual(calculateTotalAllECSites([{ ...row, yahoo_amount: null }]), { totalCount: 5, totalAmount: null }, 'missing sold amount is not master price times quantity');
assert.deepEqual(calculateTotalAllECSites([row, { ...empty, amazon_count: 1, amazon_amount: null }]), { totalCount: 6, totalAmount: null }, 'a partial known sum must not appear as a complete total');
assert.deepEqual(calculateTotalAllECSites([{ ...empty }]), { totalCount: 0, totalAmount: 0 });
const kpi = loadTs('lib/kpi-amounts.ts');
assert.equal(kpi.sumKpiAmounts([5000, null, 1200]), null, 'missing WEB revenue also invalidates the company KPI total');
assert.equal(kpi.sumKpiAmounts([5000, 0, 1200]), 6200, 'a recorded zero stays distinct from unavailable revenue');
assert.equal(kpi.kpiRatio(null, 10000), null, 'unknown WEB revenue cannot produce a zero achievement rate');
assert.equal(kpi.kpiRatio(5000, null), null, 'missing previous revenue cannot produce a growth rate');
assert.equal(kpi.kpiRatio(5000, 10000), 50);
assert.equal(kpi.formatKpiAmount(null), '実売額未取得');
console.log('PASS: WEB UI totals use original actual amounts, preserve zero, and expose missing revenue');

// Exercise the production packet with an in-memory read-only Supabase contract.
function packetClient(tables) {
  return { from(table) {
    let rows = tables[table] || [];
    return {
      select() { return this; }, order() { return this; },
      in(field, values) { rows = rows.filter(row => values.includes(row[field])); return this; },
      eq(field, value) { rows = rows.filter(row => row[field] === value); return this; },
      range(start, end) { rows = rows.slice(start, end + 1); return this; },
      gte() { return this; }, lte() { return this; },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
  } };
}
async function verifyProfitPacket() {
  const months = ['2026-09', '2026-08', '2025-09'];
  const zeroFees = { refunds: 0, platform_fees: 0, payment_fees: 0, seller_coupons: 0,
    seller_points: 0, shipping_costs: 0, other_costs: 0, other_credits: 0 };
  const tables = {
    products: [{ id: 'verified', name: '商品A', series: 'series', series_code: 1 }],
    web_sales_summary: months.map(month => ({ ...empty, report_month: `${month}-01`, product_id: 'verified',
      tiktok_count: 10, tiktok_amount: 900, unit_price: 100, unit_cost_ex_ec: 40 })),
    ec_profit_monthly: months.map(month => ({ ...zeroFees, channel: 'tiktok', report_month: `${month}-01`,
      coverage_level: 'complete', gross_sales: 900, seller_discounts: 100, raw_summary: {} })),
  };
  const before = structuredClone(tables);
  const sync = { getWebSalesAutomationServiceClient: () => packetClient(tables) };
  const period = loadTs('lib/web-sales-analysis/period.ts', { '@/lib/web-sales-automation/sync': sync });
  const aliases = { '@/lib/web-sales-automation/sync': sync, '@/lib/web-sales-analysis/period': period,
    '@/lib/web-sales-amounts': amounts };
  const input = { month: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30' };
  const build = helpers => loadTs('lib/web-sales-analysis/packet.ts', { ...aliases, '@/lib/web-sales-amounts': helpers }).buildWebSalesAnalysisPacket(input);
  const packet = await build(amounts);
  const tiktok = packet.channel_details.find(channel => channel.channel === 'tiktok');
  assert.equal(tiktok.ec_deductions, 0);
  assert.equal(tiktok.final_profit, 500);
  assert.equal(tiktok.expense_breakdown.seller_discounts, 100, 'source evidence is preserved');
  assert.equal(tiktok.seller_discounts_included_in_sales, 100);
  assert.equal(typeof tiktok.ec_deduction_adjustment_note, 'string');
  assert.equal(tiktok.previous_month.final_profit, 500);
  assert.equal(tiktok.previous_year.final_profit, 500);
  assert.equal(packet.headline.target.final_profit, 500);
  assert.deepEqual(tables, before, 'packet construction cannot rewrite source values');

  for (const settlement of tables.ec_profit_monthly) settlement.seller_discounts = 0;
  const zeroPacket = await build(amounts);
  // Compare the complete packet against the unchanged zero-cost contract, not source text.
  const unadjustedPacket = await build({ ...amounts, adjustWebSalesEcDeductions: (_channel, raw) => ({ ecDeductions: raw }) });
  const withoutTimestamp = ({ generated_at: _generatedAt, ...stable }) => stable;
  assert.deepEqual(withoutTimestamp(zeroPacket), withoutTimestamp(unadjustedPacket), 'zero discounts retain the existing packet shape');
  const schema = loadTs('lib/web-sales-analysis/schema.ts');
  const { analysisPacketHash } = loadTs('lib/web-sales-analysis/direct.ts', { './schema': schema });
  assert.equal(analysisPacketHash(zeroPacket), analysisPacketHash(unadjustedPacket), 'zero discounts retain the packet hash');
  const zeroChannel = zeroPacket.channel_details.find(channel => channel.channel === 'tiktok');
  assert.equal(Object.hasOwn(zeroChannel, 'seller_discounts_included_in_sales'), false);
  assert.equal(Object.hasOwn(zeroChannel, 'ec_deduction_adjustment_note'), false);
  console.log('PASS: production profit packet preserves 500 profit, source evidence, previous periods and zero-discount shape/hash');
}
verifyProfitPacket().catch(error => { console.error(error); process.exitCode = 1; });
