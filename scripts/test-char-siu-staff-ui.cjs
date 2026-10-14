const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const endpoint = '/api/recipe/char-siu-production/staff-drafts';

function load(relative, stubs) {
  const filename = path.join(root, relative), instance = new Module(filename, module);
  const native = Module.createRequire(filename);
  instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance.require = name => Object.hasOwn(stubs, name) ? stubs[name] : native(name);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  return instance.exports;
}
function all(node, predicate, result = []) {
  if (!React.isValidElement(node)) return result;
  if (predicate(node)) result.push(node);
  for (const child of React.Children.toArray(node.props.children)) all(child, predicate, result);
  return result;
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : '';
}
function harness(relative, stubs, props = {}) {
  const state = [], effects = []; let cursor = 0;
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
    useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
    useMemo(callback) { return callback(); }, useCallback(callback) { return callback; }, useEffect(callback) { effects.push(callback); },
  };
  const exports = load(relative, { ...stubs, react });
  return { exports, effects, render() { cursor = 0; effects.length = 0; return exports.default(props); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const icons = new Proxy({}, { get: () => () => null });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

async function main() {
  const nativeFetch = global.fetch, nativeWindow = global.window;
  let uuidSequence = 0;
  global.window = { location: { origin: 'https://fixture.invalid' }, crypto: { randomUUID: () => id(900 + ++uuidSequence) }, scrollTo() {}, setInterval() { return 1; }, clearInterval() {} };
  const model = load('lib/char-siu-production.ts', {});
  const makeDraft = (number, status = 'needs_review') => ({
    id: id(number), revision: 2, status, input: { productionDate: '2026-10-14', packagingDate: status === 'draft' ? null : '2026-10-15',
      cookingWorkerCount: 2, cookingWorkHours: 3, packagingWorkerCount: status === 'draft' ? null : 4, packagingWorkHours: status === 'draft' ? null : 1.5,
      materials: [{ key: 'pork_belly', usageAmount: 2000 }, { key: 'green_onion', usageAmount: 0 }, { key: 'ginger', usageAmount: 10 }],
      outputs: [{ key: 'block', quantity: 2 }], notes: 'staff fixture notes' },
    deviceId: 'fixture-device', operatorName: 'fixture operator', connectionId: id(80), connectionLabel: 'fixture connection', scanId: status === 'draft' ? null : id(100 + number),
    runId: status === 'completed' ? id(200 + number) : null, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', submittedAt: null, completedAt: null,
    photos: [{ id: id(300 + number), fileName: 'fixture.jpg', mimeType: 'image/jpeg', size: 100, scanStatus: 'needs_review', url: `${endpoint}/${id(number)}/photos/${id(300 + number)}` },
      { id: id(400 + number), fileName: 'untrusted.jpg', mimeType: 'image/jpeg', size: 100, scanStatus: 'needs_review', url: 'https://outside.invalid/private-photo' }],
  });
  const draft = makeDraft(1, 'draft'), pending = makeDraft(2), completed = makeDraft(3, 'completed');
  const materials = ['pork_belly', 'green_onion', 'ginger'].map((key, index) => ({ key, name: key, unit: 'g', sortOrder: index + 1, priceSource: 'delivery_note_ai' }));
  const outputs = [{ key: 'block', name: 'block', unitWeightG: 1000, sortOrder: 1 }];
  const scans = new Map();
  function makeScan(record) {
    const value = { id: record.scanId, status: 'needs_review', targetProductionDate: record.input.productionDate, documentDate: record.input.productionDate, sourceKind: 'direct_upload', fileNames: [],
      items: materials.map(item => ({ key: item.key, name: item.name, recognized: true, sourceItemName: item.name, purchaseUnitQuantityG: 1000, purchasePriceTaxIncluded: 100, taxRate: 0.08, confidence: 1, evidence: 'fixture' })) };
    scans.set(value.id, value); return value;
  }
  makeScan(pending);
  const requests = [], successes = [], errors = []; let finalizeMode = 'conflict', finishFinalize;
  try {
    const component = harness('app/recipe/char-siu-production/_components/StaffProductionDraftsPanel.tsx', { 'lucide-react': icons });
    global.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      if (url === '/api/recipe/char-siu-production') return response({ success: true, config: { materials, outputs }, runs: [] });
      if (String(url).startsWith('/api/recipe/char-siu-production/delivery-notes?')) return response({ success: true, scans: [...scans.values()], docScannerDocuments: [] });
      if (url === '/api/recipe/char-siu-production/delivery-notes' && options.method === 'PATCH') {
        const body = JSON.parse(options.body), ready = { ...scans.get(body.scanId), status: 'ready', items: body.items }; scans.set(ready.id, ready); return response({ success: true, scan: ready });
      }
      if (url === endpoint && options.method === 'POST') {
        if (finalizeMode === 'conflict') return response({ success: false, code: 'REVISION_CONFLICT', error: '最新状態を再確認してください' }, 409);
        if (finalizeMode === 'uncertain') throw new TypeError('fixture transport failure');
        return new Promise(resolve => { finishFinalize = resolve; });
      }
      throw new Error(`Unexpected page fixture request ${url}`);
    };
    const page = harness('app/recipe/char-siu-production/page.tsx', {
      'next/image': () => null, 'next/navigation': { useRouter: () => ({ push() {} }) }, qrcode: { toDataURL: async () => '' }, 'lucide-react': icons,
      sonner: { toast: { error(message) { errors.push(message); }, success(message) { successes.push(message); } } }, '@/lib/char-siu-production': model,
      './_components/StaffProductionDraftsPanel': component.exports,
    });
    const find = predicate => all(page.render(), predicate)[0];
    const field = name => { const found = find(node => node.props.id === name); assert.ok(found, `Missing field ${name}`); return found; };
    const change = (name, value) => { const node = field(name); node.props.onChange(typeof node.type === 'function' ? value : { target: { value } }); };
    const button = label => { const found = find(node => node.type === 'button' && text(node).trim() === label); assert.ok(found, `Missing button ${label}`); return found; };
    const panel = () => find(node => node.type === component.exports.default);
    const review = () => find(node => typeof node.type === 'function' && node.type.name === 'DeliveryNoteReviewModal');
    const finalizeRequests = () => requests.filter(item => item.url === endpoint && item.options.method === 'POST');
    page.render(); page.effects[0](); await tick();
    change('production-date', '2026-10-10'); change('packaging-date', '2026-10-12');
    change('cooking-worker-count', '3'); change('cooking-work-hours', '2'); change('packaging-worker-count', '2'); change('packaging-work-hours', '1');
    field('production-notes').props.onChange({ target: { value: 'parked manual notes' } });
    await panel().props.onSelect(draft);
    assert.equal(button('スタッフ提出待ち').props.disabled, true);
    await button('スタッフ提出待ち').props.onClick(); assert.equal(finalizeRequests().length, 0, 'An unsubmitted draft cannot be finalized');
    button('通常入力へ戻る').props.onClick();
    assert.equal(field('production-notes').props.value, 'parked manual notes');
    await panel().props.onSelect(pending);
    for (const name of ['production-date', 'packaging-date', 'cooking-worker-count', 'cooking-work-hours', 'packaging-worker-count', 'packaging-work-hours', 'material-pork_belly', 'production-notes']) assert.equal(field(name).props.readOnly, true, `Staff source ${name} is read-only`);
    change('packaging-work-hours', '99'); change('production-date', '2026-10-20');
    assert.equal(field('packaging-work-hours').props.value, '1.5'); assert.equal(field('production-date').props.value, pending.input.productionDate);
    assert.equal(field('material-green_onion').props.value, '0', 'Explicit staff zero is not turned into missing input');
    assert.ok(review());
    const reviewTree = review().type(review().props);
    assert.equal(all(reviewTree, node => node.props.id === 'review-production-date')[0].props.readOnly, true);
    assert.deepEqual(all(reviewTree, node => node.type === 'a').map(node => node.props.href), [pending.photos[0].url], 'Only the fixed authenticated image stream is linked');
    const wrong = { ...scans.get(pending.scanId), targetProductionDate: '2026-10-15' };
    review().props.onChange(wrong); const beforePatch = requests.length; await review().props.onConfirm();
    assert.equal(requests.length, beforePatch, 'A staff scan cannot be retargeted to another cooking day');
    review().props.onChange({ ...scans.get(pending.scanId), items: scans.get(pending.scanId).items.map(item => ({ ...item, purchasePriceTaxIncluded: 150 })) });
    await review().props.onConfirm();
    assert.equal(scans.get(pending.scanId).items[0].purchasePriceTaxIncluded, 150, 'Manager price review stays editable');
    assert.equal(button('スタッフ記録を正式登録').props.disabled, false);
    await button('スタッフ記録を正式登録').props.onClick();
    assert.equal(finalizeRequests().length, 1); assert.equal(button('スタッフ記録を正式登録').props.disabled, true);
    const firstBody = JSON.parse(finalizeRequests()[0].options.body);
    assert.deepEqual(Object.keys(firstBody).sort(), ['action','clientOperationId','deliveryNoteScanId','draftId','expectedRevision'].sort(), 'No staff quantities, wage or cost are sent by manager finalize');
    assert.equal(firstBody.draftId, pending.id); assert.equal(firstBody.expectedRevision, 2); assert.equal(firstBody.deliveryNoteScanId, pending.scanId);
    await button('スタッフ記録を正式登録').props.onClick(); assert.equal(finalizeRequests().length, 1, 'A conflict requires a fresh selection instead of blind retry');
    finalizeMode = 'uncertain';
    await panel().props.onSelect({ ...pending, revision: 3 }); await review().props.onConfirm(); await button('スタッフ記録を正式登録').props.onClick();
    assert.equal(finalizeRequests().length, 2); assert.equal(button('スタッフ記録を正式登録').props.disabled, true);
    assert.equal(successes.includes('スタッフ記録を正式登録しました'), false, 'An uncertain submission is not reported as completed');
    const uncertainBody = JSON.parse(finalizeRequests()[1].options.body);
    assert.notEqual(uncertainBody.clientOperationId, firstBody.clientOperationId, 'A changed draft revision starts a new attempt');
    await panel().props.onSelect({ ...pending, revision: 3 }); await review().props.onConfirm(); await button('スタッフ記録を正式登録').props.onClick();
    assert.equal(finalizeRequests().length, 3);
    assert.equal(JSON.parse(finalizeRequests()[2].options.body).clientOperationId, uncertainBody.clientOperationId, 'Freshly rechecking the same draft revision and scan reuses the uncertain operation ID');
    button('通常入力へ戻る').props.onClick();
    assert.equal(field('production-date').props.value, '2026-10-10'); assert.equal(field('packaging-date').props.value, '2026-10-12');
    assert.equal(field('packaging-work-hours').props.value, '1'); assert.equal(field('production-notes').props.value, 'parked manual notes', 'Returning from review restores independent manual input');
    const another = makeDraft(4); makeScan(another); finalizeMode = 'success';
    await panel().props.onSelect(another); await review().props.onConfirm();
    const submit = button('スタッフ記録を正式登録').props.onClick;
    const first = submit(), second = submit();
    assert.equal(finalizeRequests().length, 4, 'The in-flight guard prevents a duplicate finalize');
    finishFinalize(response({ success: true, draft: { ...another, status: 'completed', revision: 3, runId: id(204) } }));
    await Promise.all([first, second]);
    assert.equal(panel().props.selectedId, null); assert.equal(field('production-date').props.readOnly, false);
    assert.equal(field('packaging-work-hours').props.value, '1'); assert.equal(field('production-notes').props.value, 'parked manual notes');
    assert.equal(successes.filter(value => value === 'スタッフ記録を正式登録しました').length, 1);
    assert.ok(errors.some(value => /再確認/.test(value)));
    await panelTests(component.exports, [draft, pending, completed]);
    assert.equal(requests.some(item => item.options.headers?.Authorization), false, 'Browser calls never receive a staff Bearer');
    console.log('Char siu staff UI: status list, frozen source, price-only review, fixed photo streams, CAS/uncertain waits, duplicate guard and manual-form restoration passed.');
  } finally { global.fetch = nativeFetch; global.window = nativeWindow; }
}

async function panelTests(exports, drafts) {
  let failure = false; const selected = [];
  global.fetch = async (url, options = {}) => { assert.equal(url, endpoint); assert.equal(options.method, undefined); return failure ? response({ success: false, error: 'fixture unavailable' }, 503) : response({ success: true, drafts }); };
  const props = { selectedId: null, busy: false, refreshKey: 0, onSelect: draft => { selected.push(draft.id); } };
  const panel = harness('app/recipe/char-siu-production/_components/StaffProductionDraftsPanel.tsx', { 'lucide-react': icons }, props);
  panel.render(); panel.effects[0](); await tick();
  const button = label => all(panel.render(), node => node.type === 'button' && text(node).trim() === label)[0];
  assert.match(text(panel.render()), /下書き 1 \/ 要単価確認 1 \/ 正式登録済み 1/);
  assert.equal(button('登録済み').props.disabled, true); await button('登録済み').props.onClick(); assert.equal(selected.length, 0);
  await button('下書きを確認').props.onClick(); await button('単価を確認して登録').props.onClick(); assert.deepEqual(selected, [drafts[0].id, drafts[1].id]);
  assert.ok(all(panel.render(), node => node.type === 'a').every(node => node.props.href.startsWith(`${endpoint}/`) && !node.props.href.includes('outside.invalid')));
  assert.equal(exports.staffPhotoUrl(drafts[0].id, { ...drafts[0].photos[0], url: 'javascript:alert(1)' }), null);
  failure = true; button('一覧を更新').props.onClick(); await tick(); assert.match(text(panel.render()), /fixture unavailable/);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
