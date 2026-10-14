const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
function loadTs(relative, stubs = {}) {
  const filename = path.join(root, relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = Module.createRequire(filename);
  instance.require = name => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return instance.exports;
}
function find(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(text).join('');
}
function findAll(node, predicate, result = []) {
  if (!React.isValidElement(node)) return result;
  if (predicate(node)) result.push(node);
  for (const child of React.Children.toArray(node.props.children)) findAll(child, predicate, result);
  return result;
}

async function main() {
  const nativeFetch = global.fetch, nativeWindow = global.window, NativeDate = global.Date;
  class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-12-31T03:00:00Z'])); } static now() { return new NativeDate('2026-12-31T03:00:00Z').valueOf(); } }
  global.Date = FixedDate;
  global.window = { location: { origin: 'https://fixture.invalid' }, scrollTo() {}, setInterval() { return 1; }, clearInterval() {} };
  const hooks = [], effects = [], posts = [], errors = [];
  let cursor = 0;
  const materials = ['pork_belly', 'green_onion', 'ginger'].map((key, index) => ({ key, name: key, unit: 'g', sortOrder: index + 1, priceSource: 'delivery_note_ai' }));
  const outputs = [{ key: 'block', name: 'block', unitWeightG: 1000, sortOrder: 1 }];
  const legacy = { id: 'legacy-run', production_date: '2026-10-13', packaging_date: null, worker_count: 2, work_hours: 3,
    cooking_worker_count: null, cooking_work_hours: null, packaging_worker_count: null, packaging_work_hours: null, total_person_hours: 6,
    notes: '', materials: materials.map(item => ({ material_key: item.key, usage_amount: 1 })), outputs: [{ output_key: 'block', quantity: 1 }] };
  let storedRun = legacy;
  const makeScan = date => ({ id: 'fixture-scan', status: 'needs_review', targetProductionDate: date, documentDate: date, sourceKind: 'doc_scanner', fileNames: [], items: materials.map(item => ({ key: item.key, name: item.name, recognized: true, sourceItemName: item.name, purchaseUnitQuantityG: 1000, purchasePriceTaxIncluded: 100, taxRate: 0.08, confidence: 1, evidence: 'fixture' })) });
  global.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    if (url === '/api/recipe/char-siu-production' && method === 'GET') return { ok: true, json: async () => ({ success: true, config: { materials, outputs }, runs: [storedRun] }) };
    if (url === '/api/recipe/char-siu-production' && method === 'POST') {
      posts.push(body);
      storedRun = { ...legacy, id: body.id || 'new-run', production_date: body.productionDate, packaging_date: body.packagingDate,
        worker_count: body.workerCount, work_hours: body.workHours, cooking_worker_count: body.cookingWorkerCount, cooking_work_hours: body.cookingWorkHours,
        packaging_worker_count: body.packagingWorkerCount, packaging_work_hours: body.packagingWorkHours,
        total_person_hours: body.cookingWorkerCount * body.cookingWorkHours + body.packagingWorkerCount * body.packagingWorkHours };
      return { ok: true, json: async () => ({ success: true, id: storedRun.id }) };
    }
    if (String(url).startsWith('/api/recipe/char-siu-production/delivery-notes') && method === 'GET') return { ok: true, json: async () => ({ success: true, scans: [], docScannerDocuments: [] }) };
    if (url === '/api/recipe/char-siu-production/delivery-notes' && method === 'POST') return { ok: true, json: async () => ({ success: true, scan: makeScan(body.targetProductionDate) }) };
    if (url === '/api/recipe/char-siu-production/delivery-notes' && method === 'PATCH') return { ok: true, json: async () => ({ success: true, scan: { ...makeScan(body.targetProductionDate), status: 'ready' } }) };
    throw new Error(`Unexpected fixture request: ${method} ${url}`);
  };
  try {
    const model = loadTs('lib/char-siu-production.ts');
    const loaded = loadTs('app/recipe/char-siu-production/page.tsx', {
      react: { ...React,
        useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
        useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
        useCallback(callback) { return callback; }, useMemo(callback) { return callback(); }, useEffect(callback) { effects.push(callback); },
      },
      'next/image': () => null, 'next/navigation': { useRouter: () => ({ push() {} }) },
      qrcode: { toDataURL: async () => '' }, 'lucide-react': new Proxy({}, { get: () => () => null }),
      sonner: { toast: { error(message) { errors.push(message); }, success() {} } },
      '@/lib/char-siu-production': model,
    });
    const render = () => { cursor = 0; effects.length = 0; return loaded.default(); };
    const input = id => { const found = find(render(), node => node.props.id === id && (node.type === 'input' || typeof node.type === 'function')); assert.ok(found, `Missing input ${id}`); return found; };
    const change = (id, value) => { const field = input(id); field.props.onChange(typeof field.type === 'function' ? value : { target: { value } }); };
    const fillStageLabor = () => {
      change('cooking-worker-count', '2'); change('cooking-work-hours', '3');
      change('packaging-worker-count', '4'); change('packaging-work-hours', '1.5');
    };
    const button = label => { const found = find(render(), node => node.type === 'button' && text(node).trim() === label); assert.ok(found, `Missing button ${label}`); return found; };
    const modal = name => find(render(), node => typeof node.type === 'function' && node.type.name === name);
    render(); effects[0](); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(findAll(render(), node => node.type === 'fieldset').map(node => node.props['aria-label']), ['煮込み工程', '包装工程'], 'Cooking is the upper row and packaging the lower row');
    assert.equal(input('production-date').props.value, '2026-12-31');
    assert.equal(input('packaging-date').props.value, '2027-01-01', 'New year default follows the real date helper');
    change('production-date', '2026-01-31');
    assert.equal(input('packaging-date').props.value, '2026-02-01', 'New cooking date follows into the next month');
    change('packaging-date', '2026-02-04'); change('production-date', '2026-02-01');
    assert.equal(input('packaging-date').props.value, '2026-02-04', 'A manually chosen packaging day is preserved');
    button('新規入力').props.onClick();
    change('packaging-date', '2027-01-01'); change('production-date', '2027-01-02');
    assert.equal(input('packaging-date').props.value, '2027-01-01', 'Even a manual day equal to the old default stays manual');
    assert.match(text(render()), /包装日は煮込み日以降/);
    let count = posts.length;
    await button('登録').props.onClick();
    assert.equal(posts.length, count, 'Reversed dates never reach POST');
    assert.match(text(render()), /包装\s*未登録/, 'Legacy null is displayed as unregistered');
    assert.match(text(render()), /工程別内訳未登録.*旧合計 6人時/, 'Legacy aggregate hours are explicitly retained without stage inference');
    button('編集').props.onClick();
    assert.equal(input('packaging-date').props.value, '', 'Legacy null is not inferred into a fake packaging date');
    for (const id of ['cooking-worker-count', 'cooking-work-hours', 'packaging-worker-count', 'packaging-work-hours']) {
      assert.equal(input(id).props.value, '', `Legacy aggregate is not guessed into ${id}`);
    }
    await button('更新').props.onClick();
    assert.equal(posts.length, count, 'An empty packaging date requires operator input');
    change('packaging-date', '2026-10-12'); await button('更新').props.onClick();
    assert.equal(posts.length, count, 'Legacy edit also blocks reversed dates');
    change('packaging-date', '2026-10-13'); await button('更新').props.onClick();
    assert.equal(posts.length, count, 'Legacy conversion requires all four labor inputs');
    fillStageLabor();
    for (const id of ['cooking-worker-count','cooking-work-hours','packaging-worker-count','packaging-work-hours']) assert.equal(input(id).props.required, true, 'Each stage labor field is required');
    assert.match(text(render()), /合計人時（煮込み＋包装）12 人時/, '2×3 cooking plus 4×1.5 packaging gives 12 person-hours');
    change('cooking-worker-count', '1.5'); await button('更新').props.onClick();
    assert.equal(posts.length, count, 'Fractional worker counts never reach POST');
    change('cooking-worker-count', '2'); change('packaging-work-hours', '0'); await button('更新').props.onClick();
    assert.equal(posts.length, count, 'Zero packaging time never reaches POST');
    change('packaging-work-hours', '1.5'); await button('更新').props.onClick();
    assert.equal(posts.length, ++count, 'Same-day processing is allowed');
    assert.equal(posts.at(-1).productionDate, '2026-10-13'); assert.equal(posts.at(-1).packagingDate, '2026-10-13');
    assert.deepEqual(Object.fromEntries(['cookingWorkerCount','cookingWorkHours','packagingWorkerCount','packagingWorkHours'].map(key => [key, posts.at(-1)[key]])),
      { cookingWorkerCount: 2, cookingWorkHours: 3, packagingWorkerCount: 4, packagingWorkHours: 1.5 });
    assert.equal(posts.at(-1).workerCount, 2); assert.equal(posts.at(-1).workHours, 3, 'Compatibility pair describes cooking only');
    button('編集').props.onClick(); change('packaging-date', '2026-10-16'); await button('更新').props.onClick();
    assert.equal(posts.length, ++count, 'Processing beyond two days is allowed');
    assert.equal(posts.at(-1).packagingDate, '2026-10-16');
    assert.equal(Object.hasOwn(posts.at(-1), 'packagingDateEdited'), false, 'Local automatic/manual state never leaks into API input');
    async function confirmScan() {
      button('受信一覧').props.onClick();
      await modal('DocScannerPickerModal').props.onSelect({ docId: 'fixture-doc' });
      assert.ok(modal('DeliveryNoteReviewModal'));
      await modal('DeliveryNoteReviewModal').props.onConfirm();
      assert.equal(button('登録').props.disabled, false, 'A ready scan for the exact cooking date enables registration');
    }
    change('production-date', '2026-10-14'); fillStageLabor(); await confirmScan();
    change('production-date', '2026-10-15');
    assert.equal(input('packaging-work-hours').props.value, '1.5', 'Changing cooking day preserves packaging labor');
    assert.equal(button('登録').props.disabled, true, 'Changing cooking date invalidates the previous scan');
    await button('登録').props.onClick(); assert.equal(posts.length, count, 'A stale scan cannot produce a new run');
    change('packaging-date', '2026-10-20'); await confirmScan();
    assert.equal(input('packaging-date').props.value, '2026-10-20', 'Confirming a scan preserves the manual packaging day');
    assert.equal(input('packaging-worker-count').props.value, '4'); assert.equal(input('packaging-work-hours').props.value, '1.5', 'Scan confirmation preserves packaging labor');
    await button('登録').props.onClick();
    assert.equal(posts.length, ++count);
    assert.equal(posts.at(-1).deliveryNoteScanId, 'fixture-scan');
    assert.equal(posts.at(-1).productionDate, '2026-10-15'); assert.equal(posts.at(-1).packagingDate, '2026-10-20');
    assert.equal(button('登録').props.disabled, true, 'Successful save clears the ready scan instead of reusing it');
    assert.equal(modal('DeliveryNoteReviewModal'), null, 'Successful save closes the scan review');
    fillStageLabor();
    await button('登録').props.onClick(); assert.equal(posts.length, count, 'Cleared scan cannot be resubmitted');
    assert.ok(errors.some(error => /包装日/.test(error)));
    await financeTests(model);
    console.log('Char siu production UI: two labor rows, numeric stage payloads, summed preview, legacy preservation, date guards, scan binding and save reset passed.');
  } finally { global.fetch = nativeFetch; global.window = nativeWindow; global.Date = NativeDate; }
}

