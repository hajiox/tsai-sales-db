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
        if (options.method === "POST") return { ok: true, json: async () => ({ job: { ...currentJob, status: "queued" } }) };
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
    posts: () => calls.filter(({ options }) => options.method === "POST"),
    setJob: (nextJob) => { currentJob = structuredClone(nextJob); },
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
  assert.match(mixed.text(mixed.find("AlertDialogDescription")), /対象: Yahoo・商品LP/,
    "Keep completed, pending and absent EC targets out of the retry confirmation");
  assert.equal(mixed.posts().length, 0);

  for (const change of [
    (harness) => { harness.props.sellingPriceInclTax = 2000; },
    (harness) => { harness.props.expectedRecipeSnapshot.product.code = "changed"; },
    (harness) => { harness.props.recipeId = "different-recipe"; },
    (harness) => { harness.props.ecProductName = "別の商品"; },
    async (harness) => { harness.setJob({ ...fixtureJob, id: "different-job" }); await harness.refresh(); },
    async (harness) => { harness.setJob({ ...fixtureJob, targets: ["rakuten"] }); await harness.refresh(); },
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

  const normal = createHarness();
  await normal.refresh();
  normal.find("button", "Amazon").props.onClick();
  await normal.flush();
  assert.equal(normal.nativeConfirmations.length, 1, "Normal EC confirmations remain unchanged");
  assert.equal(normal.posts().length, 0);
  console.log("EC price retry confirmation flow tests passed (cancel, locked payload, duplicate/stale guards, normal EC confirmation).");
})().catch((error) => { console.error(error); process.exitCode = 1; });
