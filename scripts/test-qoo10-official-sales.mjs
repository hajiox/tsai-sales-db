import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  acquireQoo10OfficialSales,
  buildQoo10OfficialCsv,
  buildQoo10OfficialEvidence,
} from "../tools/tsa-codex-bridge/qoo10-official-sales.mjs";

const orderFixtures = [
  ["1206705330", "2026-08-02T23:41:49+09:00", 4290, "03-N1K0-ZVU7", "800gチャーシュー"],
  ["1206890757", "2026-08-03T21:17:15+09:00", 2950, "KY-5TZN-SL0M", "切り落としチャーシュー"],
  ["1208788511", "2026-08-11T22:54:20+09:00", 1850, "AI-M870-2MXL", "豆十種ミックス"],
  ["1210566394", "2026-08-22T02:25:28+09:00", 1850, "YN-T1VW-H4BW", "辛杉家"],
  ["1210767302", "2026-08-24T10:42:53+09:00", 2390, "HV-O4KG-XCI6", "個包装チャーシュー"],
].map(([id, orderedAt, amount, sku, name], index) => ({
  id: index + 1,
  platform: "qoo10",
  external_order_id: id,
  ordered_at: orderedAt,
  reporting_date: orderedAt.slice(0, 10),
  total_amount: amount,
  status: "confirmed",
  is_counted: 1,
  source_subject: "Qoo10 API",
  source_from_email: "api://qoo10",
  items: [{
    line_number: 1,
    product_name: name,
    sku,
    quantity: 1,
    unit_price: amount,
    line_amount: amount,
  }],
}));

const official = await acquireQoo10OfficialSales({
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  fetchImpl: mockFetch({ checked: 5, orders: orderFixtures }),
});
assert.equal(official.apiOrderCount, 5);
assert.equal(official.countedOrderCount, 5);
assert.equal(official.totalQuantity, 5);
assert.equal(official.totalAmount, 13_330);
assert.equal(official.rows.length, 5);

const csv = buildQoo10OfficialCsv(official);
assert.match(csv, /配送状態,注文番号,注文日,商品番号,商品名,数量,販売者商品コード,購入者決済金額/);
assert.match(csv, /1206705330/);
assert.match(csv, /03-N1K0-ZVU7/);
assert.match(csv, /4290/);

const evidence = buildQoo10OfficialEvidence(official, "2026-09-02T00:00:00.000Z");
assert.equal(evidence.schema_version, 3);
assert.deepEqual(evidence.statuses_checked, ["1", "2", "3", "4", "5"]);
assert.equal(evidence.api_order_count, 5);
assert.equal(evidence.total_quantity, 5);
assert.equal(evidence.total_amount, 13_330);

const zero = await acquireQoo10OfficialSales({
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  fetchImpl: mockFetch({ checked: 0, orders: [] }),
});
assert.equal(zero.totalQuantity, 0);
assert.equal(buildQoo10OfficialEvidence(zero).counted_order_count, 0);

await assert.rejects(
  acquireQoo10OfficialSales({
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    fetchImpl: mockFetch({ checked: 5, orders: orderFixtures.slice(0, 4) }),
  }),
  /API 5件 \/ 保存 4件/,
);

await assert.rejects(
  acquireQoo10OfficialSales({
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    fetchImpl: mockFetch({ checked: 0, orders: [], syncErrors: 1 }),
  }),
  /公式API同期に失敗/,
);

const root = resolve(import.meta.dirname, "..");
const bridge = readFileSync(resolve(root, "tools/tsa-codex-bridge/bridge.mjs"), "utf8");
const installer = readFileSync(resolve(root, "tools/tsa-codex-bridge/install-bridge.ps1"), "utf8");
const connector = readFileSync(resolve(root, "lib/web-sales-automation/connectors.ts"), "utf8");
const mappingRoute = readFileSync(resolve(root, "app/api/web-sales/automation/mapping/route.ts"), "utf8");
assert.match(bridge, /executeQoo10OfficialSalesJob/);
assert.match(bridge, /job\.channel === "qoo10"/);
assert.match(installer, /qoo10-official-sales\.mjs/);
assert.match(connector, /ShippingBasic\.GetShippingInfo_v3/);
assert.match(connector, /\["1", "2", "3", "4", "5"\]/);
assert.match(mappingRoute, /status: completed \? "completed" : "needs_review"/);
assert.match(mappingRoute, /summary,\s*details,/);
assert.match(mappingRoute, /imported_count: completed \? result\.quantityTotal : null/);

console.log("Qoo10 official sales tests passed");

function mockFetch({ checked, orders, syncErrors = 0 }) {
  return async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/ec-orders/qoo10")) {
      return jsonResponse({
        success: true,
        result: {
          enabled: true,
          configured: true,
          checked,
          upserted: checked,
          skipped: 0,
          errors: syncErrors,
          lastError: syncErrors ? "fixture error" : undefined,
        },
      });
    }
    if (url.pathname.endsWith("/api/ec-orders")) return jsonResponse({ orders });
    return new Response("not found", { status: 404 });
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
