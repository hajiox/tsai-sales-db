export const BRAND_STORE_INVENTORY_PRICE_RATE = 0.7;

export function brandStoreInventoryPrice(sellingPrice: unknown): number | null {
  if (sellingPrice === null || sellingPrice === undefined || sellingPrice === "") return null;
  const price = Number(sellingPrice);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price * BRAND_STORE_INVENTORY_PRICE_RATE * 100) / 100;
}
