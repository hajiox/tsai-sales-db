import { createHmac } from "node:crypto";
import { addDays } from "./date";
import { fetchAmazonApiSales, fetchRakutenApiSales, fetchYahooApiSales, fetchBaseApiSales } from "./official-sales-api";
import { requireEnv } from "./config";
import { compactText, fetchJson, numberValue } from "./http";
import { requireReportedAmount } from "./actual-sales-policy";
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
      return fetchAmazonApiSales(period);
    case "rakuten":
      return fetchRakutenApiSales(period);
    case "yahoo":
      return fetchYahooApiSales(period);
    case "mercari":
      return fetchMercariSales(period);
    case "base":
      return fetchBaseApiSales(period);
    case "qoo10":
      return fetchQoo10Sales(period);
    case "tiktok":
      return fetchTiktokSales(period);
  }
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
          amount: requireReportedAmount("mercari", product.line_amount),
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
    const amount = requireReportedAmount("qoo10", row.line_amount);
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
        const amount = requireReportedAmount("tiktok", line.line_amount);
        items.push({
          externalOrderId: compactText(order.id),
          externalLineId: compactText(line.id || line.sku_id) || `${key}:${index}`,
          externalProductKey: key,
          externalProductName: compactText(line.product_name || line.display_status || line.name),
          occurredAt: unixTimeToIso(order.create_time),
          quantity,
          amount,
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
