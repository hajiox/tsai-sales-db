const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.join(__dirname, '..');
const id = '00000000-0000-4000-8000-000000000001';
const artifactId = '00000000-0000-4000-8000-000000000002';
let db;
let routeCalls = [];
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  const stub = name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'next/server') return { NextRequest };
    if (name.startsWith('node:') || name === 'xlsx') return require(name);
    if (name === './server') return { createDataAccessAdminClient: () => db };
    if (name.startsWith('@/app/api/') && name.endsWith('/route')) return Object.fromEntries(['GET', 'POST', 'PUT', 'DELETE'].map(method => [method, async (request, context) => {
      const body = request.headers.get('content-type')?.includes('application/json') ? await request.json() : null;
      routeCalls.push({ name, method, request, context, body });
      return Response.json({ ok: true });
    }]));
    throw Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(stub, testModule, testModule.exports);
  return testModule.exports;
}
const contracts = load('lib/data-access/contracts.ts');
const operationContracts = load('lib/data-access/operation-contracts.ts', { './contracts': contracts });
const shipping = load('lib/shipping-labels.ts');
const { financeOperations } = load('lib/data-access/finance-operations.ts', { './operation-contracts': operationContracts, '@/lib/shipping-labels': shipping });
const operations = new Map(financeOperations.map(operation => [operation.name, operation]));
assert.equal(operations.size, financeOperations.length, 'Operation names must be unique');
const get = name => { const operation = operations.get(name); assert.ok(operation, name); return operation; };
const validate = (name, input) => operationContracts.validateOperationSchema(get(name).inputSchema, input);
const reject = (name, input) => assert.throws(() => validate(name, input));
async function execute(name, input) {
  validate(name, input);
  const prepared = get(name).prepare(input, 'https://tsa.example.test');
  return prepared.execute({ request: prepared.request, connectionId: id, actor: `data-access:${id}` });
}
const acquisition = { body: { taskKey: 'web_sales_import', channels: ['amazon', 'rakuten', 'yahoo', 'base'], startDate: '2026-09-01', endDate: '2026-09-30' } };
validate('finance_acquisition_enqueue', acquisition);
validate('finance_acquisition_enqueue', { body: { ...acquisition.body, taskKey: 'ad_cost_import', channels: ['meta', 'google'] } });
for (const channel of ['mercari', 'qoo10', 'tiktok', 'makeshop', 'meta']) reject('finance_acquisition_enqueue', { body: { ...acquisition.body, channels: [channel] } });
reject('finance_acquisition_enqueue', { body: { ...acquisition.body, prompt: 'arbitrary instruction' } });
reject('finance_acquisition_enqueue', { body: { ...acquisition.body, startDate: '2026-02-30' } });
reject('finance_acquisition_enqueue', { body: acquisition.body, url: '/api/admin' });
for (const name of ['amazon', 'rakuten', 'yahoo', 'base']) {
  const body = { targetMonth: '2026-09', matchedProducts: [{ productId: id, [`${name}Title`]: 'Synthetic item', quantity: 1, amount: 1234 }], newMappings: [], expectedQuantity: 1, expectedAmount: 1234 };
  validate(`web_sales_${name}_csv_confirm`, { body });
  const { expectedAmount, ...withoutAmount } = body;
  reject(`web_sales_${name}_csv_confirm`, { body: withoutAmount });
  reject(`web_sales_${name}_csv_confirm`, { body: { ...body, expectedQuantity: '1' } });
}
reject('ec_profit_estimate', { body: { month: '2026-09', channels: ['qoo10'] } });
reject('web_sales_abcd_save', { body: { mode: 'save', csv: 'synthetic', settings: { channel: 'qoo10' }, confirmed: true } });
validate('web_sales_abcd_history', { query: { channel: 'qoo10' } });
validate('meta_ads_analysis', { body: { month: '2026-09', adSetName: 'Synthetic set' } });
validate('google_ads_analysis', { body: { month: '2026-09', assetGroupName: 'Synthetic asset' } });
reject('google_ads_analysis', { body: { month: '2026-09', model: 'changed-model' } });
validate('wholesale_product_statistics', { query: { year: 2026, month: 9, type: 'OEM' } });
reject('wholesale_product_statistics', { query: { year: 2026, month: 13 } });
validate('web_sales_channel_clear', { body: { month: '2026-09', channel: 'amazon' } });
reject('web_sales_channel_clear', { body: { month: '2026-09', channel: 'makeshop' } });
reject('wholesale_sales_month_delete', { body: { month: '2026-09', sql: 'arbitrary' } });
const bytes = Buffer.from('order-id\tsku\tproduct-name\tquantity-to-ship\trecipient-name\tbuyer-name\tship-phone-number\tship-postal-code\tship-state\tship-city\tship-address-1\tship-address-2\nAMZ-1\tSKU-1\tSynthetic item\t1\tRecipient\tBuyer\t00000000000\t9650044\tTest state\tTest city\tTest address\t2\n');
const file = { field: 'file', filename: 'synthetic-orders.txt', mimeType: 'text/plain', base64: bytes.toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
const mapping = { amazonName: 'Synthetic item', sku: 'SKU-1', yahooName: '', yahooItemId: '', labelName: 'Synthetic label', amazonPattern: '', deliveryPattern: '通常' };
const conversion = { files: [file], body: { source: 'amazon', settings: { ...shipping.DEFAULT_SENDER_SETTINGS, shipDate: '2026-10-11' }, mappings: [mapping] } };
validate('shipping_labels_convert', conversion);
reject('shipping_labels_convert', { ...conversion, files: [{ ...file, field: 'secret' }] });
assert.throws(() => get('shipping_labels_convert').prepare({ ...conversion, files: [{ ...file, sha256: 'a'.repeat(64) }] }, 'https://tsa.example.test'));
function database(rows, artifactType = 'source') {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const filters = [];
      const query = {
        select(fields) { calls.push({ table, fields, filters }); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        in(key, value) { filters.push([key, value]); return this; }, order() { return this; }, limit() { return this; },
        result(single) {
          const data = table === 'web_sales_codex_artifacts' && filters.some(([key, value]) => key === 'artifact_type' && value !== artifactType) ? null : rows[table] ?? (single ? null : []);
          return { data, error: null };
        },
        maybeSingle() { return Promise.resolve(this.result(true)); },
        then(resolve, reject) { return Promise.resolve(this.result(false)).then(resolve, reject); },
      };
      return query;
    },
    storage: { from(bucket) { assert.equal(bucket, 'web-sales-codex'); return { download: async storagePath => { assert.equal(storagePath, 'synthetic/source.csv'); return { data: new Blob(['synthetic original']), error: null }; } }; } },
  };
  return client;
}
async function main() {
  let result = await (await execute('shipping_labels_convert', conversion)).json();
  assert.equal(result.sourceRowCount, 1);
  assert.equal(result.files.reduce((total, output) => total + output.rowCount, 0), 1);
  const output = result.files.find(item => item.rowCount);
  assert.ok(output.content.includes('2026/10/11'), 'Carrier CSV dates retain the existing slash format');
  assert.equal(output.sha256, crypto.createHash('sha256').update(output.content).digest('hex'));
  result = await (await execute('shipping_labels_convert', { ...conversion, body: { ...conversion.body, mappings: [] } })).json();
  assert.equal(result.files.reduce((total, item) => total + item.rowCount, 0), 0);
  assert.equal(result.missingMappings.length, 1, 'Unmapped products must not be silently exported');
  await execute('shipping_labels_import_save', conversion);
  assert.equal(routeCalls.at(-1).request.url, 'https://tsa.example.test/api/shipping-labels/history');
  assert.equal(routeCalls.at(-1).body.settings.shipDate, '2026/10/11');
  assert.equal(routeCalls.at(-1).body.conversionSnapshot.sourceSha256, file.sha256);
  assert.equal(routeCalls.at(-1).body.sourceRows.length, 1);
  const column = { key: 'A', header: 'Synthetic', field: 'Synthetic', columnLetter: 'A', columnIndex: 0, role: 'participating', editable: true, hidden: false, required: false };
  const history = { files: [file], body: { status: 'draft', title: 'Synthetic history', parsed: { sheetName: 'Sheet1', headerRowNumber: 1, fieldRowNumber: 2, dataStartRowNumber: 3, rowCount: 1, columns: [column], editableKeys: ['A'], summary: { participating: 1, notParticipating: 0, bestDeal: 0, lightningDeal: 0, warnings: 0, minStartDate: null, maxEndDate: null } }, rows: [{ id: 'row-3', rowNumber: 3, groupKey: 'row', values: { A: 'はい' }, displayValues: { A: 'はい' }, options: { A: ['はい', 'いいえ'] }, writeTargets: { A: 'A3' }, validationMessages: [] }] } };
  await execute('amazon_deals_history_save', history);
  assert.equal(routeCalls.at(-1).request.url, 'https://tsa.example.test/api/amazon-deals/histories');
  assert.equal(routeCalls.at(-1).body.payload.parsed.workbookBase64, file.base64);
  assert.equal(routeCalls.at(-1).body.payload.parsed.fileName, file.filename);
  assert.deepEqual(routeCalls.at(-1).body.payload.rows, history.body.rows);
  reject('amazon_deals_history_save', { ...history, body: { ...history.body, parsed: { ...history.body.parsed, workbookBase64: 'arbitrary bypass' } } });
  await execute('wholesale_sales_month_delete', { body: { month: '2026-09' } });
  assert.equal(routeCalls.at(-1).request.method, 'DELETE');
  assert.deepEqual(routeCalls.at(-1).body, { month: '2026-09' });
  await execute('wholesale_delivery_note_detail', { params: { id: 'note/../encoded' } });
  assert.equal(new URL(routeCalls.at(-1).request.url).pathname, '/api/wholesale/delivery-notes/note%2F..%2Fencoded');
  db = database({ web_sales_codex_jobs: [{ id }], web_sales_codex_artifacts: [{ id: artifactId, job_id: id }] });
  await execute('finance_jobs_status', { query: { month: '2026-09' } });
  for (const { fields } of db.calls) assert.ok(!/prompt|parameter|worker_token|error_message|storage_path/.test(fields));
  assert.deepEqual(db.calls.find(call => call.table === 'web_sales_codex_jobs').filters.find(([key]) => key === 'task_key')[1], ['web_sales_import', 'ad_cost_import', 'ec_profit_import', 'web_sales_analysis']);
  assert.ok(db.calls.find(call => call.table === 'web_sales_codex_artifacts').filters.some(([key, value]) => key === 'artifact_type' && value === 'source'));
  db = database({ web_sales_codex_artifacts: { file_name: 'source.csv', content_type: 'text/csv', byte_size: 18, storage_path: 'synthetic/source.csv' } });
  assert.equal(await (await execute('finance_job_artifact', { query: { jobId: id, artifactId } })).text(), 'synthetic original');
  db = database({ web_sales_codex_artifacts: { storage_path: 'synthetic/log.txt' } }, 'log');
  assert.equal((await execute('finance_job_artifact', { query: { jobId: id, artifactId } })).status, 404, 'Logs cannot be downloaded through business artifact access');
  db = database({ web_sales_codex_artifacts: { byte_size: operationContracts.MAX_BUSINESS_FILE_BYTES + 1 } });
  assert.equal((await execute('finance_job_artifact', { query: { jobId: id, artifactId } })).status, 413);
  db = database({ web_sales_codex_jobs: { task_key: 'web_sales_import', channel: 'qoo10' } });
  const before = routeCalls.length;
  assert.equal((await execute('finance_job_retry', { params: { id } })).status, 400);
  assert.equal(routeCalls.length, before, 'Retired acquisition must fail before calling the retry handler');
  db = database({ web_sales_codex_jobs: { task_key: 'publish_sns', channel: 'amazon' } });
  assert.equal((await execute('finance_job_cancel', { params: { id } })).status, 403);
  const registry = fs.readFileSync(path.join(root, 'supabase/migrations/20261011151000_business_finance_coverage.sql'), 'utf8');
  assert.equal((registry.match(/'rakuten_search_request_histories'/g) || []).length, 1);
  console.log(`${financeOperations.length} finance operations: schemas, original totals, active channels, fixed routes, carrier conversion and safe artifact access passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
