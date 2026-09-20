const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { analyzeFinance, classifyFinance, financeAction, completedAdChannels } = require("../lib/web-sales-abcd/finance.ts");
const { analyze } = require("../lib/web-sales-abcd/model.ts");
const input = { channel: "amazon", start: "2026-08-01", end: "2026-08-31", metric: "units_sessions", minimumAccess: 100, accessThreshold: null, cvrThreshold: null,
  items: ["one", "two"].map((key, n) => ({ key, name: key, state: "normal", sales: 99999, profit: 99999, access: 1000, conversions: 10 + n })) };
const feeFields = { refunds: 0, platform_fees: 100, payment_fees: 0, seller_discounts: 0, seller_coupons: 0, seller_points: 0, shipping_costs: 0, other_costs: 0, other_credits: 0 };
function fixture() { return {
  products: [{ id: "p1", series_code: 1 }, { id: "p2", series_code: 1 }],
  sales: [{ product_id: "p1", unit_price: 100, unit_cost_ex_ec: 20, amazon_count: 10, yahoo_count: 10 }, { product_id: "p2", unit_price: 100, unit_cost_ex_ec: 95, amazon_count: 5 }],
  mappings: [{ channel: "amazon", external_product_key: "one", product_id: "p1" }, { channel: "amazon", external_product_key: "two", product_id: "p2" }], legacy: [],
  ads: [{ series_code: 1, amazon_cost: 100, google_cost: 100, meta_cost: 100, other_cost: 50 }],
  settlements: [{ channel: "amazon", period_start: input.start, period_end: input.end, coverage_level: "complete", raw_summary: { excluded_ad_costs: 200 }, ...feeFields }],
  completedAds: ["amazon", "google", "meta"],
}; }
let passed = 0;
function test(name, work) { work(); passed++; console.log("PASS", name); }
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-7, `${a} != ${b}`);
test("mid-month ad import is not evidence of full-month coverage", () => {
  const job = {task_key:"ad_cost_import", status:"completed", period_start:input.start, period_end:input.end, channel:"amazon"};
  assert.deepEqual(completedAdChannels([job, {...job,channel:"meta",period_end:"2026-08-15"}, {...job,channel:"google",status:"needs_review"}], input.start, input.end), ["amazon"]);
});
test("same EC fees conserved; series ads shared across EC; no doubled settlement ads", () => {
  const f = analyzeFinance(input, fixture());
  near(f.items.reduce((s, i) => s+i.ecCosts, 0), 100);
  near(f.items.reduce((s, i) => s+i.adCost, 0), 200 + 250 * 1500 / 2500);
  near(f.items[0].profit, 1000-200-100*2/3-200*2/3-100);
  assert.equal(f.items[1].rank, "赤字");
  assert.equal(f.items[0].sales, 1000); // Not the unrelated traffic CSV sales/profit.
});
test("unimported ad data is not zero; recorded zero remains usable", () => {
  const d = fixture(); d.completedAds = ["amazon", "google"];
  assert.equal(analyzeFinance(input, d).items[0].profit, null);
  d.completedAds.push("meta"); d.ads = []; d.settlements[0].raw_summary.excluded_ad_costs=0;
  assert.equal(analyzeFinance(input, d).items[0].adCost, 0);
});
test("partial fees show reference amounts and hold rank; estimated fees explicit", () => {
  const d = fixture(); d.settlements[0].coverage_level = "partial";
  const f = analyzeFinance(input, d);
  assert.equal(f.items[0].quality, "費用一部"); assert.equal(f.counts.保留, 2);
  assert.ok(f.items[0].profit != null);
  d.settlements[0].raw_summary.estimated = true;
  const estimated = analyzeFinance(input, d); assert.equal(estimated.items[0].quality, "推計");
  assert.ok(estimated.notes.some(n => n.includes("概算")));
});
test("missing fees or frozen cost never use zero/current profit/CSV profit", () => {
  const d = fixture(); d.sales[0].unit_cost_ex_ec = null; d.products[0].profit_rate=90;
  assert.equal(analyzeFinance(input, d).items[0].profit, null);
  d.sales[0].unit_cost_ex_ec=20; delete d.settlements[0].platform_fees;
  assert.equal(analyzeFinance(input, d).items[0].profit, null);
});
test("saved name mapping only, ambiguous or duplicate product listings held", () => {
  const d = fixture(); d.mappings=[]; d.legacy=[{title:"one",product_id:"p1"}];
  assert.equal(analyzeFinance(input,d).items[0].productId,"p1");
  d.legacy.push({title:"one",product_id:"p2"});
  assert.equal(analyzeFinance(input,d).items[0].productId,null);
  d.mappings=fixture().mappings; d.mappings[1].product_id="p1";
  const f=analyzeFinance(input,d); assert.equal(f.counts.保留,2); assert.equal(f.items[0].sales,null);
});
test("different period/interim, new/out-of-stock and zero sales hold", () => {
  assert.equal(analyzeFinance({...input,end:"2026-08-15"},fixture()).counts.保留,2);
  const d=fixture(); d.settlements[0].period_end="2026-08-15";
  assert.equal(analyzeFinance(input,d).items[0].ecCosts,null);
  const inp=structuredClone(input); inp.items[0].state="out_of_stock"; inp.items[1].state="new";
  assert.equal(analyzeFinance(inp,fixture()).counts.保留,2);
  d.sales[0].amazon_count=0; d.settlements=fixture().settlements;
  const i=analyzeFinance(input,d).items[0];assert.equal(i.sales,0);assert.equal(i.margin,null);assert.equal(i.rank,"保留");
});
test("missing allocation revenue and unallocated series are visible", () => {
  const d=fixture();d.sales[1].unit_price=null;
  assert.equal(analyzeFinance(input,d).items[0].profit,null);
  const e=fixture();e.ads.push({series_code:99,amazon_cost:100,google_cost:0,meta_cost:0,other_cost:0});
  assert.ok(analyzeFinance(input,e).notes.some(n=>n.includes("配分できない直接広告費")));
});
test("relative boundaries, zero profit, negative profit and insufficient benchmark", () => {
  assert.equal(classifyFinance(100,10,100,10),"A");
  assert.equal(classifyFinance(100,9,100,10),"B");
  assert.equal(classifyFinance(90,9,100,10),"C");
  assert.equal(classifyFinance(90,8,100,10),"D");
  assert.equal(classifyFinance(100,0,100,0),"B");
  assert.equal(classifyFinance(100,-1,null,null),"赤字");
  assert.equal(classifyFinance(100,1,null,null),"保留");
});
test("ABCD preserved; financial actions use traffic diagnosis; no input mutation", () => {
  const before=JSON.stringify(input); const a=analyze(input);
  analyzeFinance(input,fixture(),new Map(a.items.map(i=>[i.key,i.rank])));
  assert.equal(JSON.stringify(input),before); assert.deepEqual(analyze(input),a);
  assert.match(financeAction("A","B"),/購入率/);
});
console.log(`${passed} finance tests passed`);
