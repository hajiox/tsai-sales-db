import { createHmac } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { addDays } from "./date";
import { requireEnv } from "./config";
import { compactText, fetchJson, numberValue, sleep } from "./http";
import type {
  ChannelFetchResult,
  NormalizedSalesItem,
  SyncPeriod,
  WebSalesChannel,
} from "./types";

type UnknownRecord = Record<string, any>;

export async function fetchChannelSales(
  channel: WebSalesChannel,
  period: SyncPeriod,
): Promise<ChannelFetchResult> {
  switch (channel) {
    case "amazon":
      return fetchAmazonSales(period);
    case "rakuten":
      return fetchRakutenSales(period);
    case "yahoo":
      return fetchYahooSales(period);
    case "mercari":
      return fetchMercariSales(period);
    case "base":
      return fetchBaseSales(period);
    case "qoo10":
      return fetchQoo10Sales(period);
    case "tiktok":
      return fetchTiktokSales(period);
  }
}

async function fetchAmazonAccessToken() {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: requireEnv("AMAZON_SP_API_REFRESH_TOKEN"),
    client_id: requireEnv("AMAZON_SP_API_CLIENT_ID"),
    client_secret: requireEnv("AMAZON_SP_API_CLIENT_SECRET"),
  });
  const result = await fetchJson<{ access_token: string }>(
    "https://api.amazon.com/auth/o2/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!result.access_token) throw new Error("Amazon LWA token was not returned");
  return result.access_token;
}

function amazonHeaders(accessToken: string) {
  return {
    "content-type": "application/json",
    "x-amz-access-token": accessToken,
    "x-amz-date": new Date().toISOString().replace(/[-:]|\.\d{3}/g, ""),
    "user-agent": "TSA-WebSalesAutomation/1.0 (Language=TypeScript)",
  };
}

async function fetchAmazonSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const token = await fetchAmazonAccessToken();
  const endpoint = process.env.AMAZON_SP_API_ENDPOINT?.trim()
    || "https://sellingpartnerapi-fe.amazon.com";
  const marketplaceId = process.env.AMAZON_SP_API_MARKETPLACE_ID?.trim()
    || "A1VC38T7YXB528";
  const created = await fetchJson<{ reportId: string }>(
    `${endpoint}/reports/2021-06-30/reports`,
    {
      method: "POST",
      headers: amazonHeaders(token),
      body: JSON.stringify({
        reportType: "GET_SALES_AND_TRAFFIC_REPORT",
        dataStartTime: `${period.startDate}T00:00:00Z`,
        dataEndTime: `${addDays(period.endDate, 1)}T00:00:00Z`,
        marketplaceIds: [marketplaceId],
        reportOptions: {
          dateGranularity: "DAY",
          asinGranularity: "CHILD",
        },
      }),
    },
  );
  if (!created.reportId) throw new Error("Amazon reportId was not returned");

  let reportDocumentId = "";
  let processingStatus = "IN_QUEUE";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (attempt > 0) await sleep(Math.min(2000 + attempt * 250, 5000));
    const report = await fetchJson<{
      processingStatus: string;
      reportDocumentId?: string;
    }>(`${endpoint}/reports/2021-06-30/reports/${created.reportId}`, {
      headers: amazonHeaders(token),
    });
    processingStatus = report.processingStatus;
    if (processingStatus === "DONE" && report.reportDocumentId) {
      reportDocumentId = report.reportDocumentId;
      break;
    }
    if (["CANCELLED", "FATAL"].includes(processingStatus)) {
      throw new Error(`Amazon report failed: ${processingStatus}`);
    }
  }
  if (!reportDocumentId) {
    throw new Error(`Amazon report is not ready: ${processingStatus}. 再実行してください`);
  }

  const document = await fetchJson<{
    url: string;
    compressionAlgorithm?: string;
  }>(`${endpoint}/reports/2021-06-30/documents/${reportDocumentId}`, {
    headers: amazonHeaders(token),
  });
  const documentResponse = await fetch(document.url, { cache: "no-store" });
  if (!documentResponse.ok) {
    throw new Error(`Amazon report download failed: ${documentResponse.status}`);
  }
  const bytes = Buffer.from(await documentResponse.arrayBuffer());
  const text = document.compressionAlgorithm === "GZIP"
    ? gunzipSync(bytes).toString("utf8")
    : bytes.toString("utf8");
  const payload = JSON.parse(text) as UnknownRecord;
  const rows = asArray(payload.salesAndTrafficByAsin);
  const snapshotKey = `${period.startDate}_${period.endDate}`;
  const items = rows.map((row, index): NormalizedSalesItem => {
    const key = compactText(row.childAsin || row.sku || row.parentAsin);
    const sales = row.salesByAsin || {};
    return {
      externalOrderId: snapshotKey,
      externalLineId: `${key || "unknown"}:${index}`,
      externalProductKey: key || `amazon-row-${index}`,
      externalProductName: compactText(row.title || row.productName || key),
      occurredAt: null,
      quantity: numberValue(sales.unitsOrdered),
      amount: numberValue(sales.orderedProductSales?.amount),
      sourceStatus: "reported",
      rawData: row,
    };
  }).filter((item) => item.quantity > 0);
  return { items, metadata: { reportId: created.reportId, reportDocumentId } };
}

