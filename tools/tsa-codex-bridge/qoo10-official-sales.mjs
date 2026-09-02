const QOO10_SHIPPING_STATUSES = Object.freeze(["1", "2", "3", "4", "5"]);
const DEFAULT_TIMEOUT_MS = 120_000;

export async function acquireQoo10OfficialSales({
  baseUrl = "http://127.0.0.1:3004",
  startDate,
  endDate,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  validatePeriod(startDate, endDate);
  const root = String(baseUrl || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(root)) throw new Error("DocScanner API URLが正しくありません");

  const syncUrl = new URL(`${root}/api/ec-orders/qoo10`);
  syncUrl.searchParams.set("action", "sync");
  syncUrl.searchParams.set("start", startDate);
  syncUrl.searchParams.set("end", endDate);
  const syncPayload = await fetchJson(syncUrl, fetchImpl, timeoutMs, "Qoo10公式API同期");
  const sync = syncPayload?.result;
  if (syncPayload?.success !== true || !sync || typeof sync !== "object") {
    throw new Error("DocScannerからQoo10公式API同期結果を取得できませんでした");
  }
  if (sync.enabled !== true) throw new Error("DocScannerのQoo10公式API同期が無効です");
  if (sync.configured !== true) throw new Error("DocScannerのQoo10公式API認証が未設定です");
  if (number(sync.errors) !== 0) {
    throw new Error(`Qoo10公式API同期に失敗しました: ${safeMessage(sync.lastError || sync.message)}`);
  }

  const apiOrderCount = integer(sync.checked);
  const ordersUrl = new URL(`${root}/api/ec-orders`);
  // EC速報は営業日カットオフで絞るため、境界だけ広げて公式の注文日で再判定する。
  ordersUrl.searchParams.set("start", shiftDate(startDate, -1));
  ordersUrl.searchParams.set("end", shiftDate(endDate, 1));
  ordersUrl.searchParams.set("limit", "10000");
  const orderPayload = await fetchJson(ordersUrl, fetchImpl, timeoutMs, "DocScanner EC注文読込");
  if (!Array.isArray(orderPayload?.orders)) {
    throw new Error("DocScannerのEC注文応答にorders配列がありません");
  }

  const officialOrders = orderPayload.orders.filter((order) =>
    isOfficialQoo10Order(order) && isDateInPeriod(order, startDate, endDate));
  const byOrderId = new Map();
  for (const order of officialOrders) {
    const orderId = clean(order.external_order_id);
    if (!orderId) throw new Error("Qoo10公式注文に注文番号がありません");
    if (byOrderId.has(orderId)) throw new Error(`Qoo10公式注文が重複しています: ${orderId}`);
    byOrderId.set(orderId, order);
  }
  if (byOrderId.size !== apiOrderCount) {
    throw new Error(`Qoo10公式API件数とDocScanner保存件数が一致しません（API ${apiOrderCount}件 / 保存 ${byOrderId.size}件）`);
  }

  const rows = [];
  let countedOrderCount = 0;
  let totalAmount = 0;
  for (const order of byOrderId.values()) {
    if (number(order.is_counted) !== 1 || clean(order.status) !== "confirmed") continue;
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) throw new Error(`Qoo10公式注文${clean(order.external_order_id)}に商品明細がありません`);
    countedOrderCount += 1;
    for (const [index, item] of items.entries()) {
      const quantity = number(item.quantity);
      const productName = clean(item.product_name);
      if (!(quantity > 0) || !productName) {
        throw new Error(`Qoo10公式注文${clean(order.external_order_id)}の明細${index + 1}が不完全です`);
      }
      const lineAmount = number(item.line_amount) || number(item.unit_price) * quantity;
      rows.push({
        shippingStatus: "配送完了",
        orderNumber: clean(order.external_order_id),
        orderDate: normalizeOrderDate(order.ordered_at || order.reporting_date),
        productNumber: "",
        productName,
        quantity,
        sellerProductCode: clean(item.sku),
        buyerPaymentAmount: Math.round(lineAmount),
      });
      totalAmount += Math.round(lineAmount);
    }
  }

  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  return {
    source: "qoo10_official_api_via_docscanner",
    periodStart: startDate,
    periodEnd: endDate,
    statusesChecked: [...QOO10_SHIPPING_STATUSES],
    apiOrderCount,
    countedOrderCount,
    itemCount: rows.length,
    totalQuantity,
    totalAmount,
    syncChecked: apiOrderCount,
    syncUpserted: integer(sync.upserted),
    rows,
  };
}

export function buildQoo10OfficialCsv(result) {
  const rows = [
    ["配送状態", "注文番号", "注文日", "商品番号", "商品名", "数量", "販売者商品コード", "購入者決済金額"],
    ...result.rows.map((row) => [
      row.shippingStatus,
      row.orderNumber,
      row.orderDate,
      row.productNumber,
      row.productName,
      String(row.quantity),
      row.sellerProductCode,
      String(row.buyerPaymentAmount),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function buildQoo10OfficialEvidence(result, generatedAt = new Date().toISOString()) {
  return {
    schema_version: 3,
    channel: "qoo10",
    source: "qoo10_official_api_via_docscanner",
    source_system: "DocScanner",
    date_basis: "注文日",
    period_start: result.periodStart,
    period_end: result.periodEnd,
    statuses_checked: [...QOO10_SHIPPING_STATUSES],
    sync_enabled: true,
    sync_configured: true,
    sync_errors: 0,
    api_order_count: result.apiOrderCount,
    counted_order_count: result.countedOrderCount,
    item_count: result.itemCount,
    total_quantity: result.totalQuantity,
    total_amount: result.totalAmount,
    generated_at: generatedAt,
  };
}

async function fetchJson(url, fetchImpl, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    if (!payload || typeof payload !== "object") throw new Error(`${label}がJSONを返しませんでした`);
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${label}が${Math.ceil(timeoutMs / 1000)}秒でタイムアウトしました`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isOfficialQoo10Order(order) {
  return order
    && clean(order.platform).toLowerCase() === "qoo10"
    && clean(order.source_subject) === "Qoo10 API"
    && clean(order.source_from_email) === "api://qoo10";
}

function isDateInPeriod(order, startDate, endDate) {
  const date = clean(order.ordered_at).slice(0, 10) || clean(order.reporting_date);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= startDate && date <= endDate;
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function normalizeOrderDate(value) {
  const input = clean(value);
  const match = input.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2}))?/);
  if (!match) throw new Error(`Qoo10注文日を解釈できません: ${input || "空欄"}`);
  return `${match[1]}${match[2] ? ` ${match[2]}` : ""}`;
}

function validatePeriod(startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ""))
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ""))
    || startDate > endDate) {
    throw new Error("Qoo10対象期間が正しくありません");
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value) {
  return Math.max(0, Math.trunc(number(value)));
}

function safeMessage(value) {
  return clean(value).replace(/\s+/g, " ").slice(0, 300) || "詳細不明";
}
