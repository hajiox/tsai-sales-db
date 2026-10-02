const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const credentialCalls = [];
let values = {};
let persistenceAvailable = true;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith('/finance-acquisition/credential-store')) return {
    getApiCredential: async name => values[name],
    requireApiCredential: async name => {
      if (!values[name]) throw new Error(`missing ${name}`);
      return values[name];
    },
    assertApiCredentialPersistence: async () => {
      credentialCalls.push('persistence-check');
      if (!persistenceAvailable) throw new Error('persistence unavailable');
    },
    saveRotatedApiCredentials: async changes => {
      credentialCalls.push('persist-rotation');
      Object.assign(values, changes);
    },
  };
  return originalLoad.call(this, request, parent, isMain);
};
const {
  normalizeAmazonReport, normalizeYahooOrder, normalizeBaseOrder, normalizeRakutenOrder,
  fetchYahooApiSales, fetchBaseApiSales, fetchRakutenApiSales, salesApiAccessToken, verifyAmazonApiShop, verifyBaseApiShop,
} = require('../lib/web-sales-automation/official-sales-api.ts');
const { apiJson, jstTimestamp, SalesApiError } = require('../lib/web-sales-automation/api-common.ts');
const period = { startDate: '2026-09-01', endDate: '2026-09-30', reportMonth: '2026-09-01' };

const amazon = {
  reportSpecification: { reportType: 'GET_SALES_AND_TRAFFIC_REPORT',
    reportOptions: { dateGranularity: 'DAY', asinGranularity: 'CHILD' },
    dataStartTime: period.startDate, dataEndTime: period.endDate, marketplaceIds: ['A1VC38T7YXB528'] },
  salesAndTrafficByAsin: [{ childAsin: 'B0EXAMPLE1', salesByAsin: { unitsOrdered: 2,
    orderedProductSales: { amount: 2100, currencyCode: 'JPY' } }, trafficByAsin: { sessions: 10 } }],
  salesAndTrafficByDate: Array.from({ length: 30 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    salesByDate: { unitsOrdered: index ? 0 : 2, orderedProductSales: { amount: index ? 0 : 2100, currencyCode: 'JPY' } } })),
};
assert.equal(normalizeAmazonReport(amazon, period).items[0].amount, 2100);
assert.equal(normalizeAmazonReport(amazon, period).metadata.trafficRows[0].sessions, 10);
assert.throws(() => normalizeAmazonReport({ ...amazon, salesAndTrafficByDate: amazon.salesAndTrafficByDate.slice(1) }, period), /incomplete/);
assert.throws(() => normalizeAmazonReport({ ...amazon, salesAndTrafficByAsin: [{ ...amazon.salesAndTrafficByAsin[0],
  salesByAsin: { unitsOrdered: 2, orderedProductSales: { amount: 2099, currencyCode: 'JPY' } } }] }, period), /total_mismatch/);
assert.throws(() => normalizeAmazonReport({ ...amazon, reportSpecification: { ...amazon.reportSpecification,
  reportOptions: { dateGranularity: 'MONTH', asinGranularity: 'CHILD' } } }, period), /granularity/);

const yahoo = { OrderId: 'aizubrandhall-1', OrderStatus: '5', OrderTime: '2026-09-01T00:00:00',
  IsSplit: 'false', IsRoyalty: 'true', Seller: { SellerId: 'aizubrandhall' },
  Item: [{ LineId: '1', ItemId: 'item-a', SubCode: 'variation-a', Title: '商品A', UnitPrice: '900', Quantity: '2', CouponDiscount: '200' }] };