function rakutenHeaders() {
  const credentials = Buffer.from(
    `${requireEnv("RAKUTEN_RMS_SERVICE_SECRET")}:${requireEnv("RAKUTEN_RMS_LICENSE_KEY")}`,
  ).toString("base64");
  return {
    Authorization: `ESA ${credentials}`,
    "content-type": "application/json; charset=utf-8",
  };
}

async function fetchRakutenSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const baseUrl = process.env.RAKUTEN_RMS_API_BASE_URL?.trim()
    || "https://api.rms.rakuten.co.jp/es/2.0";
  const orderNumbers: string[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await fetchJson<UnknownRecord>(`${baseUrl}/order/searchOrder/`, {
      method: "POST",
      headers: rakutenHeaders(),
      body: JSON.stringify({
        dateType: 1,
        startDatetime: `${period.startDate}T00:00:00+0900`,
        endDatetime: `${period.endDate}T23:59:59+0900`,
        orderProgressList: [100, 200, 300, 400, 500, 600, 700, 800],
        PaginationRequestModel: {
          requestRecordsAmount: 1000,
          requestPage: page,
          SortModelList: [{ sortColumn: 1, sortDirection: 1 }],
        },
      }),
    });
    const model = result.orderSearchModel || result;
    orderNumbers.push(...asArray(model.orderNumberList).map(String));
    totalPages = numberValue(model.PaginationResponseModel?.totalPages) || 1;
    page += 1;
  } while (page <= totalPages);

  const items: NormalizedSalesItem[] = [];
  for (let offset = 0; offset < orderNumbers.length; offset += 100) {
    const batch = orderNumbers.slice(offset, offset + 100);
    const result = await fetchJson<UnknownRecord>(`${baseUrl}/order/getOrder/`, {
      method: "POST",
      headers: rakutenHeaders(),
      body: JSON.stringify({ orderNumberList: batch, version: 7 }),
    });
    const orders = asArray(result.OrderModelList || result.orderModelList || result.orders);
    for (const order of orders) {
      const orderNumber = compactText(order.orderNumber || order.OrderNumber);
      const orderedAt = compactText(order.orderDatetime || order.OrderDatetime) || null;
      const packages = asArray(order.PackageModelList || order.packageModelList || order.packages);
      const packageModels = packages.length > 0 ? packages : [order];
      let lineIndex = 0;
      for (const pkg of packageModels) {
        for (const item of asArray(pkg.ItemModelList || pkg.itemModelList || pkg.items)) {
          const sku = asArray(item.SkuModelList || item.skuModelList)[0] || {};
          const key = compactText(
            sku.variantId || item.manageNumber || item.itemNumber || item.itemId,
          );
          const quantity = numberValue(item.units || item.quantity);
          const unitPrice = numberValue(item.price || item.unitPrice);
          if (quantity <= 0) continue;
          items.push({
            externalOrderId: orderNumber,
            externalLineId: compactText(item.itemDetailId || item.itemId) || `${key}:${lineIndex++}`,
            externalProductKey: key || `rakuten-${orderNumber}-${lineIndex}`,
            externalProductName: compactText(item.itemName || item.productName),
            occurredAt: orderedAt,
            quantity,
            amount: numberValue(item.itemPrice) || unitPrice * quantity,
            sourceStatus: compactText(order.orderProgress) || null,
            rawData: item,
          });
        }
      }
    }
  }
  return { items, metadata: { orderCount: orderNumbers.length } };
}

