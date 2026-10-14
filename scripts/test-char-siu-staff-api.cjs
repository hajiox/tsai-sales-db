const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const crypto = require('node:crypto');
function loadTs(relative, aliases = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = instance.require.bind(instance); instance.require = name => Object.hasOwn(aliases, name) ? aliases[name] : original(name);
  instance._compile(compiled, filename); return instance.exports;
}
const production = loadTs('lib/char-siu-production.ts');
const contract = loadTs('lib/char-siu-staff-production.ts', { '@/lib/char-siu-production': production });
const delivery = loadTs('lib/char-siu-delivery-note.ts', { 'server-only': {} });
const id = '10000000-0000-4000-8000-000000000001'; const other = '10000000-0000-4000-8000-000000000002';
const draftId = '20000000-0000-4000-8000-000000000001'; const scanId = '30000000-0000-4000-8000-000000000001';
const operation = '40000000-0000-4000-8000-000000000001'; const photoId = '50000000-0000-4000-8000-000000000001';
const token = `tsa_csp_${'a'.repeat(43)}`; const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const actor = { deviceId: 'device-01', operatorName: '林' };
const input = contract.parseStaffInput({ productionDate: '2026-10-14', cookingWorkerCount: 2, cookingWorkHours: 3 });
const complete = contract.parseStaffInput({ ...input, packagingDate: '2026-10-15', packagingWorkerCount: 3, packagingWorkHours: 1.5,
  materials: [{ key: 'pork_belly', usageAmount: 2000 }], outputs: [{ key: 'block', quantity: 2 }] }, true);
assert.equal(input.packagingWorkHours, null); assert.equal(complete.outputs.length, 8);
assert.equal(contract.staffActor(new Request('https://fixture.invalid', { headers: { 'x-docscanner-device-id': actor.deviceId, 'x-docscanner-operator-name': encodeURIComponent(' 林 ') } })).operatorName, '林');
for (const invalid of [{ ...input, productionDate: '2026-02-31' }, { ...input, packagingDate: '2026-10-13' }, { ...input, cookingWorkerCount: 1.5 },
  { ...input, packagingWorkHours: 0 }, { ...input, hourlyWage: 100 }, { ...input, outputs: [{ key: 'block', quantity: 1 }, { key: 'block', quantity: 2 }] }]) assert.throws(() => contract.parseStaffInput(invalid));
assert.throws(() => contract.parseStaffInput(input, true));
assert.equal(contract.staffRequestHash({ b: 2, a: 1 }), contract.staffRequestHash({ a: 1, b: 2 }));
const rawItems = ['pork_belly', 'green_onion', 'ginger'].map(material_key => ({ material_key, purchase_unit_quantity_g: 1000, purchase_price_tax_included: 1080, confidence: 1 }));
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const digest = crypto.createHash('sha256').update(png).digest('hex');
const connection = { id, label: 'DocScanner fixture', token_hash: tokenHash, enabled: true, revoked_at: null, expires_at: '2099-01-01T00:00:00Z', allowed_device_ids: null, allowed_operator_names: null };
const draft = { id: draftId, connection_id: id, revision: 1, status: 'draft', input, device_id: actor.deviceId, operator_name: actor.operatorName,
  scan_id: scanId, pending_operation_id: null, run_id: null, created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z',
  hourly_wage: 'FINANCIAL_SENTINEL', material_cost: 'FINANCIAL_SENTINEL', token_hash: 'HASH_SENTINEL', extracted_items: 'PRIVATE_SENTINEL' };
const photo = { id: photoId, draft_id: draftId, scan_id: scanId, file_name: 'invoice.png', mime_type: 'image/png', size_bytes: png.length,
  storage_path: `${id}/${draftId}/${operation}/0-${digest}.png`, sha256: digest, status: 'needs_review', extracted_items: 'PRIVATE_SENTINEL' };
