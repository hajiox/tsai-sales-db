const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const state = { admin: true, tables: {}, writes: [] };
function query(table) {
  let rows = [...(state.tables[table] || [])];
  let inserted = false;
  const chain = {
    select() { return chain; },
    eq(key, value) { rows = rows.filter((row) => row[key] === value); return chain; },
    in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return chain; },
    contains(key, values) { rows = rows.filter((row) => Object.entries(values).every(([k, v]) => row[key]?.[k] === v)); return chain; },
    lte(key, value) { rows = rows.filter((row) => row[key] <= value); return chain; },
    order(key, options) { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1)); return chain; },
    limit(count) { rows = rows.slice(0, count); return chain; },
    insert(value) { inserted = true; rows = [{ id: "new-job", created_at: "2026-10-12T03:00:00Z", ...value }]; return chain; },
    async maybeSingle() { return result(true); },
    async single() { return result(true); },
    then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
  };
  function result(single) {
    if (inserted) { state.writes.push({ table, value: rows[0] }); inserted = false; }
    return { data: single ? rows[0] || null : rows, error: null };
  }
  return chain;
}
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  cache.set(relative, compiledModule);
  const mocks = {
    "server-only": {},
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    "@/lib/data-access/business-operation-context": {
      getBusinessAdminSession: async () => state.admin ? { user: { email: "admin@example.test" } } : null,
      isBusinessAdminSession: (session) => Boolean(session),
    },
    "@/lib/ec-operation-policy": { inactiveEcOperationTargets: () => [], ecOperationBlockedMessage: () => "inactive" },
    "@/lib/web-sales-automation/sync": { getWebSalesAutomationServiceClient: () => ({ from: query }) },
    "@/lib/ec-price-product-mappings": { loadEcPriceProductMappings: async () => ({}) },
    "@/lib/ec-price-verified-registry": { getEcPriceLpSource: () => null, getEcPriceVerifiedIdentifiers: () => ({}) },
    "@/lib/ec-price-reservations": {
      EC_PRICE_RESERVATION_SCHEDULED_AT: "2099-01-01T00:00:00Z",
      isReservedEcPriceJob: () => false,
      normalizeEcPriceDispatchMode: (value) => value === "reserved" ? "reserved" : "immediate",
    },
  };
  vm.runInNewContext(output, {
    exports: compiledModule.exports, module: compiledModule, URL, console,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/lib/")) return load(`${name.slice(2)}.ts`);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  return compiledModule.exports;
}
const { getEcPriceRetryScope } = load("lib/ec-price-codex.ts");
const { buildEcPriceRecipeSnapshot } = load("lib/ec-price-job-server.ts");
const route = load("app/api/recipe/[id]/ec-price-jobs/route.ts");
const recipe = { id: "recipe-1", name: "試験用5食", selling_price: 1800, product_lp_url: "https://lp.example.test/", is_intermediate: false };
const snapshot = buildEcPriceRecipeSnapshot(recipe);
const original = {
  id: "original", task_key: "ec_price_update", status: "needs_review", created_at: "2026-10-10T01:00:00Z",
  parameters: { recipeId: recipe.id, recipeSnapshot: snapshot, newPriceInclTax: 1944, targets: ["amazon", "rakuten", "yahoo", "base"], lpUpdate: true },
  result: {
    validated_plan_checkpoint: true,
    plan: { reference_standard_price: 1850, sites: ["amazon", "rakuten", "yahoo", "base"].map((site) => ({ site, status: "planned", basis_price: 1850, target_price: 1944, product_identifier: `${site}-1` })) },
    sites: ["amazon", "rakuten", "yahoo", "base"].map((site) => ({ site, status: site === "amazon" ? "submitted_pending" : "updated", final_price: site === "amazon" ? 1850 : 1944 })),
    lp: { required: true, status: "blocked" },
  },
};
const lpOnly = {
  ...original, id: "lp-only", status: "completed", created_at: "2026-10-11T01:00:00Z",
  parameters: { ...original.parameters, targets: [], retryUnfinishedFromJobId: original.id },
  result: { validated_plan_checkpoint: true, sites: [], lp: { required: true, status: "updated" } },
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const expectedScope = { targets: ["amazon"], verificationOnlyTargets: ["amazon"], lpUpdate: false };
assert.deepEqual(plain(getEcPriceRetryScope([original, lpOnly], lpOnly)), expectedScope,
  "Latest LP completion must retain pending Amazon and exclude every completed EC/LP");
for (const parameters of [
  { ...original.parameters, recipeId: "another-recipe" },
  { ...original.parameters, newPriceInclTax: 2000 },
  { ...original.parameters, priceRevisionId: "another-revision" },
  { ...original.parameters, recipeSnapshot: { ...snapshot, janCode: "different-jan" } },
  { ...original.parameters, recipeSnapshot: { ...snapshot, storageMethod: "冷凍" } },
]) {
  const other = { ...original, id: "other", created_at: "2026-10-12T01:00:00Z", parameters,
    result: { ...original.result, sites: original.result.sites.map((site) => ({ ...site, status: "blocked" })) } };
  assert.deepEqual(plain(getEcPriceRetryScope([other, original, lpOnly], lpOnly)), expectedScope,
    "Do not aggregate another product, price, revision or immutable product snapshot");
}
const verified = { ...original, id: "verified", created_at: "2026-10-12T01:00:00Z",
  parameters: { ...original.parameters, targets: ["amazon"], verificationOnlyTargets: ["amazon"], lpUpdate: false },
  result: { validated_plan_checkpoint: true, sites: [{ site: "amazon", status: "updated", final_price: 1944 }] } };
assert.deepEqual(plain(getEcPriceRetryScope([verified, original, lpOnly], verified)),
  { targets: [], verificationOnlyTargets: [], lpUpdate: false }, "A later verification completes only its EC and preserves earlier LP success");
const verificationFailed = { ...verified, result: { validated_plan_checkpoint: true, sites: [{ site: "amazon", status: "blocked" }] } };
assert.deepEqual(plain(getEcPriceRetryScope([verificationFailed, original, lpOnly], verificationFailed)), expectedScope,
  "A failed readonly verification must not turn an already-submitted price into a write retry");

function reset(jobs = [lpOnly, original]) {
  state.admin = true;
  state.writes = [];
  state.tables = { recipes: [recipe], web_sales_codex_jobs: structuredClone(jobs) };
}
const requestBody = {
  retryUnfinishedFromJobId: lpOnly.id, dispatchMode: "immediate", expectedPriceInclTax: 1944,
  expectedRecipeSnapshot: recipe, expectedRetryScope: expectedScope,
};
const post = (body = requestBody) => route.POST({ json: async () => body }, { params: Promise.resolve({ id: recipe.id }) });
(async () => {
  reset();
  const get = await route.GET({ url: "https://tsa.example.test/api/recipe/recipe-1/ec-price-jobs" }, { params: Promise.resolve({ id: recipe.id }) });
  assert.equal(get.status, 200);
  assert.equal(get.body.latestJob.status, "completed", "Do not rewrite the LP retry's persisted job status");
  assert.deepEqual(plain(get.body.latestJob.retryScope), expectedScope);
  const polled = await route.GET({ url: `https://tsa.example.test/api/recipe/recipe-1/ec-price-jobs?jobId=${lpOnly.id}` }, { params: Promise.resolve({ id: recipe.id }) });
  assert.equal(polled.status, 200);
  assert.deepEqual(plain(polled.body.job.retryScope), expectedScope,
    "Terminal polling must retain unfinished ancestor work immediately, without waiting for the next history refresh");
  const ok = await post();
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const inserted = state.writes.find(({ table }) => table === "web_sales_codex_jobs").value;
  assert.deepEqual(plain(inserted.parameters.targets), ["amazon"]);
  assert.deepEqual(plain(inserted.parameters.verificationOnlyTargets), ["amazon"]);
  assert.equal(inserted.parameters.lpUpdate, false);
  assert.equal(inserted.parameters.newPriceInclTax, 1944);
  assert.equal(inserted.parameters.recoveryPlanSites[0].product_identifier, "amazon-1");
  assert.equal(inserted.parameters.recoveryPlanSites[0].target_price, 1944, "Keep the original validated absolute pending-price plan");
  for (const body of [
    { ...requestBody, expectedRetryScope: { ...expectedScope, targets: ["amazon", "rakuten"] } },
    { ...requestBody, expectedRetryScope: { ...expectedScope, verificationOnlyTargets: [] } },
    { ...requestBody, expectedRetryScope: undefined },
    { ...requestBody, expectedPriceInclTax: 2000 },
    { ...requestBody, expectedRecipeSnapshot: { ...recipe, name: "different" } },
  ]) {
    reset();
    assert.equal((await post(body)).status, 409);
    assert.equal(state.writes.length, 0, "Stale scope/price/product confirmations must never enqueue work");
  }
  reset([verified, lpOnly, original]);
  assert.equal((await post()).status, 409, "A site completed after confirmation must invalidate the old retry scope");
  assert.equal(state.writes.length, 0);
  reset(); state.admin = false;
  assert.equal((await post()).status, 401);
  assert.equal(state.writes.length, 0, "Retain administrator authorization");
  console.log("EC price retry scope tests passed (history, pending readonly contract, identity/revision, stale confirmation and authorization).");
})().catch((error) => { console.error(error); process.exitCode = 1; });