async function fetchYahooAccessToken() {
  const clientId = requireEnv("YAHOO_SHOPPING_CLIENT_ID");
  const clientSecret = requireEnv("YAHOO_SHOPPING_CLIENT_SECRET");
  const result = await fetchJson<{ access_token: string }>(
    "https://auth.login.yahoo.co.jp/yconnect/v2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: requireEnv("YAHOO_SHOPPING_REFRESH_TOKEN"),
      }),
    },
  );
  return result.access_token;
}

async function fetchYahooSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const token = await fetchYahooAccessToken();
  const sellerId = requireEnv("YAHOO_SHOPPING_SELLER_ID");
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const items: NormalizedSalesItem[] = [];
  let start = 1;
  let totalCount = 1;
  do {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Req><Search><Result>2000</Result><Start>${start}</Start><Sort>+order_time</Sort><Condition><OrderTimeFrom>${period.startDate.replaceAll("-", "")}000000</OrderTimeFrom><OrderTimeTo>${period.endDate.replaceAll("-", "")}235959</OrderTimeTo><IsActive>true</IsActive></Condition><Field>OrderId,OrderTime,OrderStatus,IsActive,ItemId,ItemTitle,Quantity,UnitPrice</Field></Search><SellerId>${escapeXml(sellerId)}</SellerId></Req>`;
    const response = await fetch(
      "https://circus.shopping.yahooapis.jp/ShoppingWebService/V1/orderList",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/xml; charset=utf-8",
        },
        body: xml,
        cache: "no-store",
      },
    );
    const text = await response.text();
    if (!response.ok) throw new Error(`Yahoo API ${response.status}: ${text.slice(0, 800)}`);
    const parsed = parser.parse(text) as UnknownRecord;
    const result = parsed.ResultSet?.Result || parsed.Result || parsed;
    const search = result.Search || result.search || result;
    totalCount = numberValue(search.TotalCount || result.TotalCount) || 0;
    const orders = asArray(search.OrderInfo || result.OrderInfo);
    for (const order of orders) {
      const orderId = compactText(order.OrderId);
      const orderItems = asArray(order.Item || order.Items?.Item);
      orderItems.forEach((item, index) => {
        const quantity = numberValue(item.Quantity);
        if (quantity <= 0) return;
        const key = compactText(item.ItemId || item.SubCode);
        items.push({
          externalOrderId: orderId,
          externalLineId: compactText(item.LineId) || `${key}:${index}`,
          externalProductKey: key || `yahoo-${orderId}-${index}`,
          externalProductName: compactText(item.ItemTitle),
          occurredAt: compactText(order.OrderTime) || null,
          quantity,
          amount: numberValue(item.UnitPrice) * quantity,
          sourceStatus: compactText(order.OrderStatus) || null,
          rawData: item,
        });
      });
    }
    start += orders.length || 2000;
  } while (start <= totalCount);
  return { items, metadata: { orderCount: totalCount } };
}

async function fetchMercariSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const endpoint = process.env.MERCARI_SHOPS_API_URL?.trim()
    || "https://api.mercari-shops.com/v1/graphql";
  const query = `query orderTransactions($after:String,$first:Int,$orderedDateGte:DateTime,$orderedDateLt:DateTime,$salesChannels:[OrderSalesChannel!],$statuses:[OrderTransactionStatusFilter!]){orderTransactions(after:$after,first:$first,orderedDateGte:$orderedDateGte,orderedDateLt:$orderedDateLt,salesChannels:$salesChannels,statuses:$statuses){edges{node{id createdAt status products{name productId purchasedQuantity shippedCanceledQuantity unshippedCanceledQuantity unitPrice variant{id skuCode janCode name}}}}pageInfo{endCursor hasNextPage}}}`;
  const items: NormalizedSalesItem[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const result: UnknownRecord = await fetchJson<UnknownRecord>(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("MERCARI_SHOPS_ACCESS_TOKEN")}`,
        "User-Agent": requireEnv("MERCARI_SHOPS_USER_AGENT"),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          after,
          first: 100,
          orderedDateGte: `${period.startDate}T00:00:00+09:00`,
          orderedDateLt: `${addDays(period.endDate, 1)}T00:00:00+09:00`,
          salesChannels: ["MERCARI_SHOPS"],
          statuses: ["WAITING_FOR_SHIPPING", "COMPLETING", "COMPLETED"],
        },
      }),
    });
    if (result.errors?.length) throw new Error(`Mercari API: ${JSON.stringify(result.errors).slice(0, 800)}`);
    const connection: UnknownRecord = result.data?.orderTransactions || {};
    for (const edge of asArray(connection.edges)) {
      const order = edge.node || {};
      asArray(order.products).forEach((product, index) => {
        const quantity = Math.max(
          0,
          numberValue(product.purchasedQuantity)
            - numberValue(product.shippedCanceledQuantity)
            - numberValue(product.unshippedCanceledQuantity),
        );
        if (quantity <= 0) return;
        const variant = product.variant || {};
        const key = compactText(variant.skuCode || variant.janCode || variant.id || product.productId);
        items.push({
          externalOrderId: compactText(order.id),
          externalLineId: `${compactText(product.productId)}:${compactText(variant.id) || index}`,
          externalProductKey: key,
          externalProductName: compactText(product.name),
          occurredAt: compactText(order.createdAt) || null,
          quantity,
          amount: numberValue(product.unitPrice) * quantity,
          sourceStatus: compactText(order.status) || null,
          rawData: product,
        });
      });
    }
    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    after = connection.pageInfo?.endCursor || null;
  }
  return { items };
}

