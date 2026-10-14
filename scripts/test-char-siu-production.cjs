const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(relative, aliases = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = instance.require.bind(instance);
  instance.require = name => Object.hasOwn(aliases, name) ? aliases[name] : original(name);
  instance._compile(output, filename);
  return instance.exports;
}

const production = loadTs('lib/char-siu-production.ts');
const notes = loadTs('lib/char-siu-delivery-note.ts', { 'server-only': {} });
const rawItems = ['pork_belly', 'green_onion', 'ginger'].map(material_key => ({
  material_key, source_item_name: material_key, purchase_unit_quantity_g: 1000,
  purchase_price_tax_included: 1080, tax_rate: 0.08, confidence: 1, evidence: 'fixture',
}));
const normalized = notes.normalizeDeliveryNoteItems(rawItems);
assert.equal(normalized.length, 3);
assert.deepEqual(notes.normalizeDeliveryNoteItems(normalized), normalized, 'saved camelCase snapshots must survive reread');
assert.equal(notes.isCompleteDeliveryNoteScan(notes.normalizeDeliveryNoteItems(normalized)), true);
assert.equal(notes.normalizeDeliveryNoteItems([{ ...rawItems[0], purchase_unit_quantity_g: 0 }]).length, 0);
assert.equal(notes.normalizeDeliveryNoteItems([{ ...rawItems[0], purchase_price_tax_included: 0, purchase_price_tax_excluded: 1000 }])[0].purchasePriceTaxIncluded, 1080);
assert.equal(notes.normalizeDeliveryNoteItems([{ ...rawItems[0], confidence: 0.2 }, { ...rawItems[0], confidence: 0.9, purchase_price_tax_included: 1200 }])[0].purchasePriceTaxIncluded, 1200);
const publicScan = notes.publicDeliveryNoteScan({ id: 'fixture', status: 'ready', extracted_items: normalized });
assert.ok(publicScan.items.every(item => item.recognized));
assert.ok(publicScan.items.every(item => !Object.hasOwn(item, 'purchasePriceTaxIncluded')), 'public upload response still withholds cost prices');

for (const value of ['2026-02-29', '2026-02-31', '1900-02-29', '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01', '2026-1-01', '2026-10-14T00:00:00Z', '', null, 20261014]) {
  assert.equal(production.normalizeCharSiuDate(value), '', String(value));
}
assert.equal(production.normalizeCharSiuDate(' 2024-02-29 '), '2024-02-29');
assert.equal(production.normalizeCharSiuDate('2000-02-29'), '2000-02-29');
assert.equal(production.nextCharSiuDate('2024-02-29'), '2024-03-01');
assert.equal(production.nextCharSiuDate('2026-12-31'), '2027-01-01');
assert.equal(production.nextCharSiuDate('9999-12-31'), '');
assert.deepEqual(production.resolveCharSiuProductionDates('2026-10-14', undefined), { productionDate: '2026-10-14', packagingDate: null });
assert.deepEqual(production.resolveCharSiuProductionDates('2026-10-14', undefined, '2026-10-16'), { productionDate: '2026-10-14', packagingDate: '2026-10-16' });
assert.deepEqual(production.resolveCharSiuProductionDates('2026-10-14', null, '2026-10-16'), { productionDate: '2026-10-14', packagingDate: null });
for (const date of ['2026-10-14', '2026-10-15', '2026-10-20']) assert.equal(production.resolveCharSiuProductionDates('2026-10-14', date).packagingDate, date);
for (const date of ['2026-10-13', '2026-02-31', '', false]) assert.equal(production.resolveCharSiuProductionDates('2026-10-14', date), null);
assert.equal(production.resolveCharSiuProductionDates('2026-10-17', undefined, '2026-10-16'), null, 'changing cooking date cannot silently violate a retained packaging date');

