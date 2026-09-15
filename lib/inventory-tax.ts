import { truncateInventoryYen } from "./inventory-total";

export type InventoryTaxBasis = "excluded" | "included";
export type InventoryTaxPair = { excluded: number | null; included: number | null };
const numberOrNull = (value: unknown) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);

export function inventoryTaxUnitPrices(price: unknown, basis: InventoryTaxBasis, rate: number): InventoryTaxPair {
  const unit = numberOrNull(price);
  if (unit === null || ![0, 8, 10].includes(rate)) return { excluded: null, included: null };
  const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return { excluded: basis === "excluded" ? unit : rounded(unit * 100 / (100 + rate)), included: basis === "included" ? unit : rounded(unit * (100 + rate) / 100) };
}

// Keep fractional unit costs until multiplication. Round down each line once.
export function inventoryTaxAmounts(price: unknown, quantity: unknown, basis: InventoryTaxBasis, rate: number): InventoryTaxPair {
  const unit = numberOrNull(price), count = numberOrNull(quantity);
  if (unit === null || count === null || ![0, 8, 10].includes(rate)) return { excluded: null, included: null };
  const amount = unit * count;
  return {
    excluded: truncateInventoryYen(basis === "excluded" ? amount : amount * 100 / (100 + rate)),
    included: truncateInventoryYen(basis === "included" ? amount : amount * (100 + rate) / 100),
  };
}

export function manufacturingTaxRate(item: { item_type?: unknown; item_name?: unknown; tax_rate?: unknown }) {
  if (item.tax_rate != null && [0, 8, 10].includes(Number(item.tax_rate))) return Number(item.tax_rate);
  const name = String(item.item_name).normalize("NFKC").trim();
  return item.item_type === "material" || ["本みりん", "本料理清酒", "HEIKO OPPシート #25 100×100 無地"].includes(name) ? 10 : 8;
}

export function manufacturingInventoryTax(item: { tax_included_cost?: unknown; stock_count?: unknown; item_type?: unknown; item_name?: unknown; tax_rate?: unknown }) {
  return inventoryTaxAmounts(item.tax_included_cost, item.stock_count, "included", manufacturingTaxRate(item));
}

// The operator confirmed July wholesale sales are tax-inclusive (2026-09-15).
export function partnerInventoryTax(item: { inventory_value?: unknown; tax_rate?: unknown }) {
  return inventoryTaxAmounts(item.inventory_value, 1, "included", Number(item.tax_rate ?? 8));
}

export function warehouseInventoryTax(item: { wholesale_price?: unknown; quantity?: unknown; tax_rate?: unknown }) {
  const price = numberOrNull(item.wholesale_price), quantity = numberOrNull(item.quantity);
  return inventoryTaxAmounts(price === null ? null : Math.round(price * 100) / 100, quantity === null ? null : Math.round(quantity * 1000) / 1000, "excluded", Number(item.tax_rate ?? 8));
}

export function sumInventoryTax<T>(items: T[], calculate: (item: T) => InventoryTaxPair) {
  return items.reduce((sum, item) => {
    const amount = calculate(item);
    return { excluded: sum.excluded + (amount.excluded ?? 0), included: sum.included + (amount.included ?? 0) };
  }, { excluded: 0, included: 0 });
}
