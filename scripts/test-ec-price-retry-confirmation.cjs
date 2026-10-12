const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const componentFile = "app/recipe/_components/EcPriceSyncControls.tsx";
const fixtureJob = {
  id: "lp-retry-fixture",
  status: "needs_review",
  progress: 0,
  currentStep: "商品LPの確認待ち",
  errorMessage: null,
  targets: [],
  newPriceInclTax: 1944,
  summary: null,
  planValidated: true,
  sites: [],
  lp: { required: true, status: "blocked", message: "商品LP未完了" },
  createdAt: "2026-10-11T01:00:00Z",
  startedAt: null,
  heartbeatAt: null,
  updatedAt: null,
  completedAt: null,
};

// Execute the actual client component and its handlers with inert hooks/JSX.
// Effects, browser confirmations and API requests are explicitly controlled;
// the reusable Radix dialog supplies focus, keyboard and alertdialog semantics.
function createHarness(job = fixtureJob) {
  const slots = [];
  const calls = [];
  const notifications = [];
  const nativeConfirmations = [];
  let cursor = 0;
  let effects = [];
  let currentJob = structuredClone(job);
  let tree;
  const props = {
    recipeId: "recipe-fixture",
    recipeName: "試験用レシピ",
    ecProductName: "試験用商品",
    productLpUrl: "https://lp.example.test/",
    sellingPriceInclTax: 1944,
    expectedRecipeSnapshot: { id: "recipe-fixture", sellingPriceInclTax: 1944, product: { code: "fixture" } },
    hasUnsavedChanges: false,
    isSaving: false,
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (callback) => callback,
    useEffect: (effect) => { effects.push(effect); },
  };
  const jsx = (type, elementProps) => ({ type, props: elementProps });
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const filename = path.join(root, relative);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const compiledModule = { exports: {} };
    cache.set(relative, compiledModule);
    const mocks = {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
      "lucide-react": new Proxy({}, { get: (_, name) => name }),
      sonner: { toast: new Proxy({}, { get: (_, kind) => (message) => notifications.push({ kind, message }) }) },
      "@/components/ui/alert-dialog": Object.fromEntries([
        "AlertDialog", "AlertDialogAction", "AlertDialogCancel", "AlertDialogContent",
        "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle",
      ].map((name) => [name, name])),
    };
    vm.runInNewContext(compiled, {
      module: compiledModule,
      exports: compiledModule.exports,
      require(specifier) {
        if (specifier in mocks) return mocks[specifier];
        if (specifier.startsWith("@/lib/")) return load(`${specifier.slice(2)}.ts`);
        throw new Error(`Unexpected test dependency: ${specifier}`);
      },
      console,
      window: { confirm: (message) => { nativeConfirmations.push(message); return false; } },
      async fetch(url, options = {}) {
        calls.push({ url, options });
        if (options.method === "POST") return { ok: true, json: async () => ({
          job: { ...currentJob, status: "queued" }, reserved: JSON.parse(options.body).dispatchMode === "reserved",
        }) };
        return { ok: true, json: async () => url.endsWith("/ec-price-jobs") ? { latestJob: currentJob, history: [] } : {} };
      },
    }, { filename });
    return compiledModule.exports;
  }
  const Component = load(componentFile).default;
  function render() {
    cursor = 0;
    effects = [];
    tree = Component(props);
    return tree;
  }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join("");
    if (node && typeof node === "object") return text(node.props?.children);
    return node == null || typeof node === "boolean" ? "" : String(node);
  }
  function find(type, label) {
    const element = nodes(tree).find((node) => node.type === type && (label === undefined || text(node).includes(label)));
    assert.ok(element, `Missing ${type}: ${label || ""}`);
    return element;
  }
  async function flush() {
    for (let index = 0; index < 8; index++) await Promise.resolve();
    render();
  }
  async function refresh() {
    render();
    effects[0](); // Only the initial read-only job hydration effect; no polling timers.
    await flush();
  }
  function open() {
    find("button", "未完了だけ再実行").props.onClick();
    render();
    assert.equal(find("AlertDialog").props.open, true);
  }
  return {
    props, calls, notifications, nativeConfirmations, render, find, text, flush, refresh, open,
    checkbox: (label) => {
      const input = nodes(tree).find((node) => node.type === "input" && node.props["aria-label"] === label);
      assert.ok(input, `Missing checkbox: ${label}`);
      return input;
    },
    posts: () => calls.filter(({ options }) => options.method === "POST"),
    setJob: (nextJob) => { currentJob = structuredClone(nextJob); },
    notifyFinal: () => effects.at(-1)(),
  };
}

