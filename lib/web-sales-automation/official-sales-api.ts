import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { addDays } from "./date";
import { assertApiCredentialPersistence, getApiCredential, requireApiCredential, saveRotatedApiCredentials } from "../finance-acquisition/credential-store";
import { sleep } from "./http";
import {
  apiDeadline, apiJson, apiMetadata, apiResponse, apiText, array, escapeXml, jstTimestamp,
  MAX_API_ORDERS, MAX_API_PAGES, numericValue, officialEndpoint, quantityValue,
  record, requiredText, requireInPeriod, SalesApiError, textValue, unixTimestamp,
  type ApiRecord,
} from "./api-common";
import type { ChannelFetchResult, NormalizedSalesItem, SyncPeriod } from "./types";

const AMAZON_MARKETPLACE = "A1VC38T7YXB528";
const AMAZON_ENDPOINT = "https://sellingpartnerapi-fe.amazon.com";
const RAKUTEN_ENDPOINT = "https://api.rms.rakuten.co.jp/es/2.0";
const YAHOO_ENDPOINT = "https://circus.shopping.yahooapis.jp/ShoppingWebService/V1";
const BASE_ENDPOINT = "https://api.thebase.in/1";

type TokenChannel = "amazon" | "yahoo" | "base";

// Only semantic, verified coupon-allocation limitations may yield a partial
// review packet. Transport/authentication/paging/identity failures still abort.
const COUPON_REVIEW_CODES = new Set([
  "shop_coupon_allocation_requires_review", "shop_coupon_total_mismatch", "coupon_target_missing",
  "coupon_exceeds_merchandise", "coupon_amount_unresolved", "order_discount_allocation_requires_review",
]);

function reviewCollector() {
  const codes = new Set<string>();
  let unresolvedOrderCount = 0;
  return {
    append(items: NormalizedSalesItem[], normalize: () => NormalizedSalesItem[]) {
      try { items.push(...normalize()); }
      catch (error) {
        if (!(error instanceof SalesApiError) || !COUPON_REVIEW_CODES.has(error.code)) throw error;
        codes.add(error.code);
        unresolvedOrderCount += 1;
      }
    },
    metadata() { return { reviewReasonCodes: [...codes].sort(), unresolvedOrderCount }; },
  };
}

export async function salesApiAccessToken(channel: TokenChannel): Promise<string> {
  const prefix = channel === "amazon" ? "AMAZON_SP_API" : channel === "yahoo" ? "YAHOO_SHOPPING" : "BASE";
  const configuredRefreshToken = await getApiCredential(`${prefix}_REFRESH_TOKEN`);
  const accessToken = await getApiCredential(`${prefix}_ACCESS_TOKEN`);
  // Stored access tokens expire. A durable refresh credential takes precedence.
  if (!configuredRefreshToken && accessToken) return accessToken;
  const clientId = await requireApiCredential(`${prefix}_CLIENT_ID`);
  const clientSecret = await requireApiCredential(`${prefix}_CLIENT_SECRET`);
  const refreshToken = configuredRefreshToken || await requireApiCredential(`${prefix}_REFRESH_TOKEN`);
  if (channel === "base" || channel === "yahoo") await assertApiCredentialPersistence();
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (channel === "yahoo") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  if (channel === "base") body.set("redirect_uri", await requireApiCredential("BASE_REDIRECT_URI"));
  const endpoint = channel === "amazon" ? "https://api.amazon.com/auth/o2/token"
    : channel === "yahoo" ? "https://auth.login.yahoo.co.jp/yconnect/v2/token" : `${BASE_ENDPOINT}/oauth/token`;
  const response = await apiJson(channel, endpoint, { method: "POST", headers, body });
  const token = requiredText(channel, response.access_token, "access_token");
  const rotated = textValue(response.refresh_token);
  // Rotating refresh tokens must be durable before an import can claim success.
  if (rotated && rotated !== refreshToken) {
    await saveRotatedApiCredentials({ [`${prefix}_REFRESH_TOKEN`]: rotated });
  }
  return token;
}