async function fetchBaseAccessToken() {
  const result = await fetchJson<{ access_token: string }>(
    "https://api.thebase.in/1/oauth/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: requireEnv("BASE_CLIENT_ID"),
        client_secret: requireEnv("BASE_CLIENT_SECRET"),
        refresh_token: requireEnv("BASE_REFRESH_TOKEN"),
      }),
    },
  );
  return result.access_token;
}

async function fetchBaseSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const token = await fetchBaseAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const orderHeaders: UnknownRecord[] = [];
  let offset = 0;
  while (true) {
    const url = new URL("https://api.thebase.in/1/orders");
    url.searchParams.set("start_ordered", `${period.startDate} 00:00:00`);
    url.searchParams.set("end_ordered", `${period.endDate} 23:59:59`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    const result = await fetchJson<{ orders?: UnknownRecord[] }>(url, { headers });
    const batch = result.orders || [];
    orderHeaders.push(...batch);
    if (batch.length < 100) break;
    offset += batch.length;
  }

  const items: NormalizedSalesItem[] = [];
  for (const header of orderHeaders) {
    if (header.cancelled || header.dispatch_status === "cancelled" || header.dispatch_status === "unpaid") continue;
    const key = compactText(header.unique_key);
    const detail = await fetchJson<{ order?: UnknownRecord }>(
      `https://api.thebase.in/1/orders/detail/${encodeURIComponent(key)}`,
      { headers },
    );
    const order = detail.order || {};
    asArray(order.order_items).forEach((item, index) => {
      if (item.status === "cancelled") return;
      const quantity = numberValue(item.amount);
      if (quantity <= 0) return;
      const productKey = compactText(
        item.variation_identifier || item.item_identifier || item.barcode || item.item_id,
      );
      items.push({
        externalOrderId: key,
        externalLineId: compactText(item.order_item_id) || `${productKey}:${index}`,
        externalProductKey: productKey,
        externalProductName: compactText(item.title),
        occurredAt: unixTimeToIso(order.ordered || header.ordered),
        quantity,
        amount: numberValue(item.item_total || item.total) || numberValue(item.price) * quantity,
        sourceStatus: compactText(item.status || order.dispatch_status) || null,
        rawData: item,
      });
    });
  }
  return { items, metadata: { orderCount: orderHeaders.length } };
}