(async () => {
  const cancel = createHarness();
  await cancel.refresh();
  cancel.open();
  const description = cancel.text(cancel.find("AlertDialogDescription"));
  assert.match(description, /対象: 商品LP/);
  assert.match(description, /商品: 試験用商品/);
  assert.match(description, /価格（税込）: ¥1,944/);
  assert.match(description, /反映済み・対象商品なしの工程は再実行しません/);
  assert.equal(cancel.posts().length, 0, "Opening confirmation must never enqueue a job");
  cancel.find("AlertDialogCancel", "キャンセル");
  cancel.find("AlertDialog").props.onOpenChange(false);
  cancel.render();
  cancel.find("AlertDialogAction", "実行する").props.onClick();
  await cancel.flush();
  assert.equal(cancel.posts().length, 0, "Cancelling must invalidate the confirmation");
  assert.equal(cancel.nativeConfirmations.length, 0, "Retry must not use a native JS dialog");

  const execute = createHarness();
  await execute.refresh();
  execute.open();
  const action = execute.find("AlertDialogAction", "実行する");
  assert.equal(action.props.disabled, false);
  action.props.onClick();
  action.props.onClick();
  assert.equal(execute.posts().length, 1, "Rapid repeated confirmation must enqueue only once");
  await execute.flush();
  assert.equal(execute.find("AlertDialog").props.open, false);
  assert.equal(execute.posts()[0].url, "/api/recipe/recipe-fixture/ec-price-jobs");
  assert.deepEqual(JSON.parse(execute.posts()[0].options.body), {
    retryUnfinishedFromJobId: fixtureJob.id,
    dispatchMode: "immediate",
    expectedPriceInclTax: 1944,
    expectedRecipeSnapshot: execute.props.expectedRecipeSnapshot,
    expectedRetryScope: { targets: [], verificationOnlyTargets: [], lpUpdate: true },
    selectedRetryScope: { targets: [], lpUpdate: true },
  }, "Retain the existing locked retry API contract");
  assert.equal(execute.posts()[0].options.headers["content-type"], "application/json");

  const mixed = createHarness({
    ...fixtureJob,
    targets: ["amazon", "rakuten", "yahoo", "base"],
    sites: [
      { site: "amazon", status: "submitted_pending" },
      { site: "rakuten", status: "updated" },
      { site: "yahoo", status: "blocked" },
      { site: "base", status: "not_found" },
    ],
  });
  await mixed.refresh();
  mixed.open();
  assert.match(mixed.text(mixed.find("AlertDialogDescription")), /対象: Amazon（反映確認のみ）・Yahoo・商品LP/,
    "Keep successful/absent sites out, but allow pending prices to be verified without resubmission");
  assert.match(mixed.text(mixed.find("AlertDialogDescription")), /価格を再送信しません/);
  assert.equal(mixed.posts().length, 0);

  const fullScope = { targets: ["amazon", "rakuten", "yahoo"], verificationOnlyTargets: ["yahoo"], lpUpdate: true };
  const selectableJob = { ...fixtureJob, retryScope: fullScope };
  const selection = createHarness(selectableJob);
  await selection.refresh();
  selection.open();
  for (const label of ["Amazon", "楽天", "Yahoo", "商品LP"]) {
    assert.equal(selection.checkbox(`${label}を再実行`).props.checked, true, "Default selection includes every unfinished step");
  }
  for (const label of ["Amazon", "楽天", "商品LP"]) {
    selection.checkbox(`${label}を再実行`).props.onChange({ target: { checked: false } });
    selection.render();
  }
  assert.match(selection.text(selection.find("AlertDialogDescription")), /対象: Yahoo（反映確認のみ）/);
  selection.find("AlertDialogAction").props.onClick();
  await selection.flush();
  const selectedPayload = JSON.parse(selection.posts()[0].options.body);
  assert.deepEqual(selectedPayload.expectedRetryScope, fullScope, "Freeze and send the full scope even when Amazon is left unselected");
  assert.deepEqual(selectedPayload.selectedRetryScope, { targets: ["yahoo"], lpUpdate: false });
  assert.equal("verificationOnlyTargets" in selectedPayload.selectedRetryScope, false, "Only the server determines readonly targets");

  const empty = createHarness(selectableJob);
  await empty.refresh(); empty.open();
  for (const label of ["Amazon", "楽天", "Yahoo", "商品LP"]) {
    empty.checkbox(`${label}を再実行`).props.onChange({ target: { checked: false } }); empty.render();
  }
  assert.equal(empty.find("AlertDialogAction").props.disabled, true);
  empty.find("AlertDialogAction").props.onClick(); await empty.flush();
  assert.equal(empty.posts().length, 0, "An empty subset cannot enqueue even if the handler is called directly");
  empty.checkbox("商品LPを再実行").props.onChange({ target: { checked: true } }); empty.render();
  assert.match(empty.text(empty.find("AlertDialogDescription")), /対象: 商品LP/);
  empty.find("AlertDialogAction").props.onClick(); await empty.flush();
  assert.deepEqual(JSON.parse(empty.posts()[0].options.body).selectedRetryScope, { targets: [], lpUpdate: true },
    "LP-only retry does not include any unselected EC");

  const subsetStale = createHarness(selectableJob);
  await subsetStale.refresh(); subsetStale.open();
  subsetStale.checkbox("Amazonを再実行").props.onChange({ target: { checked: false } }); subsetStale.render();
  subsetStale.setJob({ ...selectableJob, retryScope: { ...fullScope, targets: ["rakuten", "yahoo"] } });
  await subsetStale.refresh();
  subsetStale.find("AlertDialogAction").props.onClick(); await subsetStale.flush();
  assert.equal(subsetStale.posts().length, 0, "An unselected target changing still invalidates confirmation");
  assert.equal(subsetStale.notifications.at(-1)?.kind, "warning");

  const completedLp = createHarness({
    ...fixtureJob,
    status: "completed",
    lp: { required: true, status: "updated", message: "公開確認済み" },
    retryScope: { targets: ["amazon"], verificationOnlyTargets: ["amazon"], lpUpdate: false },
  });
  await completedLp.refresh();
  assert.match(completedLp.text(completedLp.render()), /未完了工程あり/);
  completedLp.open();
  assert.match(completedLp.text(completedLp.find("AlertDialogDescription")), /対象: Amazon（反映確認のみ）/);
  completedLp.find("AlertDialogAction", "実行する").props.onClick();
  await completedLp.flush();
  assert.deepEqual(JSON.parse(completedLp.posts()[0].options.body).expectedRetryScope,
    { targets: ["amazon"], verificationOnlyTargets: ["amazon"], lpUpdate: false },
    "A completed LP-only retry must keep unfinished ancestor EC available without reprocessing the LP");

  const terminal = createHarness({ ...fixtureJob, status: "queued" });
  await terminal.refresh();
  terminal.setJob({
    ...fixtureJob, status: "completed", lp: { required: true, status: "updated" },
    retryScope: { targets: ["amazon"], verificationOnlyTargets: ["amazon"], lpUpdate: false },
  });
  await terminal.refresh();
  terminal.notifyFinal();
  await terminal.flush();
  assert.equal(terminal.notifications.at(-1)?.kind, "warning",
    "Terminal polling must not announce whole-campaign success while ancestor work remains");
  assert.match(terminal.notifications.at(-1)?.message, /未完了の工程が残っています/);

  for (const change of [
    (harness) => { harness.props.sellingPriceInclTax = 2000; },
    (harness) => { harness.props.expectedRecipeSnapshot.product.code = "changed"; },
    (harness) => { harness.props.recipeId = "different-recipe"; },
    (harness) => { harness.props.ecProductName = "別の商品"; },
    async (harness) => { harness.setJob({ ...fixtureJob, id: "different-job" }); await harness.refresh(); },
    async (harness) => { harness.setJob({ ...fixtureJob, targets: ["rakuten"] }); await harness.refresh(); },
    async (harness) => { harness.setJob({ ...fixtureJob, retryScope: { targets: ["amazon"], verificationOnlyTargets: ["amazon"], lpUpdate: true } }); await harness.refresh(); },
  ]) {
    const stale = createHarness();
    await stale.refresh();
    stale.open();
    await change(stale);
    stale.render();
    stale.find("AlertDialogAction").props.onClick();
    await stale.flush();
    assert.equal(stale.posts().length, 0, "A changed product, price, snapshot or target must require fresh confirmation");
    assert.equal(stale.find("AlertDialog").props.open, false);
    assert.equal(stale.notifications.at(-1)?.kind, "warning");
  }

  const busy = createHarness();
  await busy.refresh();
  busy.open();
  busy.props.hasUnsavedChanges = true;
  busy.render();
  assert.equal(busy.find("AlertDialogAction").props.disabled, true);
  busy.find("AlertDialogAction").props.onClick();
  await busy.flush();
  assert.equal(busy.posts().length, 0, "Unsaved changes must retain the existing submission guard");

  for (const dispatchMode of ["immediate", "reserved"]) {
    const normal = createHarness();
    await normal.refresh();
    if (dispatchMode === "reserved") { normal.find("button", "一括実行へ予約").props.onClick(); normal.render(); }
    normal.find("button", dispatchMode === "reserved" ? "Amazonを予約" : "Amazon").props.onClick(); normal.render();
    assert.equal(normal.find("AlertDialog").props.open, true);
    assert.match(normal.text(normal.find("AlertDialogDescription")), /対象: Amazon/);
    assert.match(normal.text(normal.find("AlertDialogDescription")), /商品: 試験用商品/);
    assert.match(normal.text(normal.find("AlertDialogDescription")), dispatchMode === "reserved" ? /予約価格（税込）: ¥1,944/ : /新価格（税込）: ¥1,944/);
    assert.match(normal.text(normal.find("AlertDialogDescription")), /商品LPも必須更新: https:\/\/lp.example.test\//);
    if (dispatchMode === "reserved") assert.match(normal.text(normal.find("AlertDialogDescription")), /押すまでECサイトは変更しません/);
    assert.equal(normal.posts().length, 0, "Opening normal confirmation does not enqueue");
    assert.equal(normal.nativeConfirmations.length, 0, "Normal immediate and reserved flow use the app dialog");
    const normalAction = normal.find("AlertDialogAction", dispatchMode === "reserved" ? "予約する" : "実行する");
    normalAction.props.onClick(); normalAction.props.onClick(); await normal.flush();
    assert.equal(normal.posts().length, 1, "Normal confirmation is protected from duplicate clicks");
    assert.deepEqual(JSON.parse(normal.posts()[0].options.body), {
      targets: ["amazon"], dispatchMode, expectedPriceInclTax: 1944, expectedRecipeSnapshot: normal.props.expectedRecipeSnapshot,
    }, "Normal enqueue keeps the confirmed immutable target, dispatch mode, price and snapshot");
  }
  const normalCancel = createHarness();
  await normalCancel.refresh();
  normalCancel.find("button", "Amazon").props.onClick(); normalCancel.render();
  normalCancel.find("AlertDialog").props.onOpenChange(false); normalCancel.render();
  assert.equal(normalCancel.posts().length, 0);
  assert.equal(normalCancel.find("AlertDialog").props.open, false, "Cancel closes and invalidates normal confirmation");
  for (const change of [
    (harness) => { harness.props.sellingPriceInclTax = 2000; },
    (harness) => { harness.props.expectedRecipeSnapshot.product.code = "changed"; },
    (harness) => { harness.props.recipeId = "changed-recipe"; },
    (harness) => { harness.props.ecProductName = "changed-product"; },
    (harness) => { harness.props.productLpUrl = "https://other.example.test/"; },
    (harness) => { harness.find("button", "一括実行へ予約").props.onClick(); },
  ]) {
    const normalStale = createHarness(); await normalStale.refresh();
    normalStale.find("button", "Amazon").props.onClick(); normalStale.render();
    change(normalStale); normalStale.render();
    normalStale.find("AlertDialogAction", "実行する").props.onClick(); await normalStale.flush();
    assert.equal(normalStale.posts().length, 0, "Changed normal confirmation inputs must require a fresh confirmation");
    assert.equal(normalStale.notifications.at(-1)?.kind, "warning");
  }
  console.log("EC price confirmation tests passed (retry subsets/readonly, normal immediate/reserved dialogs, cancel/empty, locked payload, duplicate/stale guards).");
})().catch((error) => { console.error(error); process.exitCode = 1; });