function amazonHeaders(token: string) {
  return { "content-type": "application/json", "x-amz-access-token": token,
    "user-agent": "TSA-WebSalesAutomation/2.0 (Language=TypeScript)" };
}

export async function verifyAmazonApiShop(token: string): Promise<void> {
  let result: ApiRecord;
  try {
    result = await apiJson("amazon", `${AMAZON_ENDPOINT}/sellers/v1/marketplaceParticipations`, { headers: amazonHeaders(token) });
  } catch (error) {
    if (error instanceof SalesApiError && /permission_required/.test(error.message)) {
      throw new SalesApiError("amazon", "account_verification_required");
    }
    throw error;
  }
  const participant = array(result.payload).find(row => record(row.marketplace).id === AMAZON_MARKETPLACE);
  if (!participant || record(participant.participation).isParticipating !== true
    || textValue(participant.storeName) !== "会津ブランド館") throw new SalesApiError("amazon", "account_identity_mismatch");
}

export async function verifyBaseApiShop(token: string): Promise<string> {
  const expected = await requireApiCredential("BASE_SHOP_ID");
  let result: ApiRecord;
  try {
    result = await apiJson("base", `${BASE_ENDPOINT}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    if (error instanceof SalesApiError && /permission_required/.test(error.message)) {
      throw new SalesApiError("base", "account_verification_required");
    }
    throw error;
  }
  const shopId = requiredText("base", record(result.user).shop_id, "shop_id");
  if (shopId !== expected) throw new SalesApiError("base", "account_identity_mismatch");
  return shopId;
}

function sameAmazonPeriod(report: ApiRecord, period: SyncPeriod): boolean {
  const calendarDate = (value: unknown) => {
    const text = textValue(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? new Date(timestamp + 9 * 3_600_000).toISOString().slice(0, 10) : "";
  };
  return report.reportType === "GET_SALES_AND_TRAFFIC_REPORT"
    && calendarDate(report.dataStartTime) === period.startDate
    && calendarDate(report.dataEndTime) === period.endDate
    && Array.isArray(report.marketplaceIds)
    && report.marketplaceIds.length === 1 && report.marketplaceIds[0] === AMAZON_MARKETPLACE;
}

export function normalizeAmazonReport(payload: ApiRecord, period: SyncPeriod): ChannelFetchResult {
  const specification = record(payload.reportSpecification);
  if (!sameAmazonPeriod(specification, period)
    || record(specification.reportOptions).asinGranularity !== "CHILD"
    || record(specification.reportOptions).dateGranularity !== "DAY") {
    throw new SalesApiError("amazon", "report_period_or_granularity_mismatch");
  }
  if (!Array.isArray(payload.salesAndTrafficByAsin) || !Array.isArray(payload.salesAndTrafficByDate)) {
    throw new SalesApiError("amazon", "report_rows_missing");
  }
  const dates = array(payload.salesAndTrafficByDate).map(row => textValue(row.date)).sort();
  const expectedDays = Math.round((Date.parse(addDays(period.endDate, 1)) - Date.parse(period.startDate)) / 86_400_000);
  if (!dates.length || dates[0] !== period.startDate || dates.at(-1) !== period.endDate
    || dates.length !== expectedDays || new Set(dates).size !== dates.length) throw new SalesApiError("amazon", "report_dates_incomplete");
  const seen = new Set<string>();
  const items: NormalizedSalesItem[] = [];
  const trafficRows: ApiRecord[] = [];
  for (const row of array(payload.salesAndTrafficByAsin)) {
    const key = requiredText("amazon", row.childAsin, "child_asin");
    if (seen.has(key)) throw new SalesApiError("amazon", "duplicate_product");
    seen.add(key);
    const sales = record(row.salesByAsin);
    const quantity = quantityValue("amazon", sales.unitsOrdered);
    const money = record(sales.orderedProductSales);
    if (money.currencyCode !== "JPY") throw new SalesApiError("amazon", "currency_mismatch");
    const amount = numericValue("amazon", money.amount, "reported_amount");
    const traffic = record(row.trafficByAsin);
    trafficRows.push({ key, quantity, amount,
      sessions: traffic.sessions == null ? null : quantityValue("amazon", traffic.sessions) });
    if (!quantity) {
      if (amount !== 0) throw new SalesApiError("amazon", "zero_quantity_amount_mismatch");
      continue;
    }
    items.push({ externalOrderId: `${period.startDate}_${period.endDate}`,
      externalLineId: key, externalProductKey: key, externalProductName: key,
      occurredAt: null, quantity, amount, sourceStatus: "reported",
      rawData: { childAsin: key, unitsOrdered: quantity, orderedProductSales: { amount, currencyCode: "JPY" },
        ...(traffic.sessions != null ? { sessions: quantityValue("amazon", traffic.sessions) } : {}) } });
  }
  let dateQuantity = 0;
  let dateAmount = 0;
  for (const row of array(payload.salesAndTrafficByDate)) {
    const sales = record(row.salesByDate);
    const money = record(sales.orderedProductSales);
    if (money.currencyCode !== "JPY") throw new SalesApiError("amazon", "currency_mismatch");
    dateQuantity += quantityValue("amazon", sales.unitsOrdered);
    dateAmount += numericValue("amazon", money.amount, "reported_amount");
  }
  if (dateQuantity !== items.reduce((sum, item) => sum + item.quantity, 0)
    || Math.abs(dateAmount - items.reduce((sum, item) => sum + item.amount, 0)) > 0.01) {
    throw new SalesApiError("amazon", "daily_product_total_mismatch");
  }
  return { items, metadata: { ...apiMetadata("amazon_sales_and_traffic_child_asin", "orderedProductSales", false),
    marketplaceId: AMAZON_MARKETPLACE, reportedDayCount: dates.length, trafficRows } };
}

export async function fetchAmazonApiSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const checkDeadline = apiDeadline("amazon");
  const endpoint = officialEndpoint("amazon", process.env.AMAZON_SP_API_ENDPOINT, AMAZON_ENDPOINT);
  if (process.env.AMAZON_SP_API_MARKETPLACE_ID?.trim()
    && process.env.AMAZON_SP_API_MARKETPLACE_ID.trim() !== AMAZON_MARKETPLACE) {
    throw new SalesApiError("amazon", "marketplace_mismatch");
  }
  const token = await salesApiAccessToken("amazon");
  await verifyAmazonApiShop(token);
  const headers = amazonHeaders(token);
  // Reuse pending/completed reports on retry instead of creating duplicate requests.
  const reportsUrl = new URL(`${endpoint}/reports/2021-06-30/reports`);
  reportsUrl.searchParams.set("reportTypes", "GET_SALES_AND_TRAFFIC_REPORT");
  reportsUrl.searchParams.set("marketplaceIds", AMAZON_MARKETPLACE);
  reportsUrl.searchParams.set("createdSince", new Date(Date.now() - 7 * 86_400_000).toISOString());
  reportsUrl.searchParams.set("pageSize", "100");
  let existing: ApiRecord | undefined;
  let nextToken = "";
  const tokens = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    checkDeadline();
    const url = nextToken ? new URL(`${endpoint}/reports/2021-06-30/reports`) : reportsUrl;
    if (nextToken) url.searchParams.set("nextToken", nextToken);
    const reports = await apiJson("amazon", url, { headers });
    if (!Array.isArray(reports.reports)) throw new SalesApiError("amazon", "report_list_missing");
    const candidates = array(reports.reports).filter(row => sameAmazonPeriod(row, period)
      && ["DONE", "IN_QUEUE", "IN_PROGRESS"].includes(textValue(row.processingStatus)));
    existing = candidates.sort((a, b) => textValue(b.createdTime).localeCompare(textValue(a.createdTime)))[0];
    if (existing) break;
    nextToken = textValue(reports.nextToken);
    if (!nextToken) break;
    if (tokens.has(nextToken) || page === 19) throw new SalesApiError("amazon", "incomplete_report_pages");
    tokens.add(nextToken);
  }
  const created = existing || await apiJson("amazon", `${endpoint}/reports/2021-06-30/reports`, {
    method: "POST", headers, body: JSON.stringify({ reportType: "GET_SALES_AND_TRAFFIC_REPORT",
      // Calendar-date boundaries are inclusive. An exclusive next-day boundary adds a day.
      dataStartTime: `${period.startDate}T00:00:00+09:00`, dataEndTime: `${period.endDate}T23:59:59+09:00`,
      marketplaceIds: [AMAZON_MARKETPLACE], reportOptions: { dateGranularity: "DAY", asinGranularity: "CHILD" } }),
  });
  const reportId = requiredText("amazon", created.reportId, "report_id");
  let reportDocumentId = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    checkDeadline();
    if (attempt) await sleep(5_000);
    const report = await apiJson("amazon", `${endpoint}/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`, { headers });
    if (report.processingStatus === "DONE") {
      reportDocumentId = requiredText("amazon", report.reportDocumentId, "document_id");
      break;
    }
    if (["CANCELLED", "FATAL"].includes(textValue(report.processingStatus))) throw new SalesApiError("amazon", "report_failed");
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(textValue(report.processingStatus))) throw new SalesApiError("amazon", "invalid_report_status");
  }
  if (!reportDocumentId) throw new SalesApiError("amazon", "report_pending_retry_same_report");
  const document = await apiJson("amazon", `${endpoint}/reports/2021-06-30/documents/${encodeURIComponent(reportDocumentId)}`, { headers });
  let downloadUrl: URL;
  try { downloadUrl = new URL(requiredText("amazon", document.url, "document_url")); }
  catch { throw new SalesApiError("amazon", "invalid_document_url"); }
  if (downloadUrl.protocol !== "https:" || downloadUrl.username || downloadUrl.password
    || downloadUrl.port || !downloadUrl.hostname.endsWith(".amazonaws.com")) throw new SalesApiError("amazon", "invalid_document_host");
  const response = await apiResponse("amazon", downloadUrl);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 20_000_000) throw new SalesApiError("amazon", "report_too_large");
  let payload: ApiRecord;
  try {
    const algorithm = textValue(document.compressionAlgorithm);
    if (algorithm && algorithm !== "GZIP") throw new Error();
    const data = algorithm === "GZIP" ? gunzipSync(bytes, { maxOutputLength: 40_000_000 }) : bytes;
    payload = record(JSON.parse(data.toString("utf8")));
  } catch { throw new SalesApiError("amazon", "invalid_report_document"); }
  const result = normalizeAmazonReport(payload, period);
  return { ...result, metadata: { ...result.metadata, reportId, reportDocumentId, reusedReport: Boolean(existing) } };
}

function xmlResult(text: string): ApiRecord {
  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error();
    const parsed = record(new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(text));
    return record(record(parsed.ResultSet).Result || parsed.Result);
  } catch { throw new SalesApiError("yahoo", "invalid_response"); }
}

const yahooLastRequest = new Map<string, number>();

async function yahooRequest(action: "orderList" | "orderInfo", token: string, xml: string) {
  // Official order endpoints permit one query per second to the same URL.
  const remaining = (yahooLastRequest.get(action) || 0) + 1_000 - Date.now();
  if (remaining > 0) await sleep(remaining);
  yahooLastRequest.set(action, Date.now());
  const result = xmlResult(await apiText("yahoo", `${YAHOO_ENDPOINT}/${action}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/xml; charset=utf-8" }, body: xml,
  }));
  if (result.Status !== "OK") throw new SalesApiError("yahoo", "provider_error");
  return result;
}

