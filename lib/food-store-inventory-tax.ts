import type { InventoryWorkbook, InventorySheet } from "./food-store-inventory";
import { inventoryTaxAmounts, type InventoryTaxPair } from "./inventory-tax";

// Derive the tax contract from the imported tax-total formula, never from a sheet's name.
export function foodSheetTax(sheet: InventorySheet) {
  for (const [address, cell] of Object.entries(sheet.cells)) {
    const formula = (cell.formula ?? "").replace(/^=/, "").replace(/^ROUNDDOWN\((.*),\s*0\)$/i, "$1");
    const match = /^([A-Z]\d+)\*(1\.08|1\.1|1\.10)$/.exec(formula);
    if (!match || !/税込/.test(String(sheet.cells[`E${address.slice(1)}`]?.value))) continue;
    const rate = Math.round((Number(match[2]) - 1) * 100);
    const excluded = sheet.cells[match[1]]?.value, included = cell.value;
    return { rate, totalRow: Number(match[1].slice(1)), includedRow: Number(address.slice(1)),
      totals: { excluded: typeof excluded === "number" ? excluded : null, included: typeof included === "number" ? included : null } as InventoryTaxPair };
  }
  return null;
}

export function foodRowTax(book: InventoryWorkbook, sheet: InventorySheet, row: number): InventoryTaxPair {
  if (sheet.name === "合計") {
    const label = sheet.cells[`A${row}`]?.value;
    if (label === "合計") {
      const totals = book.sheets.filter(s => s.name !== "合計").map(s => foodSheetTax(s)?.totals);
      return totals.every(t => t?.excluded != null && t.included != null) ? {
        excluded: totals.reduce((sum, t) => sum + t!.excluded!, 0), included: totals.reduce((sum, t) => sum + t!.included!, 0),
      } : { excluded: null, included: null };
    }
    const target = book.sheets.find(s => s.name === label);
    return target ? foodSheetTax(target)?.totals ?? { excluded: null, included: null } : { excluded: null, included: null };
  }
  const tax = foodSheetTax(sheet);
  if (!tax) return { excluded: null, included: null };
  if (row === tax.totalRow || row === tax.includedRow) return tax.totals;
  return row < tax.totalRow && typeof sheet.cells[`D${row}`]?.value === "number"
    ? inventoryTaxAmounts(sheet.cells[`D${row}`].value, 1, "excluded", tax.rate)
    : { excluded: null, included: null };
}

// Appended columns preserve all original editable addresses and formulas.
export function foodTaxExportRows(book: InventoryWorkbook, sheet: InventorySheet) {
  return Array.from({ length: sheet.rows }, (_, i) => {
    const original = Array.from({ length: sheet.cols }, (_, j) => sheet.cells[`${String.fromCharCode(65 + j)}${i + 1}`]?.value ?? null);
    const tax = foodRowTax(book, sheet, i + 1);
    return [...original, ...(i === 0 ? ["棚卸金額（税別）", "棚卸金額（税込）"] : [tax.excluded, tax.included])];
  });
}