const calculated = production.calculateCharSiuProduction({
  workerCount: 2, workHours: 3, hourlyWage: 1200,
  materials: [{ materialKey: 'pork_belly', usageAmount: 2000, purchaseUnitQuantity: 1000, purchasePriceTaxIncluded: 1200 },
    { materialKey: 'soy_sauce', usageAmount: 100, purchaseUnitQuantity: 1000, purchasePriceTaxIncluded: 500 }],
  outputs: [{ outputKey: 'block', quantity: 2, unitWeightG: 1000 }, { outputKey: 'lard', quantity: 20, unitWeightG: 50 }],
});
assert.equal(calculated.totalPersonHours, 6);
assert.equal(calculated.materialCost, 2450); assert.equal(calculated.laborCost, 7200); assert.equal(calculated.totalCost, 9650);
assert.equal(calculated.totalOutputWeightG, 3000); assert.equal(calculated.totalOutputQuantity, 22);
assert.equal(calculated.outputs[0].allocatedCost, 6433.3333); assert.equal(calculated.outputs[1].allocatedCost, 3216.6667);
assert.equal(calculated.outputs[0].unitCost, 3216.6667); assert.equal(calculated.outputs[1].unitCost, 160.8333);
assert.equal(calculated.averageCostPerItem, 438.6364); assert.equal(calculated.averageCostPerKg, 3216.6667);
assert.equal(production.taxIncludedIngredientPrice(1000, false), 1080);
const emptyOutput = production.calculateCharSiuProduction({ workerCount: 1, workHours: 0, hourlyWage: 1200, materials: [], outputs: [{ outputKey: 'block', quantity: 0, unitWeightG: 1000 }] });
assert.equal(emptyOutput.outputs[0].unitCost, null); assert.equal(emptyOutput.averageCostPerKg, null);

const stages = { cookingWorkerCount: 2, cookingWorkHours: 3, packagingWorkerCount: 3, packagingWorkHours: 1.5 };
const stagedCalculation = production.calculateCharSiuProduction({
  workerCount: 99, workHours: 99, hourlyWage: 1200, ...stages,
  materials: [{ materialKey: 'pork_belly', usageAmount: 2000, purchaseUnitQuantity: 1000, purchasePriceTaxIncluded: 1200 },
    { materialKey: 'soy_sauce', usageAmount: 100, purchaseUnitQuantity: 1000, purchasePriceTaxIncluded: 500 }],
  outputs: [{ outputKey: 'block', quantity: 2, unitWeightG: 1000 }, { outputKey: 'lard', quantity: 20, unitWeightG: 50 }],
});
assert.equal(stagedCalculation.workerCount, 2); assert.equal(stagedCalculation.workHours, 3);
assert.equal(stagedCalculation.totalPersonHours, 10.5); assert.equal(stagedCalculation.laborCost, 12600); assert.equal(stagedCalculation.totalCost, 15050);
assert.equal(stagedCalculation.outputs[0].allocatedCost, 10033.3333); assert.equal(stagedCalculation.outputs[1].allocatedCost, 5016.6667);
assert.equal(stagedCalculation.outputs[0].unitCost, 5016.6667); assert.equal(stagedCalculation.outputs[1].unitCost, 250.8333);
const fractionalStages = production.calculateCharSiuProduction({ workerCount: 1, workHours: 1, hourlyWage: 1000,
  cookingWorkerCount: 1, cookingWorkHours: 1.234, packagingWorkerCount: 1, packagingWorkHours: 1.234, materials: [], outputs: [] });
assert.equal(fractionalStages.totalPersonHours, 2.47, 'sum both exact stage products before the existing final rounding');
assert.equal(fractionalStages.cookingWorkHours, 1.234);
const stageSnapshot = { worker_count: 2, work_hours: 3, cooking_worker_count: 2, cooking_work_hours: '3', packaging_worker_count: 3, packaging_work_hours: '1.5' };
assert.deepEqual(production.charSiuStageLaborFromSnapshot(stageSnapshot), stages);
assert.deepEqual(production.resolveCharSiuStageLabor({}, stageSnapshot).stages, stages);
assert.deepEqual(production.resolveCharSiuStageLabor({ workerCount: 2, workHours: 3 }, stageSnapshot).stages, stages);
assert.ok(production.resolveCharSiuStageLabor({ workerCount: 3 }, stageSnapshot).error);
assert.equal(production.resolveCharSiuStageLabor({}, { worker_count: 2, work_hours: 3 }).stages, null);
for (const invalid of [{ cookingWorkerCount: 2 }, { ...stages, cookingWorkerCount: 1.5 }, { ...stages, packagingWorkerCount: 0 },
  { ...stages, cookingWorkHours: 0 }, { ...stages, packagingWorkHours: -1 }, { ...stages, packagingWorkHours: Infinity },
  { ...stages, cookingWorkHours: '3' }, { cookingWorkerCount: null, cookingWorkHours: null, packagingWorkerCount: null, packagingWorkHours: null }]) {
  assert.ok(production.resolveCharSiuStageLabor(invalid).error);
}
assert.throws(() => production.calculateCharSiuProduction({ workerCount: 1, workHours: 1, hourlyWage: 1000, cookingWorkerCount: 2, materials: [], outputs: [] }));
assert.equal(calculated.cookingWorkerCount, null); assert.equal(calculated.packagingWorkHours, null);