export function normalizeYahooOrder(order: ApiRecord, sellerId: string, period: SyncPeriod): NormalizedSalesItem[] {
  const orderId = requiredText("yahoo", order.OrderId, "order_id");
  const status = requiredText("yahoo", order.OrderStatus, "order_status");
  if (textValue(record(order.Seller).SellerId) !== sellerId) throw new SalesApiError("yahoo", "seller_mismatch");
  // Split parent orders remain visible but their child orders own the merchandise.
  if (status === "4" || textValue(order.IsSplit) === "true" || textValue(order.IsRoyalty) === "false") return [];
  if (!["1", "2", "3", "5"].includes(status)) throw new SalesApiError("yahoo", "invalid_order_status");
  const occurredAt = jstTimestamp("yahoo", order.OrderTime);
  requireInPeriod("yahoo", occurredAt, period);
  if (!order.Item) throw new SalesApiError("yahoo", "items_missing");
  const seen = new Set<string>();
  return array(order.Item).map(item => {
    const lineId = requiredText("yahoo", item.LineId, "line_id");
    if (seen.has(lineId)) throw new SalesApiError("yahoo", "duplicate_line");
    seen.add(lineId);
    const key = requiredText("yahoo", item.ItemId, "item_id");
    const quantity = quantityValue("yahoo", item.Quantity);
    // Official orderInfo defines merchandise total as transaction UnitPrice × Quantity.
    // UnitPrice already includes store coupons/time-sale discounts; never subtract twice.
    const unitPrice = numericValue("yahoo", item.UnitPrice, "transaction_unit_price");
    const amount = unitPrice * quantity;
    if (!Number.isSafeInteger(amount)) throw new SalesApiError("yahoo", "invalid_line_amount");
    return { externalOrderId: orderId, externalLineId: lineId, externalProductKey: key,
      externalProductName: requiredText("yahoo", item.Title, "title"), occurredAt, quantity, amount,
      sourceStatus: status, rawData: { itemId: key, subCode: textValue(item.SubCode), unitPrice, quantity,
        ...(item.CouponDiscount ? { couponDiscount: numericValue("yahoo", item.CouponDiscount, "coupon_discount") } : {}) } };
  }).filter(item => item.quantity > 0);
}

