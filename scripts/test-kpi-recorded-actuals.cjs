const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const amounts = require('../lib/kpi-amounts.ts');

// Synthetic full-month fixture; production requires all EC sources to be verified.
assert.equal(amounts.resolveKpiWebActual(null, 12345678), 12345678);
assert.equal(amounts.resolveKpiWebActual(null, undefined, 10201547), 10201547);
assert.equal(amounts.resolveKpiWebActual(15454316, 99999999), 15454316);
assert.equal(amounts.resolveKpiWebActual(0, 12345), 0, 'An explicit official zero must be preserved');
assert.equal(amounts.resolveKpiWebActual(null, 0, 12345), 0, 'An explicit recorded zero must be preserved');
assert.equal(amounts.resolveKpiWebActual(null), null, 'Missing amounts must never become an estimate');
assert.equal(amounts.resolveKpiWebActual(undefined), 0, 'A month without sales or a record keeps its existing zero');

const rows = {
  get_web_sales_monthly: [
    { month: '2024-08-01', amount: 8000000 },
    { month: '2025-08-01', amount: null },
    { month: '2026-08-01', amount: null },
    { month: '2026-09-01', amount: 15454316 },
    { month: '2026-10-01', amount: null },
  ],
  get_wholesale_sales_monthly: [{ month: '2026-08-01', amount: 200 }],
  get_store_sales_monthly: [{ month: '2026-08-01', amount: 300 }],
  get_shoku_sales_monthly: [{ month: '2026-08-01', amount: 400 }],
  get_kpi_manual_entries: [
    { channel_code: 'WEB', metric: 'historical_actual', month: '2025-08-01', amount: 10201547 },
    { channel_code: 'WEB', metric: 'historical_actual', month: '2024-08-01', amount: 8154748 },
    { channel_code: 'WEB', metric: 'actual', month: '2026-08-01', amount: 12345678 },
    { channel_code: 'WEB', metric: 'actual', month: '2026-09-01', amount: 99999999 },
    { channel_code: 'WEB', metric: 'target', month: '2026-08-01', amount: 12900000 },
    { channel_code: 'WHOLESALE', metric: 'actual', month: '2026-08-01', amount: 99999999 },
  ],
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return {
    createClient: () => ({ rpc: async (name) => {
      assert.ok(Object.hasOwn(rows, name), `Unexpected RPC: ${name}`);
      return { data: rows[name], error: null };
    } }),
  };
  if (request === 'next/cache') return { revalidatePath: () => {} };
  if (request === '@/lib/kpi-amounts') return amounts;
  return originalLoad.call(this, request, parent, isMain);
};
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-placeholder';
const { getKpiSummary } = require('../app/kpi/actions.ts');

(async () => {
  const summary = await getKpiSummary(2027);
  const august = summary.channels.WEB[0];
  assert.equal(august.month, '2026-08-01');
  assert.equal(august.actual, 12345678);
  assert.equal(august.lastYear, 10201547);
  assert.equal(august.twoYearsAgo, 8000000, 'Complete official amounts must also win in comparison years');
  assert.equal(august.target, 12900000);
  assert.equal(summary.channels.WEB[1].actual, 15454316, 'Complete EC data must override an older monthly record');
  assert.equal(summary.channels.WEB[2].actual, null);
  assert.equal(summary.channels.WHOLESALE[0].actual, 200, 'Other channels keep their existing source');
  assert.equal(summary.total[0].actual, 12346578);
  assert.equal(summary.total[2].actual, null);
  assert.equal(amounts.kpiRatio(august.actual, august.target), 12345678 / 12900000 * 100);
  const priorYear = await getKpiSummary(2026);
  assert.equal(priorYear.channels.WEB[0].actual, 10201547, 'The same saved record must work as current or prior year');
  assert.equal(priorYear.channels.WEB[0].lastYear, 8000000);
  console.log('KPI recorded actuals: source priority, missing/zero states, fiscal-year comparison and totals passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