function fixtureDatabase() {
  let serial = 1;
  const rows = {
    char_siu_production_settings: [{ id: 1, hourly_wage: 0, labor_rate_source: 'not_synced', block_unit_weight_g: 1000, lard_unit_weight_g: 50, minced_chashu_unit_weight_g: 1000 }],
    char_siu_production_runs: [], char_siu_production_materials: [], char_siu_production_outputs: [], char_siu_delivery_note_scans: [], pending_estimate_items: [],
    ingredients: production.CHAR_SIU_MATERIALS.map(item => ({ id: item.ingredientId, name: item.name, unit_quantity: 1000, price: 1000, tax_included: true })),
  };
  const writes = [];
  const id = () => `10000000-0000-4000-8000-${String(serial++).padStart(12, '0')}`;
  const db = { from(table) {
    let operation = 'select'; let payload; let columns = '*'; let conflict = []; let single = false; let maybe = false; let limit = Infinity;
    const filters = []; const orders = [];
    const query = {
      select(value = '*') { columns = value; return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      upsert(value, options) { operation = 'upsert'; payload = value; conflict = options.onConflict.split(','); return query; },
      delete() { operation = 'delete'; return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      is(key, value) { filters.push(row => (row[key] ?? null) === value); return query; },
      not(key, operator, value) { assert.equal(operator, 'is'); assert.equal(value, null); filters.push(row => row[key] !== null && row[key] !== undefined); return query; },
      or(expression) { assert.equal(expression, 'used_run_id.not.is.null,status.eq.used'); filters.push(row => row.used_run_id != null || row.status === 'used'); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      gte(key, value) { filters.push(row => row[key] >= value); return query; },
      lt(key, value) { filters.push(row => row[key] < value); return query; },
      order(key, options) { orders.push([key, options?.ascending !== false]); return query; },
      limit(value) { limit = value; return query; },
      single() { single = true; return query; }, maybeSingle() { maybe = true; return query; },
      then(accept, reject) {
        try {
          let selected = rows[table].filter(row => filters.every(match => match(row)));
          if (operation !== 'select') writes.push({ table, operation, payload: structuredClone(payload ?? null) });
          if (operation === 'insert') {
            selected = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: id(), created_at: '2026-10-14T00:00:00Z', ...structuredClone(row) }));
            rows[table].push(...selected);
          } else if (operation === 'update') selected.forEach(row => Object.assign(row, structuredClone(payload)));
          else if (operation === 'upsert') {
            selected = payload.map(value => {
              let row = rows[table].find(candidate => conflict.every(key => candidate[key] === value[key]));
              if (!row) { row = { id: id() }; rows[table].push(row); }
              Object.assign(row, structuredClone(value)); return row;
            });
          } else if (operation === 'delete') rows[table] = rows[table].filter(row => !selected.includes(row));
          selected = [...selected].sort((left, right) => {
            for (const [key, ascending] of orders) { if (left[key] !== right[key]) return (left[key] < right[key] ? -1 : 1) * (ascending ? 1 : -1); }
            return 0;
          }).slice(0, limit).map(row => columns === '*' ? structuredClone(row) : Object.fromEntries(columns.split(',').map(key => [key, structuredClone(row[key])])));
          const error = single && selected.length !== 1 ? { message: 'fixture row missing' } : null;
          return Promise.resolve({ data: single || maybe ? selected[0] || null : selected, error }).then(accept, reject);
        } catch (error) { return Promise.reject(error).then(accept, reject); }
      },
    };
    return query;
  } };
  return { db, rows, writes, id };
}