export async function fetchYahooApiSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const checkDeadline = apiDeadline("yahoo");
  const token = await salesApiAccessToken("yahoo");
  const sellerId = await requireApiCredential("YAHOO_SHOPPING_SELLER_ID");
  const orderIds = new Set<string>();
  let totalCount: number | null = null;
  let start = 1;
  for (let page = 0; page < MAX_API_PAGES; page += 1) {
    checkDeadline();
    const xml = `<Req><Search><Result>2000</Result><Start>${start}</Start><Sort>+order_time</Sort><Condition><OrderTimeFrom>${period.startDate.replaceAll("-", "")}000000</OrderTimeFrom><OrderTimeTo>${period.endDate.replaceAll("-", "")}235959</OrderTimeTo></Condition><Field>OrderId</Field></Search><SellerId>${escapeXml(sellerId)}</SellerId></Req>`;
    const result = await yahooRequest("orderList", token, xml);
    const search = record(result.Search);
    const count = quantityValue("yahoo", search.TotalCount);
    if (count > MAX_API_ORDERS || (totalCount !== null && count !== totalCount)) throw new SalesApiError("yahoo", "order_list_changed_or_too_large");
    totalCount = count;
    const orders = array(search.OrderInfo);
    for (const order of orders) {
      const id = requiredText("yahoo", order.OrderId, "order_id");
      if (orderIds.has(id)) throw new SalesApiError("yahoo", "duplicate_order_page");
      orderIds.add(id);
    }
    if (orderIds.size === totalCount) break;
    if (!orders.length || orderIds.size > totalCount || page === MAX_API_PAGES - 1) throw new SalesApiError("yahoo", "incomplete_order_pages");
    start += orders.length;
  }
  const items: NormalizedSalesItem[] = [];
  const reviews = reviewCollector();
  for (const id of orderIds) {
    checkDeadline();
    const fields = "OrderId,OrderTime,OrderStatus,IsSplit,IsRoyalty,LineId,ItemId,SubCode,Title,Quantity,UnitPrice,CouponDiscount,SellerId";
    const result = await yahooRequest("orderInfo", token, `<Req><Target><OrderId>${escapeXml(id)}</OrderId><Field>${fields}</Field></Target><SellerId>${escapeXml(sellerId)}</SellerId></Req>`);
    const order = record(result.OrderInfo);
    if (order.OrderId !== id) throw new SalesApiError("yahoo", "order_identity_mismatch");
    reviews.append(items, () => normalizeYahooOrder(order, sellerId, period));
  }
  return { items, metadata: { ...apiMetadata("yahoo_order_time_non_cancelled", "official_discounted_transaction_unit_price_times_quantity", true), orderCount: orderIds.size, ...reviews.metadata() } };
}