async function financeTests(model) {
  const hooks = [], effects = [], requests = [], errors = [];
  let cursor = 0;
  let stored = {
    id: 'finance-legacy', production_date: '2026-10-13', packaging_date: null, worker_count: 3, work_hours: 0.33,
    cooking_worker_count: null, cooking_work_hours: null, packaging_worker_count: null, packaging_work_hours: null,
    hourly_wage: 1000, total_person_hours: 1, material_cost: 100, labor_cost: 1000, total_cost: 1100,
    total_output_quantity: 1, total_output_weight_g: 1000, average_cost_per_item: 1100, average_cost_per_kg: 1100,
    notes: '', labor_rate_staff_count: 2, labor_rate_excluded_count: 0, labor_rate_source: 'tsg_manufacturing_average', labor_rate_synced_at: null,
    materials: [{ material_key: 'pork_belly', material_name: 'pork', usage_amount: 1000, usage_unit: 'g', purchase_unit_quantity: 1000,
      purchase_price_tax_included: 100, unit_cost: 0.1, material_cost: 100, sort_order: 1, price_source: 'delivery_note_ai', source_reference: null, source_confidence: 1, source_note: null }],
    outputs: [{ output_key: 'block', output_name: 'block', quantity: 1, unit_weight_g: 1000, output_weight_g: 1000, allocation_ratio: 1, allocated_cost: 1100, unit_cost: 1100, sort_order: 1 }],
  };
  const settings = { hourly_wage: 1000, block_unit_weight_g: 1000, lard_unit_weight_g: 50, minced_chashu_unit_weight_g: 1000,
    labor_rate_staff_count: 2, labor_rate_excluded_count: 0, labor_rate_effective_date: null, labor_rate_synced_at: null, labor_rate_source: 'tsg_manufacturing_average' };
  global.fetch = async (url, options = {}) => {
    if (url === '/api/finance/auth') return { ok: true, json: async () => ({ authenticated: true }) };
    if (String(url).startsWith('/api/finance/char-siu-production?')) return { ok: true, json: async () => ({ success: true, settings, runs: [stored] }) };
    if (url === '/api/finance/char-siu-production' && options.method === 'PATCH') {
      const body = JSON.parse(options.body); assert.equal(body.action, 'run'); requests.push(body);
      stored = { ...stored, production_date: body.productionDate, packaging_date: body.packagingDate,
        worker_count: body.workerCount, work_hours: body.workHours, cooking_worker_count: body.cookingWorkerCount, cooking_work_hours: body.cookingWorkHours,
        packaging_worker_count: body.packagingWorkerCount, packaging_work_hours: body.packagingWorkHours,
        total_person_hours: body.cookingWorkerCount * body.cookingWorkHours + body.packagingWorkerCount * body.packagingWorkHours };
      return { ok: true, json: async () => ({ success: true }) };
    }
    throw new Error(`Unexpected finance fixture request: ${options.method || 'GET'} ${url}`);
  };
  const loaded = loadTs('app/finance/char-siu-production/page.tsx', {
    react: { ...React,
      useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
      useCallback(callback) { return callback; }, useMemo(callback) { return callback(); }, useEffect(callback) { effects.push(callback); },
    },
    'next/navigation': { useRouter: () => ({ push() {} }) }, 'lucide-react': new Proxy({}, { get: () => () => null }),
    sonner: { toast: { error(message) { errors.push(message); }, success() {} } }, '@/lib/char-siu-production': model,
  });
  const render = () => { cursor = 0; effects.length = 0; return loaded.default(); };
  const field = id => { const found = find(render(), node => node.props.id === id); assert.ok(found, `Missing finance field ${id}`); return found; };
  const change = (id, value) => field(id).props.onChange(value);
  const save = () => { const found = find(render(), node => node.type === 'button' && text(node).trim() === '原価を再計算して保存'); assert.ok(found); return found.props.onClick(); };
  const metric = label => { const found = find(render(), node => typeof node.type === 'function' && node.type.name === 'Metric' && node.props.label === label); assert.ok(found, `Missing metric ${label}`); return found.props.value; };
  render(); effects[0](); await new Promise(resolve => setImmediate(resolve));
  render(); effects[1](); await new Promise(resolve => setImmediate(resolve));
  assert.match(text(render()), /煮込み月/, 'Finance month remains explicitly based on cooking date');
  assert.deepEqual(findAll(render(), node => node.type === 'fieldset').map(node => node.props['aria-label']), ['煮込み工程', '包装工程']);
  assert.match(text(render()), /工程別内訳未登録.*旧合計 1人時/);
  assert.equal(metric('人件費'), '¥1,000', 'Legacy 3 × 0.33 must retain its saved 1.00 person-hour instead of recalculating 0.99');
  assert.equal(metric('製造原価合計'), '¥1,100', 'Legacy total cost uses the same preserved aggregate');
  assert.match(text(find(render(), node => node.type === 'tr' && text(node).startsWith('block'))), /¥1,100/, 'Output allocation also uses preserved legacy labor');
  for (const id of ['finance-cooking-worker-count','finance-cooking-work-hours','finance-packaging-worker-count','finance-packaging-work-hours']) {
    assert.equal(field(id).props.value, '', 'Legacy finance stage fields start empty');
  }
  change('finance-packaging-date', '2026-10-14'); await save();
  assert.equal(requests.length, 0, 'Finance legacy conversion requires four valid labor inputs');
  change('finance-cooking-worker-count', '2'); change('finance-cooking-work-hours', '3');
  assert.equal(metric('人件費'), '¥1,000', 'An incomplete conversion keeps the known saved aggregate preview');
  change('finance-packaging-worker-count', '4'); change('finance-packaging-work-hours', '1.5');
  assert.equal(metric('人件費'), '¥12,000', 'Finance labor uses cooking and packaging person-hours together');
  assert.equal(metric('製造原価合計'), '¥12,100', 'The TSG rate and material allocation remain intact');
  change('finance-packaging-worker-count', '0'); await save(); assert.equal(requests.length, 0, 'Zero finance worker counts do not reach PATCH');
  change('finance-packaging-worker-count', '4'); change('finance-cooking-work-hours', '-1'); await save(); assert.equal(requests.length, 0, 'Negative finance hours do not reach PATCH');
  change('finance-cooking-work-hours', '3'); await save();
  assert.equal(requests.length, 1);
  const payload = requests[0];
  assert.deepEqual(Object.fromEntries(['cookingWorkerCount','cookingWorkHours','packagingWorkerCount','packagingWorkHours'].map(key => [key, payload[key]])),
    { cookingWorkerCount: 2, cookingWorkHours: 3, packagingWorkerCount: 4, packagingWorkHours: 1.5 });
  assert.equal(payload.workerCount, 2); assert.equal(payload.workHours, 3);
  assert.equal(Object.hasOwn(payload, 'hourlyWage'), false, 'The stored TSG hourly rate is not replaced by a client override');
  assert.equal(field('finance-packaging-worker-count').props.value, '4'); assert.equal(field('finance-packaging-work-hours').props.value, '1.5', 'Packaging labor survives save and reread');
  change('finance-cooking-date', '2026-10-15');
  assert.equal(field('finance-packaging-work-hours').props.value, '1.5', 'Changing the finance date does not discard stage labor');
  await save(); assert.equal(requests.length, 1, 'Finance reversed dates still block PATCH');
  assert.ok(errors.some(error => /各工程/.test(error)));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
