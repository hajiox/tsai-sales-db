const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
function loadTs(relative, stubs = {}) {
  const filename = path.join(root, relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = Module.createRequire(filename);
  instance.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  instance._compile(compiled, filename);
  return instance.exports;
}

const display = loadTs("lib/web-sales-acquisition-display.ts");
const channels = ["amazon", "rakuten", "yahoo", "base", "mercari", "qoo10", "tiktok"];
const issue = (channel) => ({ channel, label: channel, status: "waiting_for_user", reason: "認証の確認が必要です", retryPolicy: { mode: "automatic", label: "毎朝9:15に自動再実行" } });
const totals = Object.fromEntries(["quantity", "sales", "productCost", "productProfit", "refunds", "platformFees", "paymentFees", "sellerDiscounts", "sellerCoupons", "sellerPoints", "shippingCosts", "otherCosts", "otherCredits", "marketplaceFundedDiscounts", "ecDeductions", "adCost", "sharedAdCost", "finalProfit", "profitRate", "netPayout"].map((key) => [key, 0]));
const adCosts = { google: 0, meta: 0, amazon: 0, rakuten: 0, yahoo: 0, other: 0 };
const rows = channels.map((channel) => ({ ...totals, channel, label: channel, hasSettlement: false, settlementComplete: false, settlementStatus: "waiting_for_user", settlementReason: "確認が必要", retryPolicy: { mode: "automatic", label: "毎朝9:15に自動再実行" }, directAdCost: 0, netPayout: null, reportedGross: 0, adjustedReportedGross: 0, reconciliationDifference: null }));
const comparison = { month: "2026-08", totals, adCosts, channels: rows };
let payload = {
  month: "2026-09", channels: rows, totals, adCosts,
  comparisons: { previousMonth: comparison, previousYear: { ...comparison, month: "2025-09" } },
  completeness: { isFinal: false, completedSettlements: 0, estimatedSettlements: 0, totalSettlements: 7, missingChannels: ["rakuten", "yahoo", "qoo10", "tiktok"], settlementIssues: ["rakuten", "yahoo", "qoo10", "tiktok"].map(issue), salesJobs: { total: 7, completed: 0 }, adJobs: { total: 5, completed: 0 } },
};
let hook = 0;
const loaded = loadTs("app/web-sales/advertising/ec-profit-overview.tsx", {
  react: { ...React, useEffect: () => {}, useState: (initial) => [hook++ === 0 ? payload : initial, () => {}] },
  "lucide-react": new Proxy({}, { get: () => () => null }),
  "@/components/AcquisitionRouteBadge": { AcquisitionRouteMark: () => null },
  "@/lib/web-sales-acquisition-display": display,
});
function tree() { hook = 0; return loaded.default({ month: "2026-09" }); }
function findButton(node, label) {
  if (!React.isValidElement(node)) return null;
  if (node.type === "button" && React.Children.toArray(node.props.children).some((child) => typeof child === "string" && child.trim() === label)) return node;
  for (const child of React.Children.toArray(node.props.children)) { const found = findButton(child, label); if (found) return found; }
  return null;
}

async function main() {
  const view = tree();
  const html = renderToStaticMarkup(view);
  const actionArea = html.split("EC別 経費内訳")[0];
  assert.match(actionArea, /未確定のEC精算：2社/);
  assert.doesNotMatch(actionArea, /qoo10|tiktok|mercari/, "Retired channels must not generate new operator action");
  assert.doesNotMatch(html, /毎朝9:15に自動再実行|自動確認中/, "An old retry policy must not promise resumed schedules");
  assert.match(html, /原本・対象月確定後に手動確認/);
  for (const channel of channels) assert.match(html.split("EC別 経費内訳")[1], new RegExp(channel), "Historical financial cards remain visible");

  const nativeFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    if (options?.method === "POST") { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ summary: "待機中" }) }; }
    return { ok: true, json: async () => payload };
  };
  try {
    await findButton(view, "公式データを再取得").props.onClick();
    assert.equal(calls[0].url, "/api/web-sales/acquisition/run");
    assert.deepEqual(calls[0].body.channels, ["rakuten", "yahoo"]);
    assert.equal(calls[0].body.incompleteOnly, true);
    await findButton(view, "概算を再計算").props.onClick();
    assert.deepEqual(calls[1].body.channels, ["rakuten", "yahoo"], "Estimate updates also preserve retired historical channels");
  } finally { global.fetch = nativeFetch; }

  payload = { ...payload, completeness: { ...payload.completeness, missingChannels: ["qoo10", "tiktok"], settlementIssues: ["qoo10", "tiktok"].map(issue) } };
  assert.equal(findButton(tree(), "公式データを再取得"), null, "No acquisition button is offered for retired-only missing data");
  assert.match(renderToStaticMarkup(tree()), /qoo10/);
  console.log("EC profit acquisition UI: manual review, active channels and preserved history passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