export function normalizeBaseOrder(order: ApiRecord, period: SyncPeriod): NormalizedSalesItem[] {
  const id = requiredText("base", order.unique_key, "order_id");
  const status = requiredText("base", order.dispatch_status, "order_status");
  if (status === "cancelled" || order.cancelled) return [];
  // Match the present sales CSV's shipped-only condition, not all paid/unshipped orders.
  if (!["dispatched", "shipping"].includes(status)) return [];
  const occurredAt = unixTimestamp("base", order.ordered);
  requireInPeriod("base", occurredAt, period);
  if (!Array.isArray(order.order_items)) throw new SalesApiError("base", "items_missing");
  const discount = record(order.order_discount);
  const sellerDiscount = discount.discount == null ? 0 : numericValue("base", discount.discount, "order_discount");
  // The API has no documented per-product allocation for these order adjustments.
  // Preserve official line totals and stage this basis for reconciliation, never guess.
  const adjustment = record(order.order_amount_adjustment).adjusted_amount;
  if ((sellerDiscount > 0 && textValue(discount.is_allocate_user_balance_log) !== "1")
    || (adjustment != null && Number(adjustment) !== 0)
    || Number(record(order.order_header_coin).discount || 0) !== 0) {
    throw new SalesApiError("base", "order_discount_allocation_requires_review");
  }
  const seen = new Set<string>();
  const items: NormalizedSalesItem[] = [];
  for (const item of array(order.order_items)) {
    if (item.status === "cancelled") continue;
    const lineId = requiredText("base", item.order_item_id, "line_id");
    if (seen.has(lineId)) throw new SalesApiError("base", "duplicate_line");
    seen.add(lineId);
    const quantity = quantityValue("base", item.amount);
    if (!quantity) continue;
    const key = requiredText("base", item.variation_identifier || item.item_identifier || item.barcode || item.item_id, "product_key");
    // total includes purchased options, item_total alone does not.
    const amount = numericValue("base", item.total, "reported_line_total");
    items.push({ externalOrderId: id, externalLineId: lineId, externalProductKey: key,
      externalProductName: requiredText("base", item.title, "title"), occurredAt, quantity, amount,
      sourceStatus: status, rawData: { itemId: textValue(item.item_id), variationId: textValue(item.variation_id),
        total: amount, quantity, baseFundedOrderDiscount: sellerDiscount } });
  }
  return items;
}