assert.equal(normalizeYahooOrder(yahoo, 'aizubrandhall', period)[0].amount, 1800, 'transaction price already has coupons');
assert.equal(normalizeYahooOrder(yahoo, 'aizubrandhall', period)[0].occurredAt, '2026-08-31T15:00:00.000Z');
assert.throws(() => normalizeYahooOrder(yahoo, 'other-shop', period), /seller_mismatch/);
assert.deepEqual(normalizeYahooOrder({ ...yahoo, OrderStatus: '4' }, 'aizubrandhall', period), []);
assert.deepEqual(normalizeYahooOrder({ ...yahoo, IsSplit: 'true' }, 'aizubrandhall', period), []);
assert.throws(() => normalizeYahooOrder({ ...yahoo, Item: [{ ...yahoo.Item[0], UnitPrice: undefined }] }, 'aizubrandhall', period), /unit_price/);
assert.throws(() => normalizeYahooOrder({ ...yahoo, OrderTime: '2026-10-01T00:00:00+09:00' }, 'aizubrandhall', period), /period_mismatch/);
assert.equal(jstTimestamp('yahoo', '20260930235959'), '2026-09-30T14:59:59.000Z');

const base = { unique_key: 'base-order-1', ordered: Date.parse('2026-09-01T00:00:00+09:00') / 1000,
  dispatch_status: 'dispatched', cancelled: null,
  order_items: [{ order_item_id: 1, item_id: 10, title: '商品A', variation_identifier: 'variant-a', total: 2500,
    item_total: 2000, amount: 2, status: 'ordered', options: [{ option_value: 'PRIVATE_CUSTOMER_TEXT' }] }] };
assert.equal(normalizeBaseOrder(base, period)[0].amount, 2500, 'includes purchased option totals');
assert(!JSON.stringify(normalizeBaseOrder(base, period)).includes('PRIVATE_CUSTOMER_TEXT'));
assert.deepEqual(normalizeBaseOrder({ ...base, dispatch_status: 'ordered' }, period), [], 'unshipped orders excluded');
assert.equal(normalizeBaseOrder({ ...base, order_discount: { discount: 1000, is_allocate_user_balance_log: 1 } }, period)[0].amount, 2500);
assert.throws(() => normalizeBaseOrder({ ...base, order_discount: { discount: 100, is_allocate_user_balance_log: 0 } }, period), /allocation_requires_review/);
assert.throws(() => normalizeBaseOrder({ ...base, order_amount_adjustment: { adjusted_amount: -100 } }, period), /requires_review/);

const rakuten = { orderNumber: '111111-20260901-1', orderDatetime: '2026-09-01T00:00:00+0900', orderProgress: 700,
  couponShopPrice: 200, CouponModelList: [{ couponCapitalCode: 1, itemDetailId: 9, couponTotalPrice: 200 }],
  PackageModelList: [{ ItemModelList: [{ itemDetailId: 9, itemId: 100, manageNumber: 'item-a', itemName: '商品A',
    units: 2, priceTaxIncl: 1200, price: 1111, customerSecret: 'PRIVATE' }] }] };
assert.equal(normalizeRakutenOrder(rakuten, period)[0].amount, 2200);
assert(!JSON.stringify(normalizeRakutenOrder(rakuten, period)).includes('PRIVATE'));
assert.deepEqual(normalizeRakutenOrder({ ...rakuten, orderProgress: 900 }, period), []);
assert.deepEqual(normalizeRakutenOrder({ ...rakuten, orderProgress: 800 }, period), []);
assert.throws(() => normalizeRakutenOrder({ ...rakuten, couponShopPrice: -9999 }, period), /coupon_amount_unresolved/);
const singleItemWideCoupon = { ...rakuten, CouponModelList: [{ couponCapitalCode: 1, itemDetailId: 0, couponTotalPrice: 200 }] };
assert.equal(normalizeRakutenOrder(singleItemWideCoupon, period)[0].amount, 2200, 'one eligible line has an unambiguous order-wide shop coupon');
const multiItemWideCoupon = { ...singleItemWideCoupon, PackageModelList: [{ ItemModelList: [rakuten.PackageModelList[0].ItemModelList[0],
  { itemDetailId: 10, itemId: 101, manageNumber: 'item-b', itemName: '商品B', units: 1, priceTaxIncl: 2000 }] }] };
assert.throws(() => normalizeRakutenOrder(multiItemWideCoupon, period), /allocation_requires_review/, 'must not invent a multi-product coupon split');
assert.throws(() => normalizeRakutenOrder({ ...singleItemWideCoupon, couponShopPrice: 300 }, period), /coupon_total_mismatch/);

