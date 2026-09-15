import * as XLSX from "xlsx";
import { validateInventoryWorkbook, type InventoryWorkbook, type InventoryCell } from "./food-store-inventory";

export function parseInventoryExcel(buffer: Buffer): InventoryWorkbook {
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Excelは5MB以内で指定してください");
  const source = XLSX.read(buffer, { type: "buffer", cellFormula: true, cellNF: true, sheetRows: 1001 });
  const book: InventoryWorkbook = { sheets: source.SheetNames.map(name => {
    const sheet = source.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
    if (range.e.r >= 1000 || range.e.c >= 26) throw new Error("Excelは各シート1000行・26列以内で指定してください");
    const cells: Record<string, InventoryCell> = {};
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!") || !cell || (cell.v === undefined && !cell.f)) continue;
      const value = cell.t === "e" ? cell.w || "#REF!" : cell.v ?? null;
      cells[address] = { value, ...(cell.f ? { formula: `=${cell.f}` } : {}), ...(cell.z ? { format: cell.z } : {}) };
    }
    return { name, rows: range.e.r + 1, cols: range.e.c + 1, cells };
  }) };
  validateInventoryWorkbook(book);
  return book;
}