export async function fetchBaseApiSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const checkDeadline = apiDeadline("base");
  const token = await salesApiAccessToken("base");
  const shopId = await verifyBaseApiShop(token);
  const headers = { Authorization: `Bearer ${token}` };
  const orderIds = new Set<string>();
  let complete = false;
  for (let page = 0; page < MAX_API_PAGES; page += 1) {
    checkDeadline();
    const url = new URL(`${BASE_ENDPOINT}/orders`);
    url.searchParams.set("start_ordered", `${period.startDate} 00:00:00`);
    url.searchParams.set("end_ordered", `${period.endDate} 23:59:59`);
    url.searchParams.set("limit", "100"); url.searchParams.set("offset", String(page * 100));
    const result = await apiJson("base", url, { headers });
    if (!Array.isArray(result.orders)) throw new SalesApiError("base", "order_list_missing");
    const batch = array(result.orders);
    for (const order of batch) {
      const id = requiredText("base", order.unique_key, "order_id");
      if (orderIds.has(id)) throw new SalesApiError("base", "duplicate_order_page");
      orderIds.add(id);
    }
    if (batch.length < 100) { complete = true; break; }
  }
  if (!complete) throw new SalesApiError("base", "incomplete_order_pages");
  const items: NormalizedSalesItem[] = [];
  const reviews = reviewCollector();
  for (const id of orderIds) {
    checkDeadline();
    const result = await apiJson("base", `${BASE_ENDPOINT}/orders/detail/${encodeURIComponent(id)}`, { headers });
    const order = record(result.order);
    if (order.unique_key !== id) throw new SalesApiError("base", "order_identity_mismatch");
    reviews.append(items, () => normalizeBaseOrder(order, period));
  }
  return { items, metadata: { ...apiMetadata("base_order_time_shipped", "official_product_line_total_including_options", true), orderCount: orderIds.size, shopId, ...reviews.metadata() } };
}