async function main() {
  const state = fixtureDatabase(); let authorized = true; let context = true; let financeCookie = true; let wage = 1200; let laborFailure = false;
  const laborDates = [];
  const identity = {
    getBusinessAdminSession: async () => authorized ? { user: { email: 'fixture@example.invalid' } } : null,
    isBusinessAdminSession: session => Boolean(session?.user), hasBusinessOperationContext: () => context,
  };
  const aliases = {
    'next/server': { NextResponse: { json: (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json' } }) } },
    '@supabase/supabase-js': { createClient: () => state.db },
    '@/lib/char-siu-production': production, '@/lib/char-siu-delivery-note': notes,
    '@/lib/data-access/business-operation-context': identity,
    '@/lib/tsg-manufacturing-labor': { fetchManufacturingAverageHourlyRate: async date => {
      laborDates.push(date); if (laborFailure) throw new Error('fixture TSG unavailable');
      return { hourlyRate: wage, staffCount: 2, excludedCount: 0, syncedAt: '2026-10-14T00:00:00Z', effectiveDate: date, source: 'tsg_manufacturing_average' };
    } },
    'next/headers': { cookies: async () => ({ get: () => financeCookie ? { value: 'authenticated' } : undefined }) },
    'next-auth/jwt': { getToken: async () => authorized ? { email: 'aizubrandhall@gmail.com' } : null },
    '@google/generative-ai': { GoogleGenerativeAI: class { constructor() { throw new Error('AI must not run in this test'); } } },
  };
  aliases['@/lib/char-siu-production-service'] = loadTs('lib/char-siu-production-service.ts', { ...aliases, 'server-only': {} });
  const api = loadTs('app/api/recipe/char-siu-production/route.ts', aliases);
  const intake = loadTs('app/api/recipe/char-siu-production/delivery-notes/route.ts', aliases);
  const finance = loadTs('app/api/finance/char-siu-production/route.ts', aliases);
  aliases['@/lib/char-siu-delivery-note-ai'] = loadTs('lib/char-siu-delivery-note-ai.ts', { ...aliases, 'server-only': {} });
  const upload = loadTs('app/api/recipe/char-siu-production/invoice-scan/route.ts', aliases);
  const request = (route, body, method = 'POST') => new Request(`https://fixture.invalid${route}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const scan = () => { const row = { id: state.id(), status: 'needs_review', used_run_id: null, target_production_date: '2026-10-14', extracted_items: [] }; state.rows.char_siu_delivery_note_scans.push(row); return row; };
  const reviewed = scan();
  const reviewBody = { scanId: reviewed.id, targetProductionDate: '2026-10-14', items: normalized.map(item => ({ key: item.materialKey, ...item })) };
  assert.equal((await intake.PATCH(request('/notes', reviewBody, 'PATCH'))).status, 200);
  assert.equal(reviewed.status, 'ready'); assert.equal(notes.isCompleteDeliveryNoteScan(notes.normalizeDeliveryNoteItems(reviewed.extracted_items)), true);
  const intakeResult = await (await intake.GET(request('/notes?productionDate=2026-10-14', undefined, 'GET'))).json();
  assert.ok(intakeResult.scans[0].items.every(item => item.recognized && item.purchasePriceTaxIncluded === 1080));
  const body = { productionDate: '2026-10-14', packagingDate: '2026-10-15', workerCount: 2, workHours: 3, deliveryNoteScanId: reviewed.id,
    materials: production.CHAR_SIU_MATERIALS.map(item => ({ key: item.key, usageAmount: item.key === 'pork_belly' ? 2000 : 0 })),
    outputs: [{ key: 'block', quantity: 2 }, { key: 'lard', quantity: 20 }], notes: 'fixture' };
  const createdResponse = await api.POST(request('/production', body)); assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json(); const run = state.rows.char_siu_production_runs.find(row => row.id === created.id);
  assert.equal(run.production_date, '2026-10-14'); assert.equal(run.packaging_date, '2026-10-15');
  assert.deepEqual(laborDates, ['2026-10-14']); assert.equal(run.total_person_hours, 6); assert.equal(run.labor_cost, 7200);
  assert.equal(run.material_cost, 2160); assert.equal(run.total_cost, 9360); assert.equal(reviewed.used_run_id, created.id);
  for (const material of state.rows.char_siu_production_materials.filter(row => row.run_id === created.id)) {
    const fromDeliveryNote = ['pork_belly', 'green_onion', 'ginger'].includes(material.material_key);
    assert.equal(material.price_source, fromDeliveryNote ? 'delivery_note_ai' : 'recipe_master');
    assert.equal(material.purchase_price_tax_included, fromDeliveryNote ? 1080 : 1000, 'the three fresh materials use confirmed delivery-note prices before the master');
  }
  const publicRuns = await (await api.GET(request('/production', undefined, 'GET'))).json();
  assert.equal(publicRuns.runs[0].packaging_date, '2026-10-15'); assert.equal(Object.hasOwn(publicRuns.runs[0], 'hourly_wage'), false);
  assert.equal((await api.POST(request('/production', body))).status, 400, 'used scan cannot create duplicate production');
  reviewed.doc_scanner_doc_id = 'fixture-doc';
  state.rows.pending_estimate_items.push({ id: state.id(), doc_scanner_doc_id: 'fixture-doc', item_name: '豚バラ肉1kg', quantity: 1, unit: 'kg', unit_price: 1000, tax_rate: 0.08, source_type: 'delivery_slip' });
  const usedCandidates = await (await intake.GET(request('/notes?productionDate=2026-10-14', undefined, 'GET'))).json();
  assert.equal(usedCandidates.docScannerDocuments.length, 0, 'already-used document must disappear from the same cooking-date candidates');
  assert.equal((await intake.POST(request('/notes', { docScannerDocId: 'fixture-doc', targetProductionDate: '2026-10-14' }))).status, 409);
  const otherDateCandidates = await (await intake.GET(request('/notes?productionDate=2026-10-16', undefined, 'GET'))).json();
  assert.equal(otherDateCandidates.docScannerDocuments.length, 1, 'a document can be assigned to a different cooking date');
  assert.equal((await intake.POST(request('/notes', { docScannerDocId: 'fixture-doc', targetProductionDate: '2026-10-16' }))).status, 200);
  assert.ok(state.rows.char_siu_delivery_note_scans.some(row => row.doc_scanner_doc_id === 'fixture-doc' && row.target_production_date === '2026-10-16'));
  const olderScan = scan(); Object.assign(olderScan, { doc_scanner_doc_id: 'fixture-old-pending', status: 'ready', extracted_items: normalized, created_at: '2025-01-01T00:00:00Z' });
  for (let index = 0; index < 30; index++) Object.assign(scan(), { doc_scanner_doc_id: `fixture-new-pending-${index}`, status: 'ready', extracted_items: normalized, created_at: '2026-10-14T00:00:00Z' });
  state.rows.pending_estimate_items.push({ ...state.rows.pending_estimate_items[0], id: state.id(), doc_scanner_doc_id: olderScan.doc_scanner_doc_id });
  const overflowCandidates = await (await intake.GET(request('/notes?productionDate=2026-10-14', undefined, 'GET'))).json();
  assert.equal(overflowCandidates.scans.length, 30);
  assert.ok(overflowCandidates.scans.every(row => row.id !== olderScan.id));
  assert.ok(overflowCandidates.docScannerDocuments.some(row => row.docId === olderScan.doc_scanner_doc_id), 'older unused scans remain reachable through the existing candidate picker');
  const recoveredScan = await (await intake.POST(request('/notes', { docScannerDocId: olderScan.doc_scanner_doc_id, targetProductionDate: '2026-10-14' }))).json();
  assert.equal(recoveredScan.scan.id, olderScan.id);
  const legacyEdit = { ...body, id: created.id }; delete legacyEdit.packagingDate;
  assert.equal((await api.POST(request('/production', legacyEdit))).status, 200);
  assert.equal(run.packaging_date, '2026-10-15'); assert.equal(laborDates.length, 1, 'ordinary edit preserves the captured hourly rate');
  for (const changes of [{ productionDate: '2026-02-31' }, { packagingDate: '2026-02-31' }, { packagingDate: '2026-10-13' }, { productionDate: '2026-10-16', packagingDate: undefined }]) {
    const before = state.writes.length;
    assert.equal((await api.POST(request('/production', { ...legacyEdit, ...changes }))).status, 400);
    assert.equal(state.writes.length, before);
  }
  assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: created.id, packagingDate: '2026-10-20' }, 'PATCH'))).status, 200);
  assert.equal(run.packaging_date, '2026-10-20'); assert.equal(run.total_cost, 9360);
  assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: created.id }, 'PATCH'))).status, 200);
  assert.equal(run.packaging_date, '2026-10-20');
  wage = 1300;
  assert.equal((await finance.PATCH(request('/finance', { action: 'sync_run_labor', id: created.id }, 'PATCH'))).status, 200);
  assert.equal(run.packaging_date, '2026-10-20'); assert.equal(run.labor_cost, 7800); assert.equal(laborDates.at(-1), '2026-10-14');
  for (const changes of [{ productionDate: '2026-02-31' }, { packagingDate: '' }, { packagingDate: '2026-10-13' }, { productionDate: '2026-10-21' }]) {
    const before = state.writes.length;
    assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: created.id, ...changes }, 'PATCH'))).status, 400);
    assert.equal(state.writes.length, before);
  }
  assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: created.id, packagingDate: null }, 'PATCH'))).status, 200);
  assert.equal(run.packaging_date, null);
  const legacyScan = scan(); Object.assign(legacyScan, { status: 'ready', extracted_items: rawItems });
  const legacyBody = { ...body, deliveryNoteScanId: legacyScan.id }; delete legacyBody.packagingDate;
  laborFailure = true; // Only an already-synced, positive TSG cache is an authorized fallback.
  assert.equal((await api.POST(request('/production', legacyBody))).status, 200);
  assert.equal(state.rows.char_siu_production_runs.at(-1).packaging_date, null);
  assert.equal(state.rows.char_siu_production_runs.at(-1).labor_rate_source, 'tsg_cached');
  state.rows.char_siu_production_settings[0].hourly_wage = 0;
  const noRateScan = scan(); Object.assign(noRateScan, { status: 'ready', extracted_items: normalized });
  const beforeNoRate = state.rows.char_siu_production_runs.length;
  assert.equal((await api.POST(request('/production', { ...body, deliveryNoteScanId: noRateScan.id }))).status, 500);
  assert.equal(state.rows.char_siu_production_runs.length, beforeNoRate, 'missing TSG and no valid cache must not save zero labor cost');
  assert.equal((await intake.GET(request('/notes?productionDate=2026-02-31', undefined, 'GET'))).status, 400);
  assert.equal((await intake.PATCH(request('/notes', { ...reviewBody, targetProductionDate: '2026-02-31' }, 'PATCH'))).status, 400);
  assert.equal((await intake.POST(request('/notes', { docScannerDocId: 'fixture-doc', targetProductionDate: '2026-02-31' }))).status, 400);
  const form = new FormData(); form.set('targetProductionDate', '2026-02-31');
  assert.equal((await upload.POST(new Request('https://fixture.invalid/upload', { method: 'POST', body: form }))).status, 400);
  const financialRuns = await (await finance.GET(request('/finance?month=2026-10', undefined, 'GET'))).json();
  assert.equal(financialRuns.runs.length, 2); assert.equal(financialRuns.runs.find(row => row.id === created.id).packaging_date, null);
  laborFailure = false; wage = 1200;
  const stageScan = scan(); Object.assign(stageScan, { status: 'ready', extracted_items: normalized });
  const stageBody = { ...body, ...stages, workerCount: 99, workHours: 99, deliveryNoteScanId: stageScan.id };
  const stageResponse = await api.POST(request('/production', stageBody)); assert.equal(stageResponse.status, 200);
  const stageId = (await stageResponse.json()).id;
  const stageRun = state.rows.char_siu_production_runs.find(row => row.id === stageId);
  assert.equal(stageRun.worker_count, 2); assert.equal(stageRun.work_hours, 3);
  assert.equal(stageRun.cooking_worker_count, 2); assert.equal(stageRun.packaging_worker_count, 3); assert.equal(stageRun.packaging_work_hours, 1.5);
  assert.equal(stageRun.total_person_hours, 10.5); assert.equal(stageRun.labor_cost, 12600); assert.equal(stageRun.total_cost, 14760);
  const stageRead = (await (await api.GET(request('/production', undefined, 'GET'))).json()).runs.find(row => row.id === stageId);
  assert.equal(stageRead.total_person_hours, 10.5); assert.equal(stageRead.packaging_work_hours, 1.5); assert.equal(Object.hasOwn(stageRead, 'hourly_wage'), false);
  assert.equal((await api.POST(request('/production', stageBody))).status, 400);
  const oldStageEdit = { ...body, id: stageId, workerCount: 2, workHours: 3 };
  assert.equal((await api.POST(request('/production', oldStageEdit))).status, 200);
  const omittedPairEdit = { ...oldStageEdit }; delete omittedPairEdit.workerCount; delete omittedPairEdit.workHours;
  assert.equal((await api.POST(request('/production', omittedPairEdit))).status, 200);
  assert.equal(stageRun.total_person_hours, 10.5); assert.equal(stageRun.packaging_work_hours, 1.5);
  for (const changes of [{ workerCount: 4 }, { workHours: 4 }, { cookingWorkerCount: 2 }, { ...stages, cookingWorkHours: 0 },
    { ...stages, packagingWorkerCount: 1.5 }, { ...stages, packagingWorkHours: '1.5' },
    { cookingWorkerCount: null, cookingWorkHours: null, packagingWorkerCount: null, packagingWorkHours: null }]) {
    const before = state.writes.length;
    assert.equal((await api.POST(request('/production', { ...oldStageEdit, ...changes }))).status, 400);
    assert.equal(state.writes.length, before, 'invalid or legacy-only stage edits must not mutate any snapshot');
  }
  assert.equal((await api.POST(request('/production', { ...oldStageEdit, ...stages, packagingWorkerCount: 4, packagingWorkHours: 2 }))).status, 200);
  assert.equal(stageRun.total_person_hours, 14); assert.equal(stageRun.labor_cost, 16800);
  assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: stageId, outputs: [{ key: 'block', quantity: 4 }] }, 'PATCH'))).status, 200);
  assert.equal(stageRun.total_person_hours, 14); assert.equal(stageRun.packaging_worker_count, 4); assert.equal(stageRun.packaging_work_hours, 2);
  assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: stageId, workerCount: 2, workHours: 3 }, 'PATCH'))).status, 200);
  for (const changes of [{ workerCount: 3 }, { workHours: 4 }, { cookingWorkerCount: 2 }]) {
    const before = state.writes.length;
    assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: stageId, ...changes }, 'PATCH'))).status, 400);
    assert.equal(state.writes.length, before);
  }
  const revisedStages = { cookingWorkerCount: 3, cookingWorkHours: 4, packagingWorkerCount: 2, packagingWorkHours: 0.5 };
  assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: stageId, ...revisedStages }, 'PATCH'))).status, 200);
  assert.equal(stageRun.worker_count, 3); assert.equal(stageRun.work_hours, 4); assert.equal(stageRun.total_person_hours, 13);
  wage = 1500;
  assert.equal((await finance.PATCH(request('/finance', { action: 'sync_run_labor', id: stageId }, 'PATCH'))).status, 200);
  assert.equal(stageRun.total_person_hours, 13); assert.equal(stageRun.labor_cost, 19500); assert.equal(stageRun.packaging_work_hours, 0.5);
  assert.equal(stageRun.total_cost, 21660); assert.equal(laborDates.at(-1), '2026-10-14');
  assert.equal(state.rows.char_siu_production_outputs.find(row => row.run_id === stageId && row.output_key === 'block').unit_cost, 4332);
  assert.equal((await api.POST(request('/production', { ...oldStageEdit, workerCount: 3, workHours: 4 }))).status, 200);
  assert.equal(stageRun.total_person_hours, 13); assert.equal(stageRun.packaging_worker_count, 2);
  assert.equal((await api.POST(request('/production', { ...legacyEdit, workerCount: 3, workHours: 2 }))).status, 200);
  assert.equal(run.cooking_worker_count, null); assert.equal(run.total_person_hours, 6, 'legacy aggregate records remain editable without inferring a stage split');
  authorized = false; context = false;
  const beforeDenied = state.writes.length;
  assert.equal((await api.GET(request('/production', undefined, 'GET'))).status, 401);
  assert.equal((await api.POST(request('/production', body))).status, 401);
  assert.equal((await finance.PATCH(request('/finance', { action: 'run', id: created.id }, 'PATCH'))).status, 401);
  assert.equal(state.writes.length, beforeDenied);
  authorized = true; financeCookie = false;
  assert.equal((await finance.GET(request('/finance', undefined, 'GET'))).status, 403);

  const contracts = loadTs('lib/data-access/operation-contracts.ts', {
    'next/server': { NextRequest: Request }, './contracts': { isUuid: value => /^[a-f\d-]{36}$/i.test(value), DataAccessError: class extends Error {} },
  });
  const recipeSchema = loadTs('lib/data-access/recipe-operations.ts', { './operation-contracts': contracts }).recipeOperations.find(row => row.name === 'recipe.char_siu_save_production').inputSchema;
  const financeSchema = loadTs('lib/data-access/other-operations.ts', { './operation-contracts': contracts }).otherOperations.find(row => row.name === 'finance_char_siu_update').inputSchema;
  for (const packagingDate of [undefined, null, '2026-10-15']) {
    const value = { ...body, deliveryNoteScanId: reviewed.id }; if (packagingDate === undefined) delete value.packagingDate; else value.packagingDate = packagingDate;
    contracts.validateOperationSchema(recipeSchema, { body: value });
    contracts.validateOperationSchema(financeSchema, { body: { action: 'run', id: created.id, ...(packagingDate === undefined ? {} : { packagingDate }) } });
  }
  assert.throws(() => contracts.validateOperationSchema(recipeSchema, { body: { ...body, packagingDate: '2026-02-31' } }));
  assert.throws(() => contracts.validateOperationSchema(financeSchema, { body: { action: 'run', id: created.id, packagingDate: '2026-02-31' } }));
  contracts.validateOperationSchema(recipeSchema, { body: { ...body, ...stages } });
  contracts.validateOperationSchema(financeSchema, { body: { action: 'run', id: stageId, ...stages } });
  for (let mask = 1; mask < 15; mask++) {
    const partial = Object.fromEntries(Object.entries(stages).filter((_, index) => mask & (1 << index)));
    assert.throws(() => contracts.validateOperationSchema(recipeSchema, { body: { ...body, ...partial } }));
    assert.throws(() => contracts.validateOperationSchema(financeSchema, { body: { action: 'run', id: stageId, ...partial } }));
  }
  for (const invalid of [{ ...stages, cookingWorkerCount: 1.5 }, { ...stages, cookingWorkHours: 0 }, { ...stages, packagingWorkHours: null }, { ...stages, packagingWorkerCount: '3' }]) {
    assert.throws(() => contracts.validateOperationSchema(recipeSchema, { body: { ...body, ...invalid } }));
    assert.throws(() => contracts.validateOperationSchema(financeSchema, { body: { action: 'run', id: stageId, ...invalid } }));
  }
  const withoutLegacyPair = { ...body, ...stages }; delete withoutLegacyPair.workerCount;
  assert.throws(() => contracts.validateOperationSchema(recipeSchema, { body: withoutLegacyPair }), 'MCP keeps the existing required legacy pair');
}

const savedEnvironment = Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
const savedConsole = { error: console.error, warn: console.warn };
console.error = () => {}; console.warn = () => {};
main().then(() => process.stdout.write('char siu stage labor, legacy compatibility, dates, delivery notes and cost allocation: PASS\n')).catch(error => {
  savedConsole.error(error); process.exitCode = 1;
}).finally(() => {
  Object.assign(console, savedConsole);
  for (const [key, value] of Object.entries(savedEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
