import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Load production pure normalization through TypeScript's transpiler, keeping
// the app's bundler imports intact while running meaningful fixtures in Node.
async function sourceUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [from, to] of Object.entries(imports)) js = js.replaceAll(`from "${from}"`, `from "${to}"`);
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}
const policyUrl = await sourceUrl("../lib/finance-acquisition/policy.ts");
const { normalizeBaseFinance, money, assertFullMonth, sameCostTotals } = await import(policyUrl);
const amazonUrl = await sourceUrl("../lib/finance-acquisition/amazon-policy.ts", { "./policy": policyUrl, "csv-parse/sync": import.meta.resolve("csv-parse/sync") });
const { normalizeAmazonSettlements } = await import(amazonUrl);
const adsUrl = await sourceUrl("../lib/finance-acquisition/advertising-policy.ts", { "./policy": policyUrl });
const { normalizeAmazonAds, normalizeMetaInsights } = await import(adsUrl);
const period = { startDate: "2026-09-01", endDate: "2026-09-30", reportMonth: "2026-09" };
assertFullMonth(period);
assert.throws(() => assertFullMonth({ ...period, endDate: "2026-09-15" }), /月初/);
assert.throws(() => money("95,00"), /形式/);
assert.equal(money("1,000.25"), 1000.25);
assert.throws(() => money(null), /欠落/);

const order = { unique_key: "order1", dispatch_status: "dispatched", total: 900, shipping_fee: 500,
  order_discount: { discount: 100, is_allocate_user_balance_log: 0 }, order_charge: { collected_fee: 30 },
  c_c_payment_transaction: { collected_fee: 40, status: "captured" }, additional_charges: [{ name: "オプション", collected_fee: 10 }] };
const base = normalizeBaseFinance([order, { ...order, cancelled: 1 }], [{ saving_id: 1, status: "done", drawings: 1000,
  administrative_fee: 0, bank_transfer_fee: 250, early_transfer_fee: 0 }], period);
assert.equal(base.data.gross_sales, 1000, "discounted total is restored only for verified seller coupon");
assert.equal(base.data.seller_coupons, 100);
assert.equal(base.data.platform_fees, 30);
assert.equal(base.data.payment_fees, 290);
assert.equal(base.data.shipping_costs, 0, "buyer shipping fee is not a seller carrier expense");
assert.equal(base.data.net_payout, 750);
assert.equal(base.data.coverage_level, "partial", "order and payout months are not a complete settlement");
const platformDiscount = normalizeBaseFinance([{ ...order, order_discount: { discount: 100, is_allocate_user_balance_log: 1 } }], [], period);
assert.equal(platformDiscount.data.gross_sales, 900);
assert.equal(platformDiscount.data.seller_coupons, 0);
assert.equal(platformDiscount.data.excluded_marketplace_funded_discounts, 100);
const unknownDiscount = normalizeBaseFinance([{ ...order, order_discount: { discount: 100, is_allocate_user_balance_log: null } }], [], period);
assert.equal(unknownDiscount.data.seller_coupons, 0);
assert.equal(unknownDiscount.data.coverage_level, "needs_review");
assert.throws(() => normalizeBaseFinance([{ ...order, order_charge: { collected_fee: -10 } }], [], period), /負値/);
assert.throws(() => normalizeBaseFinance([{ ...order, total: null }], [], period), /欠落/);

const header = "settlement-id\tcurrency\ttransaction-type\tamount-type\tamount-description\tamount\tposted-date-time\n";
const text = header + [
  ["s1", "JPY", "Order", "ItemPrice", "Principal", "1000", "2026-09-01T00:00:00Z"],
  ["s1", "JPY", "Order", "ItemFees", "Commission", "-100", "2026-09-01T00:00:00Z"],
  ["s1", "JPY", "Refund", "ItemPrice", "Principal", "-200", "2026-09-02T00:00:00Z"],
  ["s1", "JPY", "Refund", "ItemFees", "Commission", "20", "2026-09-02T00:00:00Z"],
  ["s1", "JPY", "ServiceFee", "ServiceFee", "Subscription", "-5390", "2026-09-03T00:00:00Z"],
  ["s1", "JPY", "ServiceFee", "ServiceFee", "Advertising", "-300", "2026-09-03T00:00:00Z"],
  ["s1", "JPY", "Order", "ItemPrice", "Principal", "50", "2026-09-30T16:00:00Z"],
].map((row) => row.join("\t")).join("\n");
const amazon = normalizeAmazonSettlements([{ id: "report1", text }, { id: "report1", text }], period);
assert.equal(amazon.data.gross_sales, 1000, "Japan posting date excludes next-month UTC boundary");
assert.equal(amazon.data.refunds, 200);
assert.equal(amazon.data.platform_fees, 5490);
assert.equal(amazon.data.other_credits, 20);
assert.equal(amazon.data.excluded_ad_costs, 300, "ads charges never enter EC deductions");
assert.equal(amazon.metadata.settlementReportCount, 1, "duplicate report pages never duplicate fees");
assert.equal(amazon.data.coverage_level, "partial");
const unknown = normalizeAmazonSettlements([{ id: "report2", text: text + "\ns1\tJPY\tOrder\tPromotion\tPrincipal\t-100\t2026-09-03T00:00:00Z" }], period);
assert.equal(unknown.data.coverage_level, "needs_review");
assert.equal(unknown.data.seller_discounts, 0, "unknown discount funder never guessed");
assert.throws(() => normalizeAmazonSettlements([{ id: "report3", text: text.replaceAll("JPY", "USD") }], period), /JPY/);

const metaRow = { account_currency: "JPY", campaign_name: "EC", adset_name: "商品", adset_id: "1", date_start: period.startDate, date_stop: period.endDate, spend: "500.25", impressions: "100", clicks: "5" };
assert.equal(normalizeMetaInsights([metaRow], period)[0].amount_spent, 500.25);
assert.throws(() => normalizeMetaInsights([metaRow, { ...metaRow, adset_id: "2" }], period), /重複/);
assert.throws(() => normalizeMetaInsights([{ ...metaRow, account_currency: "USD" }], period), /JPY/);
assert.throws(() => normalizeMetaInsights([{ ...metaRow, spend: undefined }], period), /欠落/);
const amazonAd = { startDate: period.startDate, endDate: period.endDate, campaignBudgetCurrencyCode: "JPY", campaignName: "EC", adGroupName: "商品", advertisedAsin: "B012345678", advertisedSku: "sku1", cost: 10.5, impressions: 100, clicks: 5 };
const adRows = normalizeAmazonAds([amazonAd, { ...amazonAd, cost: 20.5 }], period);
assert.equal(adRows.length, 1, "multiple ads for same advertised SKU aggregate before mapping");
assert.equal(adRows[0].cost, 31);
assert.throws(() => normalizeAmazonAds([{ ...amazonAd, cost: null }], period), /欠落/);
assert.equal(sameCostTotals([{ name: "a", cost: 30 }], [{ name: "a", cost: 15 }, { name: "a", cost: 15 }], "cost", ["name"]), true);
assert.equal(sameCostTotals([{ name: "a", cost: 30 }], [{ name: "a", cost: 10 }, { name: "b", cost: 20 }], "cost", ["name"]), false, "equal global total cannot hide a product-level discrepancy");
console.log("Official finance acquisition normalization and preservation checks passed.");