const tables = {
  char_siu_staff_connections: [connection], char_siu_staff_drafts: [draft], char_siu_staff_photos: [photo], char_siu_staff_operations: [],
  char_siu_delivery_note_scans: [{ id: scanId, status: 'ready', used_run_id: null, target_production_date: input.productionDate, extracted_items: rawItems,
    updated_at: '2026-10-14T03:04:05.123456+00:00', reviewed_at: '2026-10-14T03:00:00+00:00' }],
  char_siu_production_settings: [{ id: 1, block_unit_weight_g: 1250, lard_unit_weight_g: 100, minced_chashu_unit_weight_g: 750,
    hourly_wage: 99999, labor_rate_source: 'tsg_manufacturing_average', secret: 'PRIVATE_SENTINEL' }],
  ingredients: production.CHAR_SIU_MATERIALS.map(item => ({ id: item.ingredientId, name: item.name, price: 1000, unit_quantity: 1000, tax_included: true })),
};
const queries = []; const rpcCalls = []; const storageCalls = []; let rpcHandler; let sessionEmail = null; let aiCalls = 0; let laborCalls = 0; let aiError = false; let storageError = false;
const db = {
  from(table) {
    const filters = []; let single = false; let selection = '*'; let count = Infinity;
    const query = {
      select(columns = '*') { selection = columns; return query; }, eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; }, order() { return query; }, limit(value) { count = value; return query; },
      maybeSingle() { single = true; return query; }, single() { single = true; return query; },
      then(accept, reject) {
        queries.push({ table, selection });
        const rows = tables[table].filter(row => filters.every(match => match(row))).slice(0, count).map(row => selection === '*' ? structuredClone(row) : Object.fromEntries(selection.split(',').map(key => [key, structuredClone(row[key])])));
        return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(accept, reject);
      },
    }; return query;
  },
  async rpc(name, args) { rpcCalls.push({ name, args }); assert.ok(rpcHandler, 'unexpected RPC'); return rpcHandler(name, args); },
  storage: { from(bucket) { assert.equal(bucket, contract.STAFF_PHOTO_BUCKET); return {
    async upload(storagePath, bytes, options) { storageCalls.push({ storagePath, size: bytes.length, options }); return { error: storageError ? { message: token } : null }; },
    async download(storagePath) { storageCalls.push({ download: storagePath }); return { data: new Blob([png], { type: 'image/png' }), error: null }; },
  }; } },
};
const aliases = { 'server-only': {}, '@supabase/supabase-js': { createClient: () => db },
  '@/lib/char-siu-production': production, '@/lib/char-siu-delivery-note': delivery, '@/lib/char-siu-staff-production': contract,
  'next-auth': { getServerSession: async () => sessionEmail ? { user: { email: sessionEmail } } : null }, '@/app/api/auth/[...nextauth]/route': { authOptions: {} },
  '@/lib/tsg-manufacturing-labor': { fetchManufacturingAverageHourlyRate: async date => { laborCalls++; assert.equal(date, '2026-10-14'); return { hourlyRate: 1000, staffCount: 2, excludedCount: 0, syncedAt: '2026-10-14T00:00:00Z', effectiveDate: date, source: 'tsg_manufacturing_average' }; } },
  '@/lib/char-siu-delivery-note-ai': { extractCharSiuDeliveryNote: async files => { aiCalls++; assert.equal(files.length, 1); if (aiError) throw new Error(`UPSTREAM_SECRET ${token}`); return { items: delivery.normalizeDeliveryNoteItems(rawItems), documentDate: '2026-10-13' }; } },
};
aliases['@/lib/char-siu-production-service'] = loadTs('lib/char-siu-production-service.ts', aliases);
const server = loadTs('lib/char-siu-staff-production-server.ts', aliases);
function request(body, options = {}) {
  return new Request(`https://fixture.invalid${options.path || '/api/integrations/docscanner/char-siu-production'}`, { method: options.method || (body === undefined ? 'GET' : 'POST'),
    headers: { authorization: `Bearer ${token}`, 'x-docscanner-device-id': actor.deviceId, 'x-docscanner-operator-name': encodeURIComponent(actor.operatorName),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}
async function safe(response, status = 200) {
  assert.equal(response.status, status); const text = await response.text();
  for (const secret of [token, tokenHash, 'FINANCIAL_SENTINEL', 'PRIVATE_SENTINEL', 'HASH_SENTINEL', 'purchasePriceTaxIncluded', 'hourly_wage', 'storage_path']) assert.ok(!text.includes(secret), secret);
  return JSON.parse(text);
}
function result(overrides = {}) { return { replay: false, processing: false, claimed: true, operationId: operation, scanId, draft: structuredClone(draft), photos: [structuredClone(photo)], ...overrides }; }
async function main() {
  const listed = await safe(await server.staffGet(request()));
  assert.equal(listed.config.outputs.find(row => row.key === 'block').unitWeightG, 1250);
  assert.equal(listed.config.materials[0].label, production.CHAR_SIU_MATERIALS[0].name);
  assert.equal(listed.drafts[0].operatorName, '林'); assert.equal(Object.hasOwn(listed.drafts[0], 'connectionId'), false);
  assert.equal(listed.drafts[0].photos[0].scanStatus, 'ready');
  assert.ok(queries.some(query => query.table === 'char_siu_production_settings' && query.selection === 'block_unit_weight_g,lard_unit_weight_g,minced_chashu_unit_weight_g'));
  await safe(await server.staffGet(request(undefined, { headers: { authorization: '' } })), 401);
  await safe(await server.staffGet(request(undefined, { headers: { authorization: 'Bearer invalid' } })), 401);
  await safe(await server.staffGet(request(undefined, { headers: { 'x-docscanner-device-id': '', cookie: 'session=admin' } })), 403);
  await safe(await server.staffGet(request(undefined, { headers: { 'x-docscanner-operator-name': '%ZZ' } })), 403);
  for (const changes of [{ enabled: false }, { revoked_at: '2026-01-01' }, { expires_at: '2000-01-01' }]) {
    const saved = { ...connection }; Object.assign(connection, changes); await safe(await server.staffGet(request()), 401); Object.assign(connection, saved);
  }
  connection.allowed_device_ids = ['different-device']; await safe(await server.staffGet(request()), 403); connection.allowed_device_ids = null;
  connection.allowed_operator_names = ['different-name']; await safe(await server.staffGet(request()), 403); connection.allowed_operator_names = null;
  draft.connection_id = other; await safe(await server.staffGet(request(undefined, { path: `/?draftId=${draftId}` })), 404); draft.connection_id = id;
  await safe(await server.staffGet(request(undefined, { path: '/?sql=select' })), 400);

  const save = { action: 'saveDraft', expectedRevision: 0, clientOperationId: operation, input };
  const ledger = new Map();
  rpcHandler = async (name, args) => {
    assert.equal(name, 'char_siu_staff_apply'); assert.equal(args.p_connection_id, id); assert.equal(args.p_device_id, actor.deviceId); assert.equal(args.p_operator_name, '林');
    const prior = ledger.get(args.p_client_operation_id);
    if (prior && prior.hash !== args.p_request_hash) return { error: { message: 'CSP_IDEMPOTENCY_CONFLICT' } };
    if (!prior) ledger.set(args.p_client_operation_id, { hash: args.p_request_hash, data: result() });
    return { data: ledger.get(args.p_client_operation_id).data, error: null };
  };
  const saved = await safe(await server.staffPost(request(save))); const replay = await safe(await server.staffPost(request(save)));
  assert.deepEqual(saved, replay); assert.equal(rpcCalls.at(-1).args.p_input.packagingWorkHours, null);
  await safe(await server.staffPost(request({ ...save, input: { ...input, notes: 'changed' } })), 409);
  const beforeBad = rpcCalls.length;
  for (const invalid of [{ ...save, sql: 'select 1' }, { ...save, input: { ...input, hourlyWage: 1 } }, { ...save, input: { ...input, cookingWorkerCount: 0 } },
    { ...save, action: 'finalize' }, { ...save, expectedRevision: -1 }, { ...save, clientOperationId: 'bad' }, null, []]) await safe(await server.staffPost(request(invalid)), 400);
  await safe(await server.staffPost(request('{')), 400);
  await safe(await server.staffPost(request('x'.repeat(70 * 1024))), 400);
  assert.equal(rpcCalls.length, beforeBad);
  rpcHandler = async () => ({ error: { message: 'CSP_NOT_READY' } });
  await safe(await server.staffPost(request({ action: 'submit', draftId, expectedRevision: 1, clientOperationId: operation })), 409);
  rpcHandler = async () => ({ data: result({ draft: { ...draft, status: 'needs_review', input: complete, revision: 2 } }), error: null });
  const submitted = await safe(await server.staffPost(request({ action: 'submit', draftId, expectedRevision: 1, clientOperationId: operation })));
  assert.equal(submitted.draft.status, 'needs_review'); assert.equal(submitted.draft.runId, null);
  rpcHandler = async () => ({ error: { message: `database private price ${token}` } });
  await safe(await server.staffPost(request(save)), 503);

  const photosBody = { draftId, expectedRevision: 1, clientOperationId: operation, files: [{ fileName: 'invoice.png', mimeType: 'image/png', base64: png.toString('base64') }] };
  let completedPhoto = false; let processingReplay = false; let completedPhotoError = null;
  rpcHandler = async (name, args) => {
    if (name === 'char_siu_staff_apply') {
      assert.equal(args.p_action, 'reservePhotos'); assert.equal(args.p_photos[0].sha256, digest); assert.equal(Object.hasOwn(args.p_photos[0], 'base64'), false);
      return { data: result({ claimed: !completedPhoto && !processingReplay, processing: processingReplay, errorCode: completedPhoto ? completedPhotoError : null, draft: { ...draft, revision: completedPhoto ? 3 : 2 } }), error: null };
    }
    assert.equal(name, 'char_siu_staff_finish_photos'); assert.equal(args.p_expected_revision, 2); assert.equal(args.p_scan_id, scanId); completedPhoto = true;
    completedPhotoError = args.p_error_code === 'UPLOAD_FAILED' ? 'UPLOAD_FAILED' : null;
    return { data: result({ errorCode: completedPhotoError, draft: { ...draft, revision: 3 }, photos: [{ ...photo, status: completedPhotoError ? 'error' : 'needs_review' }] }), error: null };
  };
  await safe(await server.staffPhotos(request(photosBody))); assert.equal(aiCalls, 1); assert.equal(storageCalls.length, 1); assert.equal(storageCalls[0].options.upsert, false);
  await safe(await server.staffPhotos(request(photosBody))); assert.equal(aiCalls, 1); assert.equal(storageCalls.length, 1, 'exact replay cannot upload or run AI again');
  processingReplay = true; const processing = await safe(await server.staffPhotos(request(photosBody)), 202); assert.equal(processing.processing, true); assert.equal(aiCalls, 1);
  processingReplay = false; completedPhoto = false; aiError = true;
  await safe(await server.staffPhotos(request(photosBody))); assert.equal(rpcCalls.at(-1).args.p_error_code, 'AI_REVIEW_REQUIRED'); aiError = false;
  completedPhoto = false; storageError = true; const beforeAi = aiCalls;
  const uploadFailure = await safe(await server.staffPhotos(request(photosBody)), 409); assert.equal(uploadFailure.code, 'UPLOAD_FAILED'); assert.equal(uploadFailure.draft.id, draftId);
  assert.equal(uploadFailure.draft.photos[0].scanStatus, 'error'); assert.equal(aiCalls, beforeAi); assert.equal(rpcCalls.at(-1).args.p_error_code, 'UPLOAD_FAILED'); storageError = false;
  const beforeFailureReplay = storageCalls.length;
  const replayFailure = await safe(await server.staffPhotos(request(photosBody)), 409); assert.equal(replayFailure.code, 'UPLOAD_FAILED');
  assert.equal(storageCalls.length, beforeFailureReplay); assert.equal(aiCalls, beforeAi, 'confirmed failed operation cannot upload or run AI again');
  const beforeInvalidPhoto = rpcCalls.length;
  const paddedPng = Buffer.concat([png, Buffer.from([0])]).toString('base64');
  const nonCanonicalPng = paddedPng.slice(0, -3) + 'B==';
  assert.deepEqual(Buffer.from(nonCanonicalPng, 'base64'), Buffer.from(paddedPng, 'base64'));
  for (const files of [[], Array(5).fill(photosBody.files[0]), [{ ...photosBody.files[0], fileName: '../secret' }], [{ ...photosBody.files[0], mimeType: 'image/jpeg' }],
    [{ ...photosBody.files[0], fileName: 'a'.repeat(161) }], [{ ...photosBody.files[0], base64: nonCanonicalPng }],
    [{ ...photosBody.files[0], base64: 'not base64' }], [{ ...photosBody.files[0], base64: Buffer.alloc(contract.STAFF_PHOTO_BYTES + 1).toString('base64') }]]) await safe(await server.staffPhotos(request({ ...photosBody, files })), 400);
  assert.equal(rpcCalls.length, beforeInvalidPhoto);

  await safe(await server.managerDraftsGet(request()), 401);
  sessionEmail = 'aizubrandhall@gmail.com';
  const managed = await safe(await server.managerDraftsGet(request()));
  assert.equal(managed.drafts[0].connectionId, id); assert.equal(managed.drafts[0].photos[0].url, `/api/recipe/char-siu-production/staff-drafts/${draftId}/photos/${photoId}`);
  const image = await server.managerPhoto(request(), draftId, photoId); assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  sessionEmail = null; await safe(await server.managerPhoto(request(), draftId, photoId), 401); sessionEmail = 'aizubrandhall@gmail.com';
  const finalize = { action: 'finalize', draftId, expectedRevision: 4, deliveryNoteScanId: scanId, clientOperationId: operation };
  await safe(await server.managerDraftsPost(request(finalize)), 403);
  draft.status = 'needs_review'; draft.input = complete; draft.revision = 4;
  rpcHandler = async (name, args) => {
    assert.equal(name, 'char_siu_staff_finalize'); assert.equal(args.p_scan_updated_at, '2026-10-14T03:04:05.123456+00:00'); assert.deepEqual(args.p_scan_extracted_items, rawItems);
    assert.equal(args.p_run.total_person_hours, 10.5); assert.equal(args.p_run.labor_cost, 10500); assert.equal(args.p_materials.length, 7); assert.equal(args.p_outputs.length, 8);
    assert.equal(args.p_run.created_by, `docscanner:${id}`);
    return { data: result({ draft: { ...draft, status: 'completed', revision: 5, run_id: other } }), error: null };
  };
  const finalResponse = await safe(await server.managerDraftsPost(request(finalize, { headers: { origin: 'https://fixture.invalid' } })));
  assert.equal(finalResponse.draft.status, 'completed'); assert.equal(laborCalls, 1);
  tables.char_siu_staff_operations.push({ connection_id: id, client_operation_id: operation, action: 'finalize', state: 'completed',
    request_hash: contract.staffRequestHash({ actor: sessionEmail, action: 'finalize', draftId, expectedRevision: 4, deliveryNoteScanId: scanId }),
    result: result({ draft: { ...draft, status: 'completed', revision: 5, run_id: other } }) });
  draft.revision = 99; draft.status = 'completed'; const queryStart = queries.length;
  const repeatedFinal = await safe(await server.managerDraftsPost(request(finalize, { headers: { origin: 'https://fixture.invalid' } })));
  assert.equal(repeatedFinal.draft.revision, 5); assert.equal(laborCalls, 1); assert.ok(queries.slice(queryStart).every(query => !['ingredients', 'char_siu_production_settings', 'char_siu_delivery_note_scans'].includes(query.table)));
  await safe(await server.managerDraftsPost(request({ ...finalize, expectedRevision: 5 }, { headers: { origin: 'https://fixture.invalid' } })), 409);
  tables.char_siu_staff_operations.length = 0; draft.status = 'needs_review'; draft.revision = 4;
  rpcHandler = async () => ({ error: { message: 'CSP_REVISION_CONFLICT' } });
  await safe(await server.managerDraftsPost(request(finalize, { headers: { origin: 'https://fixture.invalid' } })), 409);
  assert.equal(rpcCalls.at(-1).args.p_scan_updated_at, '2026-10-14T03:04:05.123456+00:00');
  await safe(await server.managerDraftsPost(request({ ...finalize, input: complete }, { headers: { origin: 'https://fixture.invalid' } })), 400);
}
const environment = Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
main().then(() => process.stdout.write('char siu staff HTTP: auth, sanitized DTO, drafts, photo replay, manager-only atomic preparation: PASS\n')).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
