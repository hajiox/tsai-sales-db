const assert = require("node:assert/strict");
const XLSX = require("xlsx");

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "Node",
});
require("ts-node/register/transpile-only");

const {
  DEFAULT_SENDER_SETTINGS,
  convertAmazonOrders,
  convertYahooOrders,
  readSheetBuffer,
} = require("../lib/shipping-labels.ts");

const normalDelivery = "\u901a\u5e38";
const mapping = {
  amazonName: "Amazon item",
  sku: "AMZ-1",
  yahooName: "Yahoo item",
  yahooItemId: "Y-1",
  labelName: "Test item",
  amazonPattern: "",
  deliveryPattern: normalDelivery,
};

const amazonText = [
  [
    "order-id",
    "sku",
    "product-name",
    "quantity-to-ship",
    "recipient-name",
    "buyer-name",
    "ship-phone-number",
    "ship-postal-code",
    "ship-state",
    "ship-city",
    "ship-address-1",
    "ship-address-2",
  ].join("\t"),
  [
    "AMZ-ORDER-1",
    "AMZ-1",
    "Amazon item",
    "1",
    "Recipient",
    "Recipient",
    "08052024639",
    "889-4301",
    "\u5bae\u5d0e\u770c",
    "\u3048\u3073\u306e\u5e02",
    "\u539f\u7530",
    "2307-8",
  ].join("\t"),
].join("\n");

const amazonRows = readSheetBuffer("amazon-orders.txt", toArrayBuffer(amazonText));
const amazonResult = convertAmazonOrders(amazonRows, [mapping], DEFAULT_SENDER_SETTINGS);
assert.equal(amazonRows[0]["ship-address-2"], "2307-8");
assert.equal(amazonResult.sagawaOrders[0].address2, "2307-8");

const yahooCsv = [
  [
    "OrderId",
    "ItemId",
    "Title",
    "QuantityDetail",
    "ShipName",
    "BillName",
    "ShipPhoneNumber",
    "ShipZipCode",
    "ShipPrefecture",
    "ShipCity",
    "ShipAddress1",
    "ShipAddress2",
  ].join(","),
  [
    "YAHOO-ORDER-1",
    "Y-1",
    "Yahoo item",
    "1",
    "Recipient",
    "Recipient",
    "08052024639",
    "889-4301",
    "\u5bae\u5d0e\u770c",
    "\u3048\u3073\u306e\u5e02",
    "\u539f\u7530",
    "5-7-63",
  ].join(","),
].join("\n");

const yahooRows = readSheetBuffer("yahoo-orders.csv", toArrayBuffer(yahooCsv));
const yahooResult = convertYahooOrders(yahooRows, [mapping], DEFAULT_SENDER_SETTINGS);
assert.equal(yahooRows[0].ShipAddress2, "5-7-63");
assert.equal(yahooResult.sagawaOrders[0].address2, "5-7-63");

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([
  ["ship-address-2"],
  [46235],
]);
worksheet.A2.z = "mmm-yy";
XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
const excelRows = readSheetBuffer(
  "amazon-orders.xlsx",
  XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
);
assert.equal(excelRows[0]["ship-address-2"], "2026-8");

console.log("Shipping label address regression tests passed.");

function toArrayBuffer(value) {
  return Uint8Array.from(Buffer.from(value, "utf8")).buffer;
}
