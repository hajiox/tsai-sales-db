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

async function main() {
  const nativeFetch = global.fetch, nativeWindow = global.window, NativeDate = global.Date;
  class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-12-31T03:00:00Z'])); } static now() { return new NativeDate('2026-12-31T03:00:00Z').valueOf(); } }
  global.Date = FixedDate;
  global.window = { location: { origin: 'https://fixture.invalid' }, scrollTo() {}, setInterval() { return 1; }, clearInterval() {} };
  const hooks = [], effects = [], posts = [], errors = [];
  let cursor = 0;
  const materials = ['pork_belly', 'green_onion', 'ginger'].map((key, index) => ({ key, name: key, unit: 'g', sortOrder: index + 1, priceSource: 'delivery_note_ai' }));
  const outputs = [{ key: 'block', name: 'block', unitWeightG: 1000, sortOrder: 1 }];
  const legacy = { id: 'legacy-run', production_date: '2026-10-13', packaging_date: null, worker_count: 1, work_hours: 1, notes: '', materials: materials.map(item => ({ material_key: item.key, usage_amount: 1 })), outputs: [{ output_key: 'block', quantity: 1 }] };
  const makeScan = date => ({ id: 'fixture-scan', status: 'needs_review', targetProductionDate: date, documentDate: date, sourceKind: 'doc_scanner', fileNames: [], items: materials.map(item => ({ key: item.key, name: item.name, recognized: true, sourceItemName: item.name, purchaseUnitQuantityG: 1000, purchasePriceTaxIncluded: 100, taxRate: 0.08, confidence: 1, evidence: 'fixture' })) });
  global.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    if (url === '/api/recipe/char-siu-production' && method === 'GET') return { ok: true, json: async () => ({ success: true, config: { materials, outputs }, runs: [legacy] }) };
    if (url === '/api/recipe/char-siu-production' && method === 'POST') { posts.push(body); return { ok: true, json: async () => ({ success: true, id: body.id || 'new-run' }) }; }
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
    const input = id => { const found = find(render(), node => node.type === 'input' && node.props.id === id); assert.ok(found, `Missing input ${id}`); return found; };
    const change = (id, value) => input(id).props.onChange({ target: { value } });
    const button = label => { const found = find(render(), node => node.type === 'button' && text(node).trim() === label); assert.ok(found, `Missing button ${label}`); return found; };
    const modal = name => find(render(), node => typeof node.type === 'function' && node.type.name === name);
    render(); effects[0](); await new Promise(resolve => setImmediate(resolve));
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
    button('編集').props.onClick();
    assert.equal(input('packaging-date').props.value, '', 'Legacy null is not inferred into a fake packaging date');
    await button('更新').props.onClick();
    assert.equal(posts.length, count, 'An empty packaging date requires operator input');
    change('packaging-date', '2026-10-12'); await button('更新').props.onClick();
    assert.equal(posts.length, count, 'Legacy edit also blocks reversed dates');
    change('packaging-date', '2026-10-13'); await button('更新').props.onClick();
    assert.equal(posts.length, ++count, 'Same-day processing is allowed');
    assert.equal(posts.at(-1).productionDate, '2026-10-13'); assert.equal(posts.at(-1).packagingDate, '2026-10-13');
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
    change('production-date', '2026-10-14'); await confirmScan();
    change('production-date', '2026-10-15');
    assert.equal(button('登録').props.disabled, true, 'Changing cooking date invalidates the previous scan');
    await button('登録').props.onClick(); assert.equal(posts.length, count, 'A stale scan cannot produce a new run');
    change('packaging-date', '2026-10-20'); await confirmScan();
    assert.equal(input('packaging-date').props.value, '2026-10-20', 'Confirming a scan preserves the manual packaging day');
    await button('登録').props.onClick();
    assert.equal(posts.length, ++count);
    assert.equal(posts.at(-1).deliveryNoteScanId, 'fixture-scan');
    assert.equal(posts.at(-1).productionDate, '2026-10-15'); assert.equal(posts.at(-1).packagingDate, '2026-10-20');
    assert.equal(button('登録').props.disabled, true, 'Successful save clears the ready scan instead of reusing it');
    assert.equal(modal('DeliveryNoteReviewModal'), null, 'Successful save closes the scan review');
    await button('登録').props.onClick(); assert.equal(posts.length, count, 'Cleared scan cannot be resubmitted');
    assert.ok(errors.some(error => /包装日/.test(error)));
    console.log('Char siu production UI: real date callbacks, manual overrides, legacy nulls, date guards, scan binding and save reset passed.');
  } finally { global.fetch = nativeFetch; global.window = nativeWindow; global.Date = NativeDate; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