async function rakutenRequest(action: "searchOrder" | "getOrder", body: ApiRecord) {
  const endpoint = officialEndpoint("rakuten", process.env.RAKUTEN_RMS_API_BASE_URL, RAKUTEN_ENDPOINT);
  const secret = await requireApiCredential("RAKUTEN_RMS_SERVICE_SECRET");
  const license = await requireApiCredential("RAKUTEN_RMS_LICENSE_KEY");
  const result = await apiJson("rakuten", `${endpoint}/order/${action}/`, { method: "POST",
    headers: { Authorization: `ESA ${Buffer.from(`${secret}:${license}`).toString("base64")}`,
      "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  const messages = array(result.MessageModelList).concat(array(result.GetOrderMessageModelList));
  if (messages.some(message => textValue(message.messageType).toUpperCase() === "ERROR")) throw new SalesApiError("rakuten", "provider_error");
  return result;
}

export function normalizeRakutenOrder(order: ApiRecord, period: SyncPeriod): NormalizedSalesItem[] {
  const id = requiredText("rakuten", order.orderNumber, "order_id");
  const status = quantityValue("rakuten", order.orderProgress);
  if ([800, 900].includes(status)) return [];
  if (![100, 200, 300, 400, 500, 600, 700].includes(status)) throw new SalesApiError("rakuten", "invalid_order_status");
  const occurredAt = jstTimestamp("rakuten", order.orderDatetime);
  requireInPeriod("rakuten", occurredAt, period);
  if (!Array.isArray(order.PackageModelList)) throw new SalesApiError("rakuten", "packages_missing");
  if (textValue(order.couponShopPrice) === "-9999") throw new SalesApiError("rakuten", "coupon_amount_unresolved");
  const shopCoupon = order.couponShopPrice == null ? 0 : numericValue("rakuten", order.couponShopPrice, "shop_coupon");
  const coupons = array(order.CouponModelList).filter(coupon => textValue(coupon.couponCapitalCode) === "1");
  const targetedDiscounts = new Map<string, number>();
  let resolvedDiscount = 0;
  let orderWideDiscount = 0;
  for (const coupon of coupons) {
    const target = textValue(coupon.itemDetailId);
    if (textValue(coupon.couponTotalPrice) === "-9999") throw new SalesApiError("rakuten", "coupon_amount_unresolved");
    const discount = numericValue("rakuten", coupon.couponTotalPrice, "coupon_total");
    if (!target || target === "0") orderWideDiscount += discount;
    else targetedDiscounts.set(target, (targetedDiscounts.get(target) || 0) + discount);
    resolvedDiscount += discount;
  }
  if (resolvedDiscount !== shopCoupon) throw new SalesApiError("rakuten", "shop_coupon_total_mismatch");
  // An order-wide coupon has an unambiguous merchandise allocation only when
  // exactly one positive-quantity item line exists across every package.
  const eligibleLines: ApiRecord[] = [];
  for (const pkg of array(order.PackageModelList)) {
    if (!Array.isArray(pkg.ItemModelList)) throw new SalesApiError("rakuten", "items_missing");
    for (const item of array(pkg.ItemModelList)) if (quantityValue("rakuten", item.units) > 0) eligibleLines.push(item);
  }
  if (orderWideDiscount > 0 && eligibleLines.length !== 1) throw new SalesApiError("rakuten", "shop_coupon_allocation_requires_review");
  const seen = new Set<string>();
  const items: NormalizedSalesItem[] = [];
  for (const [packageIndex, pkg] of array(order.PackageModelList).entries()) {
    if (!Array.isArray(pkg.ItemModelList)) throw new SalesApiError("rakuten", "items_missing");
    for (const [lineIndex, item] of array(pkg.ItemModelList).entries()) {
      const quantity = quantityValue("rakuten", item.units);
      if (!quantity) continue;
      // Official order-time tax-inclusive unit price is independent of today's catalog.
      const unitPrice = numericValue("rakuten", item.priceTaxIncl, "transaction_tax_inclusive_price");
      const detailId = textValue(item.itemDetailId);
      const discount = (targetedDiscounts.get(detailId) || 0) + orderWideDiscount;
      const amount = unitPrice * quantity - discount;
      if (!Number.isSafeInteger(amount)) throw new SalesApiError("rakuten", "invalid_line_amount");
      if (amount < 0) throw new SalesApiError("rakuten", "coupon_exceeds_merchandise");
      const key = requiredText("rakuten", item.manageNumber || item.itemNumber || item.itemId, "product_key");
      const lineId = detailId || `${packageIndex}:${lineIndex}`;
      if (seen.has(lineId)) throw new SalesApiError("rakuten", "duplicate_line");
      seen.add(lineId);
      targetedDiscounts.delete(detailId);
      items.push({ externalOrderId: id, externalLineId: lineId,
        externalProductKey: key, externalProductName: requiredText("rakuten", item.itemName, "title"),
        occurredAt, quantity, amount, sourceStatus: String(status),
        rawData: { itemId: textValue(item.itemId), manageNumber: textValue(item.manageNumber),
          priceTaxIncl: unitPrice, units: quantity, targetedShopCoupon: discount } });
    }
  }
  if (targetedDiscounts.size) throw new SalesApiError("rakuten", "coupon_target_missing");
  return items;
}

export async function fetchRakutenApiSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const checkDeadline = apiDeadline("rakuten");
  const orderIds = new Set<string>();
  let complete = false;
  let expectedCount: number | null = null;
  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    checkDeadline();
    const result = await rakutenRequest("searchOrder", { dateType: 1,
      startDatetime: `${period.startDate}T00:00:00+0900`, endDatetime: `${period.endDate}T23:59:59+0900`,
      PaginationRequestModel: { requestRecordsAmount: 1000, requestPage: page,
        SortModelList: [{ sortColumn: 1, sortDirection: 1 }] } });
    if (!Array.isArray(result.orderNumberList)) throw new SalesApiError("rakuten", "order_list_missing");
    const pagination = record(result.PaginationResponseModel);
    const total = quantityValue("rakuten", pagination.totalRecordsAmount);
    if (total > MAX_API_ORDERS || (expectedCount !== null && total !== expectedCount)) throw new SalesApiError("rakuten", "order_list_changed_or_too_large");
    expectedCount = total;
    for (const value of result.orderNumberList) {
      const id = requiredText("rakuten", value, "order_id");
      if (orderIds.has(id)) throw new SalesApiError("rakuten", "duplicate_order_page");
      orderIds.add(id);
    }
    if (orderIds.size === total) { complete = true; break; }
    if (!result.orderNumberList.length || orderIds.size > total) throw new SalesApiError("rakuten", "incomplete_order_pages");
  }
  if (!complete) throw new SalesApiError("rakuten", "incomplete_order_pages");
  const items: NormalizedSalesItem[] = [];
  const reviews = reviewCollector();
  const ids = [...orderIds];
  for (let offset = 0; offset < ids.length; offset += 100) {
    checkDeadline();
    const requested = ids.slice(offset, offset + 100);
    const result = await rakutenRequest("getOrder", { orderNumberList: requested, version: 8 });
    if (!Array.isArray(result.OrderModelList)) throw new SalesApiError("rakuten", "order_details_missing");
    const returned = new Set<string>();
    for (const order of array(result.OrderModelList)) {
      const id = requiredText("rakuten", order.orderNumber, "order_id");
      if (!requested.includes(id) || returned.has(id)) throw new SalesApiError("rakuten", "order_identity_mismatch");
      returned.add(id); reviews.append(items, () => normalizeRakutenOrder(order, period));
    }
    if (returned.size !== requested.length) throw new SalesApiError("rakuten", "order_details_incomplete");
  }
  return { items, metadata: { ...apiMetadata("rakuten_order_time_non_cancelled", "official_transaction_tax_inclusive_price_less_verified_shop_coupon", true), orderCount: orderIds.size, ...reviews.metadata() } };
}
