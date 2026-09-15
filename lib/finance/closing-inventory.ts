import { brandStoreInventoryPrice } from "../brand-store-inventory-price";
import { truncateInventoryYen } from "../inventory-total";
import { recalculateInventory, inventoryFormulaErrors, type InventoryWorkbook } from "../food-store-inventory";
import { inventoryTaxAmounts, inventoryTaxUnitPrices, manufacturingInventoryTax, manufacturingTaxRate, warehouseInventoryTax, partnerInventoryTax } from "../inventory-tax";
import { foodSheetTax, foodTaxExportRows } from "../food-store-inventory-tax";

export type SourceKey = "brand" | "manufacturing" | "warehouse" | "partner" | "food";
export const inventorySources = [
  { key: "brand", label: "ブランド館店舗分析", table: "brand_store_inventory_counts", items: "brand_store_inventory_items", href: "/brand-store-analysis/inventory" },
  { key: "manufacturing", label: "レシピシステム", table: "manufacturing_inventory_counts", items: "manufacturing_inventory_items", href: "/recipe/inventory" },
  { key: "warehouse", label: "卸販売管理システム", table: "wholesale_inventory_counts", items: "wholesale_inventory_items", href: "/wholesale/inventory" },
  { key: "partner", label: "卸販売管理システム", table: "wholesale_partner_inventory_counts", items: "wholesale_partner_inventory_items", href: "/wholesale/inventory/other-stores" },
  { key: "food", label: "食のブランド館分析", table: "food_store_closing_inventories", items: null, href: "/food-store-analysis/inventory" },
] as const;
export type InventoryHeader = { id: string; fiscal_year: number; inventory_date: string; status: string };
export type SourceData = { inventory: InventoryHeader | null; items: Record<string, unknown>[]; workbook?: InventoryWorkbook };
export type ExportCell = string | number | boolean | null;
export type ClosingInventoryRow = {
  key: string; system: string; label: string; basis: string; date: string | null;
  status: string; amount: number | null; amountExcluded: number | null; amountIncluded: number | null; itemCount: number; pendingCount: number;
  warning: string; href: string; details: ExportCell[][];
};
export type ClosingInventoryReport = {
  fiscalYear: number; years: number[]; fetchedAt: string; rows: ClosingInventoryRow[];
  total: number; totalExcluded: number; totalIncluded: number; hasIncomplete: boolean;
};

const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const text = (value: unknown) => String(value ?? "");