async function main() {
  values = { YAHOO_SHOPPING_ACCESS_TOKEN: 'fixture', YAHOO_SHOPPING_SELLER_ID: 'aizubrandhall' };
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push([String(url), init]);
    if (String(url).endsWith('orderList')) return new Response('<Result><Status>OK</Status><Search><TotalCount>1</TotalCount><OrderInfo><OrderId>aizubrandhall-1</OrderId></OrderInfo></Search></Result>');
    assert(String(init.body).includes('<Target>'));
    assert(!String(init.body).includes('BillFirstName'));
    return new Response('<ResultSet><Result><Status>OK</Status><OrderInfo><OrderId>aizubrandhall-1</OrderId><OrderStatus>5</OrderStatus><OrderTime>2026-09-01T00:00:00+09:00</OrderTime><Seller><SellerId>aizubrandhall</SellerId></Seller><Item><LineId>1</LineId><ItemId>item-a</ItemId><Title>商品A</Title><Quantity>2</Quantity><UnitPrice>900</UnitPrice></Item></OrderInfo></Result></ResultSet>');
  };
  const yahooFetched = await fetchYahooApiSales(period);
  assert.equal(yahooFetched.items[0].amount, 1800);
  assert.equal(requests.length, 2, 'must request order details, not manufacture lines from list');
  assert.equal(yahooFetched.metadata.reconciliationRequired, true);

  values = { BASE_ACCESS_TOKEN: 'fixture', BASE_SHOP_ID: 'aizubrandhall' };
  global.fetch = async url => String(url).endsWith('/users/me') ? new Response(JSON.stringify({ user: { shop_id: 'aizubrandhall' } }))
    : String(url).includes('/orders?') ? new Response(JSON.stringify({ orders: [{ unique_key: base.unique_key }] }))
    : new Response(JSON.stringify({ order: base }));
  assert.equal((await fetchBaseApiSales(period)).items[0].amount, 2500);
  const baseUnresolved = { ...base, unique_key: 'base-unresolved', order_discount: { discount: 100, is_allocate_user_balance_log: 0 } };
  global.fetch = async url => String(url).endsWith('/users/me') ? new Response(JSON.stringify({ user: { shop_id: 'aizubrandhall' } }))
    : String(url).includes('/orders?') ? new Response(JSON.stringify({ orders: [{ unique_key: base.unique_key }, { unique_key: baseUnresolved.unique_key }] }))
    : new Response(JSON.stringify({ order: String(url).includes('base-unresolved') ? baseUnresolved : base }));
  const basePartial = await fetchBaseApiSales(period);
  assert.equal(basePartial.items.length, 1);
  assert.equal(basePartial.metadata.unresolvedOrderCount, 1);
  assert.deepEqual(basePartial.metadata.reviewReasonCodes, ['order_discount_allocation_requires_review']);
  global.fetch = async url => String(url).endsWith('/users/me') ? new Response(JSON.stringify({ user: { shop_id: 'aizubrandhall' } })) : new Response('{}');
  await assert.rejects(fetchBaseApiSales(period), /order_list_missing/);
  global.fetch = async () => new Response(JSON.stringify({ user: { shop_id: 'different' } }));
  await assert.rejects(verifyBaseApiShop('fixture'), /account_identity_mismatch/);
  global.fetch = async () => new Response(JSON.stringify({ payload: [{ marketplace: { id: 'A1VC38T7YXB528' },
    storeName: '会津ブランド館', participation: { isParticipating: true } }] }));
  await verifyAmazonApiShop('fixture');
  global.fetch = async () => new Response(JSON.stringify({ payload: [{ marketplace: { id: 'ATVPDKIKX0DER' },
    storeName: '会津ブランド館', participation: { isParticipating: true } }] }));
  await assert.rejects(verifyAmazonApiShop('fixture'), /account_identity_mismatch/);

  values = { RAKUTEN_RMS_SERVICE_SECRET: 'fixture-service', RAKUTEN_RMS_LICENSE_KEY: 'fixture-license' };
  global.fetch = async (url, init) => {
    assert.equal(init.redirect, 'error');
    if (String(url).endsWith('/searchOrder/')) return new Response(JSON.stringify({ orderNumberList: [rakuten.orderNumber],
      PaginationResponseModel: { totalRecordsAmount: 1, totalPages: 1 } }));
    assert.equal(JSON.parse(init.body).version, 8);
    return new Response(JSON.stringify({ OrderModelList: [rakuten] }));
  };
  assert.equal((await fetchRakutenApiSales(period)).items[0].amount, 2200);
  const unresolved = { ...multiItemWideCoupon, orderNumber: '111111-20260901-2' };
  global.fetch = async url => String(url).endsWith('/searchOrder/') ? new Response(JSON.stringify({
    orderNumberList: [unresolved.orderNumber, singleItemWideCoupon.orderNumber], PaginationResponseModel: { totalRecordsAmount: 2 },
  })) : new Response(JSON.stringify({ OrderModelList: [unresolved, singleItemWideCoupon] }));
  const partial = await fetchRakutenApiSales(period);
  assert.equal(partial.items.length, 1, 'valid later orders are staged even when the first order needs semantic coupon review');
  assert.equal(partial.items[0].amount, 2200);
  assert.equal(partial.metadata.unresolvedOrderCount, 1);
  assert.deepEqual(partial.metadata.reviewReasonCodes, ['shop_coupon_allocation_requires_review']);
  assert(!JSON.stringify(partial.metadata).includes('111111'), 'review metadata stores only counts and fixed reason codes');
  global.fetch = async url => String(url).endsWith('/searchOrder/') ? new Response(JSON.stringify({
    orderNumberList: [rakuten.orderNumber], PaginationResponseModel: { totalRecordsAmount: 1 },
  })) : new Response('PRIVATE_API_ERROR', { status: 503 });
  await assert.rejects(fetchRakutenApiSales(period), /request_failed/, 'API request errors cannot return a partial successful packet');
  global.fetch = async url => String(url).endsWith('/searchOrder/') ? new Response(JSON.stringify({ orderNumberList: [rakuten.orderNumber],
    PaginationResponseModel: { totalRecordsAmount: 1 } })) : new Response(JSON.stringify({ OrderModelList: [] }));
  await assert.rejects(fetchRakutenApiSales(period), /details_incomplete/);

  values = { BASE_CLIENT_ID: 'fixture', BASE_CLIENT_SECRET: 'fixture', BASE_REFRESH_TOKEN: 'old-fixture',
    BASE_ACCESS_TOKEN: 'expired-access', BASE_REDIRECT_URI: 'https://example.com/callback' };
  credentialCalls.length = 0;
  global.fetch = async (_url, init) => {
    credentialCalls.push('token-request');
    assert.equal(init.body.get('redirect_uri'), 'https://example.com/callback');
    return new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-fixture' }));
  };
  assert.equal(await salesApiAccessToken('base'), 'new-access');
  assert.deepEqual(credentialCalls, ['persistence-check', 'token-request', 'persist-rotation']);
  assert.equal(values.BASE_REFRESH_TOKEN, 'new-fixture');
  persistenceAvailable = false;
  credentialCalls.length = 0;
  await assert.rejects(salesApiAccessToken('base'), /persistence/);
  assert.deepEqual(credentialCalls, ['persistence-check'], 'never rotate without safe storage');

  global.fetch = async () => new Response('SECRET_TOKEN CUSTOMER_NAME', { status: 403 });
  await assert.rejects(apiJson('base', 'https://api.thebase.in/1/orders'), error => {
    assert(error instanceof SalesApiError);
    assert(!error.message.includes('SECRET_TOKEN'));
    assert(!error.message.includes('CUSTOMER_NAME'));
    return /permission_required/.test(error.message);
  });
  global.fetch = async () => { throw new Error('secret signed URL'); };
  await assert.rejects(apiJson('base', 'https://api.thebase.in/1/orders'), /connection_or_timeout/);
  console.log('Official sales API connector tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