async function fetchQoo10Sales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const configuredEndpoint = process.env.QOO10_API_URL?.trim();
  const endpoint = qoo10ShippingEndpoint(configuredEndpoint);
  const rowsByOrder = new Map<string, UnknownRecord>();
  for (const shippingStatus of ["1", "2", "3", "4", "5"]) {
    const body = new URLSearchParams({
      returnType: "application/json",
      ShippingStatus: shippingStatus,
      SearchStartDate: period.startDate.replaceAll("-", ""),
      SearchEndDate: period.endDate.replaceAll("-", ""),
      SearchCondition: "1",
    });
    const result = await fetchJson<UnknownRecord>(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        GiosisCertificationKey: requireEnv("QOO10_API_KEY"),
        QAPIVersion: "1.0",
      },
      body,
    });
    if (numberValue(result.ResultCode) !== 0) {
      throw new Error(`Qoo10 API: ${compactText(result.ResultMsg || result.ResultMessage)}`);
    }
    for (const row of asArray(result.ResultObject || result.resultObject || result.data)) {
      const orderId = compactText(row.OrderNo || row.orderNo);
      if (orderId) rowsByOrder.set(orderId, row);
    }
  }

  const items: NormalizedSalesItem[] = [];
  for (const [orderId, row] of rowsByOrder) {
    const quantity = numberValue(row.OrderQty || row.orderQty || row.Quantity) || 1;
    const claimStatus = compactText(row.ClaimStatus || row.claimStatus);
    if (quantity <= 0 || (claimStatus && claimStatus !== "0")) continue;
    const key = compactText(
      row.SellerItemCode || row.sellerItemCode || row.OptionCode || row.ItemCode || row.ItemNo,
    );
    const amount = numberValue(row.Total || row.total || row.OrderPrice || row.orderPrice)
      || numberValue(row.SellPrice || row.sellPrice) * quantity;
    if (amount <= 0) continue;
    items.push({
      externalOrderId: orderId,
      externalLineId: compactText(row.CartNo || row.cartNo || row.PackNo) || orderId,
      externalProductKey: key || compactText(row.ItemNo || row.itemNo),
      externalProductName: compactText(row.ItemTitle || row.itemTitle),
      occurredAt: compactText(row.OrderDate || row.orderDate || row.PaymentDate) || null,
      quantity,
      amount,
      sourceStatus: compactText(row.ShippingStatus || row.shippingStatus) || "official_api",
      rawData: row,
    });
  }
  return {
    items,
    metadata: {
      source: "qoo10_official_shipping_api_v3",
      statuses_checked: ["1", "2", "3", "4", "5"],
      order_count: rowsByOrder.size,
    },
  };
}

