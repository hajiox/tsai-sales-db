export const WHOLESALE_PARTNER_INVENTORY_RATE = 1 / 3;
export const WHOLESALE_PARTNER_COST_RATE = 0.7;

export type WholesaleSaleSource = {
  product_id: string;
  quantity: number | string | null;
  unit_price: number | string | null;
  amount: number | string | null;
};

export type WholesaleProductSource = {
  id: string;
  product_code?: string | null;
  product_name: string;
  product_type?: string | null;
};

export type WholesalePartnerInventoryItem = {
  product_id: string;
  product_code: string;
  product_name: string;
  sold_quantity: number;
  sales_amount: number;
  average_selling_price: number;
  inventory_quantity: number;
  cost_rate: number;
  cost_unit: number;
  inventory_value: number;
  sort_order: number;
};

export function isRegularWholesaleProduct(product: WholesaleProductSource) {
  return !String(product.product_type || "").trim().toUpperCase().includes("OEM");
}

export function buildWholesalePartnerInventory(
  products: WholesaleProductSource[],
  sales: WholesaleSaleSource[],
): WholesalePartnerInventoryItem[] {
  const productMap = new Map(
    products.filter(isRegularWholesaleProduct).map((product) => [product.id, product]),
  );
  const totals = new Map<string, { quantity: number; amount: number }>();

  for (const sale of sales) {
    if (!productMap.has(sale.product_id)) continue;
    const quantity = finiteNumber(sale.quantity);
    if (quantity === null || quantity === 0) continue;

    const unitPrice = finiteNumber(sale.unit_price);
    const storedAmount = finiteNumber(sale.amount);
    const amount = unitPrice === null
      ? storedAmount
      : quantity * unitPrice;
    if (amount === null) continue;

    const current = totals.get(sale.product_id) || { quantity: 0, amount: 0 };
    current.quantity += quantity;
    current.amount += amount;
    totals.set(sale.product_id, current);
  }

  const provisional = Array.from(totals.entries())
    .flatMap(([productId, total]) => {
      const product = productMap.get(productId);
      if (!product || total.quantity <= 0 || total.amount < 0) return [];

      const averageSellingPrice = round(total.amount / total.quantity, 0);
      const costUnit = round(
        averageSellingPrice * WHOLESALE_PARTNER_COST_RATE,
        0,
      );

      return [{
        product_id: product.id,
        product_code: String(product.product_code || ""),
        product_name: product.product_name,
        sold_quantity: round(total.quantity, 6),
        sales_amount: round(total.amount, 2),
        average_selling_price: averageSellingPrice,
        exact_inventory_quantity: total.quantity * WHOLESALE_PARTNER_INVENTORY_RATE,
        cost_rate: WHOLESALE_PARTNER_COST_RATE,
        cost_unit: costUnit,
      }];
    });

  const roundedTotalQuantity = round(
    provisional.reduce((sum, item) => sum + item.exact_inventory_quantity, 0),
    0,
  );
  const flooredTotalQuantity = provisional.reduce(
    (sum, item) => sum + Math.floor(item.exact_inventory_quantity),
    0,
  );
  const allocationCount = Math.max(
    0,
    Math.min(provisional.length, roundedTotalQuantity - flooredTotalQuantity),
  );
  const allocatedProductIds = new Set(
    provisional
      .map((item) => ({
        productId: item.product_id,
        remainder: item.exact_inventory_quantity
          - Math.floor(item.exact_inventory_quantity),
        soldQuantity: item.sold_quantity,
      }))
      .sort((left, right) => (
        right.remainder - left.remainder
        || right.soldQuantity - left.soldQuantity
        || left.productId.localeCompare(right.productId)
      ))
      .slice(0, allocationCount)
      .map((item) => item.productId),
  );

  const result: WholesalePartnerInventoryItem[] = provisional
    .map((item) => {
      const inventoryQuantity = Math.floor(item.exact_inventory_quantity)
        + (allocatedProductIds.has(item.product_id) ? 1 : 0);
      return {
        product_id: item.product_id,
        product_code: item.product_code,
        product_name: item.product_name,
        sold_quantity: item.sold_quantity,
        sales_amount: item.sales_amount,
        average_selling_price: item.average_selling_price,
        inventory_quantity: inventoryQuantity,
        cost_rate: item.cost_rate,
        cost_unit: item.cost_unit,
        inventory_value: inventoryQuantity * item.cost_unit,
        sort_order: 0,
      };
    })
    .sort((left, right) => (
      right.sold_quantity - left.sold_quantity
      || left.product_name.localeCompare(right.product_name, "ja")
    ));

  return result.map((item, index) => ({ ...item, sort_order: index }));
}

function finiteNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