export function summarizeInventorySource(key: SourceKey, source: SourceData): ClosingInventoryRow[] {
  const config = inventorySources.find(s => s.key === key)!;
  const header = source.inventory;
  const base = (label: string, basis: string): ClosingInventoryRow => ({
    key: `${key}-${label}`, label, system: config.label, basis,
    date: header?.inventory_date ?? null, status: header?.status ?? "missing",
    amount: header ? 0 : null, amountExcluded: header ? 0 : null, amountIncluded: header ? 0 : null, itemCount: 0, pendingCount: 0, warning: "", details: [],
    href: config.href + (header ? `?id=${encodeURIComponent(header.id)}&fiscalYear=${header.fiscal_year}` : ""),
  });
  if (key === "food") {
    if (!header || !source.workbook) return [base("決算棚卸し", "元シートの金額")];
    const workbook = recalculateInventory(source.workbook, true);
    const summary = workbook.sheets.find(s => s.name === "合計");
    const errors = inventoryFormulaErrors(workbook);
    return workbook.sheets.filter(s => s.name !== "合計").map(sheet => {
      const row = base(sheet.name, "税込（元シート合計）");
      const matches = summary ? Object.entries(summary.cells).filter(([address, cell]) => /^A\d+$/.test(address) && cell.value === sheet.name) : [];
      const amount = matches.length === 1 ? summary?.cells[matches[0][0].replace(/^A/, "B")]?.value : null;
      row.amount = typeof amount === "number" && Number.isFinite(amount) ? truncateInventoryYen(amount) : null;
      row.warning = errors.length ? "元シートに数式エラーがあります" : row.amount === null ? "合計シートとの対応を確認してください" : "";
      if (row.warning) row.amount = null;
      const tax = foodSheetTax(sheet);
      row.amountExcluded = !row.warning ? tax?.totals.excluded ?? null : null;
      row.amountIncluded = !row.warning ? tax?.totals.included ?? null : null;
      if (!tax) row.warning = "元シートの税率・税別合計を確認してください";
      row.basis = tax ? `元Excel・税率${tax.rate}%（シート合計で換算）` : "税率未確認";
      row.details = foodTaxExportRows(workbook, sheet);
      row.itemCount = Object.keys(sheet.cells).filter(a => /^A\d+$/.test(a) && Number(a.slice(1)) > 2 && sheet.cells[a].value).length;
      return row;
    });
  }
  const groups = key === "manufacturing" ? ["ingredient", "material"] : [key];
  return groups.map(group => {
    const label = key === "brand" ? "店舗商品" : key === "warehouse" ? "倉庫在庫" : key === "partner" ? "他店在庫" : group === "ingredient" ? "製造・食材" : "製造・資材";
    const basis = key === "manufacturing" ? "税込原価から税別換算" : key === "partner" ? "7月実売単価（税込）×7掛・税率8%" : "税別原価から税込換算";
    const row = base(label, basis);
    const items = source.items.filter(item => (key !== "manufacturing" || item.item_type === group) && (key !== "warehouse" || item.review_status !== "excluded"));
    row.details = [["商品・食材・資材名", "単価（税別）", "単価（税込）", "税率（%）", "数量", "棚卸金額（税別）", "棚卸金額（税込）", "確認", "備考"]];
    row.itemCount = items.length;
    for (const item of items) {
      const price = key === "brand" ? brandStoreInventoryPrice(item.selling_price) : numeric(key === "manufacturing" ? item.tax_included_cost : key === "partner" ? item.cost_unit : item.wholesale_price);
      let quantity = numeric(key === "manufacturing" ? item.stock_count : key === "partner" ? item.inventory_quantity : item.quantity);
      if (key === "brand" && quantity !== null && !Number.isInteger(quantity)) quantity = null;
      const pending = price === null || quantity === null || (key === "warehouse" && item.review_status === "needs_review");
      if (pending) row.pendingCount++;
      let amount: number | null = null;
      if (price !== null && quantity !== null) {
        // Match each owning screen, including the warehouse's cents/thousandths normalization.
        amount = key === "partner" ? numeric(item.inventory_value) : key === "warehouse" ? Math.round(price * 100) * Math.round(quantity * 1000) / 100_000 : price * quantity;
        if (amount !== null) amount = truncateInventoryYen(amount);
      }
      if (amount === null && !pending) row.pendingCount++;
      row.amount = (row.amount ?? 0) + (amount ?? 0);
      const rate = key === "manufacturing" ? manufacturingTaxRate(item) : Number(item.tax_rate ?? 8);
      const tax = key === "manufacturing" ? manufacturingInventoryTax(item) : key === "partner" ? partnerInventoryTax(item) : key === "warehouse" ? warehouseInventoryTax(item) : inventoryTaxAmounts(price, quantity, "excluded", rate);
      const unit = inventoryTaxUnitPrices(price, key === "manufacturing" || key === "partner" ? "included" : "excluded", rate);
      row.amountExcluded = (row.amountExcluded ?? 0) + (tax.excluded ?? 0);
      row.amountIncluded = (row.amountIncluded ?? 0) + (tax.included ?? 0);
      row.details.push([text(item.product_name ?? item.item_name), unit.excluded, unit.included, rate, quantity, tax.excluded, tax.included, pending || amount === null ? "未入力・要確認" : "入力済み", text(item.note)]);
    }
    if (row.pendingCount) row.warning = `${row.pendingCount}件が未入力・要確認（入力済み金額の小計）`;
    return row;
  });
}

export function buildClosingInventoryReport(fiscalYear: number, years: number[], sources: Record<SourceKey, SourceData>): ClosingInventoryReport {
  const rows = inventorySources.flatMap(source => summarizeInventorySource(source.key, sources[source.key]));
  return { fiscalYear, years, fetchedAt: new Date().toISOString(), rows,
    total: rows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
    totalExcluded: rows.reduce((sum, row) => sum + (row.amountExcluded ?? 0), 0),
    totalIncluded: rows.reduce((sum, row) => sum + (row.amountIncluded ?? 0), 0),
    hasIncomplete: rows.some(row => row.status !== "completed" || row.pendingCount > 0 || row.amount === null || !!row.warning),
  };
}