function qoo10ShippingEndpoint(configured?: string) {
  const fallback = "https://api.qoo10.jp/GMKT.INC.Front.QAPIService/ebayjapan.qapi/ShippingBasic.GetShippingInfo_v3";
  if (!configured) return fallback;
  const value = configured.replace(/\/+$/, "");
  if (/ShippingBasic\.GetShippingInfo_v3$/i.test(value)) return value;
  if (/\/ebayjapan\.qapi$/i.test(value)) return `${value}/ShippingBasic.GetShippingInfo_v3`;
  if (/Front\.QAPIService$/i.test(value)) return `${value}/ebayjapan.qapi/ShippingBasic.GetShippingInfo_v3`;
  throw new Error("QOO10_API_URL must point to the official QAPI service or GetShippingInfo_v3 endpoint");
}

function signTiktokRequest(path: string, params: URLSearchParams, body: string) {
  const sorted = [...params.entries()]
    .filter(([key]) => !["sign", "access_token"].includes(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const secret = requireEnv("TIKTOK_SHOP_APP_SECRET");
  const canonical = `${secret}${path}${sorted.map(([key, value]) => `${key}${value}`).join("")}${body}${secret}`;
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

async function fetchTiktokSales(period: SyncPeriod): Promise<ChannelFetchResult> {
  const host = process.env.TIKTOK_SHOP_API_HOST?.trim()
    || "https://open-api.tiktokglobalshop.com";
  const version = process.env.TIKTOK_SHOP_ORDER_API_VERSION?.trim() || "202309";
  const path = `/order/${version}/orders/search`;
  const items: NormalizedSalesItem[] = [];
  let pageToken = "";
  while (true) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const params = new URLSearchParams({
      app_key: requireEnv("TIKTOK_SHOP_APP_KEY"),
      timestamp,
      shop_cipher: requireEnv("TIKTOK_SHOP_SHOP_CIPHER"),
      page_size: "100",
    });
    if (pageToken) params.set("page_token", pageToken);
    const body = JSON.stringify({
      create_time_ge: Math.floor(new Date(`${period.startDate}T00:00:00+09:00`).getTime() / 1000),
      create_time_lt: Math.floor(new Date(`${addDays(period.endDate, 1)}T00:00:00+09:00`).getTime() / 1000),
    });
    params.set("sign", signTiktokRequest(path, params, body));
    const result = await fetchJson<UnknownRecord>(`${host}${path}?${params.toString()}`, {
      method: "POST",
      headers: {
        "x-tts-access-token": requireEnv("TIKTOK_SHOP_ACCESS_TOKEN"),
        "content-type": "application/json",
      },
      body,
    });
    if (numberValue(result.code) !== 0) throw new Error(`TikTok API: ${compactText(result.message)}`);
    const orders = asArray(result.data?.orders);
    for (const order of orders) {
      if (["CANCELLED", "UNPAID"].includes(compactText(order.status).toUpperCase())) continue;
      const lines = asArray(order.line_items || order.skus || order.items);
      lines.forEach((line, index) => {
        const quantity = Math.max(
          0,
          numberValue(line.quantity || 1)
            - numberValue(line.cancelled_quantity)
            - numberValue(line.refunded_quantity),
        );
        if (quantity <= 0) return;
        const key = compactText(
          line.seller_sku || line.sku_id || line.id || line.product_id,
        );
        const amount = numberValue(
          line.sale_price?.amount || line.original_price?.amount || line.price?.amount || line.sku_subtotal_after_discount,
        );
        items.push({
          externalOrderId: compactText(order.id),
          externalLineId: compactText(line.id || line.sku_id) || `${key}:${index}`,
          externalProductKey: key,
          externalProductName: compactText(line.product_name || line.display_status || line.name),
          occurredAt: unixTimeToIso(order.create_time),
          quantity,
          amount: amount * quantity,
          sourceStatus: compactText(order.status) || null,
          rawData: line,
        });
      });
    }
    pageToken = compactText(result.data?.next_page_token);
    if (!pageToken) break;
  }
  return { items };
}

function asArray<T = UnknownRecord>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function unixTimeToIso(value: unknown) {
  const seconds = numberValue(value);
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
