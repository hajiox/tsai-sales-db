export type InventoryCell = { value: string | number | boolean | null; formula?: string; format?: string };
export type InventorySheet = { name: string; rows: number; cols: number; cells: Record<string, InventoryCell> };
export type InventoryWorkbook = { sheets: InventorySheet[] };

export function validateInventoryWorkbook(input: unknown): asserts input is InventoryWorkbook {
  const book = input as InventoryWorkbook;
  if (!book || !Array.isArray(book.sheets) || !book.sheets.length || book.sheets.length > 30) throw new Error("シート構成が不正です");
  const names = new Set<string>();
  for (const sheet of book.sheets) {
    if (typeof sheet.name !== "string" || !sheet.name || sheet.name.length > 31 || names.has(sheet.name)) throw new Error("シート名が不正です");
    names.add(sheet.name);
    if (!Number.isInteger(sheet.rows) || sheet.rows < 1 || sheet.rows > 1000 || !Number.isInteger(sheet.cols) || sheet.cols < 1 || sheet.cols > 26) throw new Error("シートの行列数が上限を超えています");
    if (!sheet.cells || typeof sheet.cells !== "object" || Array.isArray(sheet.cells) || Object.keys(sheet.cells).length > 26000) throw new Error("セル構成が不正です");
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const match = /^([A-Z])([1-9]\d*)$/.exec(address);
      if (!match || match[1].charCodeAt(0) - 64 > sheet.cols || Number(match[2]) > sheet.rows || !cell) throw new Error("セル位置が不正です");
      if (cell.value !== null && !["string", "number", "boolean"].includes(typeof cell.value)) throw new Error("セル値が不正です");
      if (typeof cell.value === "number" && !Number.isFinite(cell.value)) throw new Error("数値が不正です");
      if (typeof cell.value === "string" && cell.value.length > 5000) throw new Error("セルの文字数が上限を超えています");
      if (cell.formula !== undefined && (typeof cell.formula !== "string" || cell.formula.length > 500)) throw new Error("計算式が不正です");
      if (cell.format !== undefined && (typeof cell.format !== "string" || cell.format.length > 200)) throw new Error("表示形式が不正です");
    }
  }
}

// The supplied workbook uses references, multiplication and SUM only. No eval or external links.
export function recalculateInventory(input: InventoryWorkbook): InventoryWorkbook {
  validateInventoryWorkbook(input);
  const book = structuredClone(input);
  const completed = new Set<string>();
  const active = new Set<string>();
  function read(sheet: InventorySheet, address: string): InventoryCell["value"] {
    const cell = sheet.cells[address];
    if (!cell) return null;
    const key = `${sheet.name}!${address}`;
    if (!cell.formula || completed.has(key)) return cell.value;
    if (active.has(key)) return "#REF!";
    active.add(key);
    const formula = cell.formula.replace(/^=/, "");
    const ref = (text: string): InventoryCell["value"] => {
      const match = /^(?:(?:'((?:[^']|'')+)'|([^!]+))!)?\$?([A-Z])\$?([1-9]\d*)$/.exec(text.trim());
      if (!match) return "#NAME?";
      const name = match[1]?.replace(/''/g, "'") || match[2];
      const target = name ? book.sheets.find(s => s.name === name) : sheet;
      return target ? read(target, match[3] + match[4]) : "#REF!";
    };
    let result: InventoryCell["value"];
    const sum = /^SUM\(\$?([A-Z])\$?(\d+):\$?([A-Z])\$?(\d+)\)$/i.exec(formula);
    const product = /^(\$?[A-Z]\$?[1-9]\d*)\*(\$?[A-Z]\$?[1-9]\d*|\d+(?:\.\d+)?)$/.exec(formula);
    if (formula.includes("#REF!")) result = "#REF!";
    else if (sum && Number(sum[2]) >= 1 && Number(sum[4]) <= 1000 && Number(sum[2]) <= Number(sum[4]) && sum[1] <= sum[3]) {
      result = 0;
      for (let col = sum[1].charCodeAt(0); col <= sum[3].charCodeAt(0); col++) {
        for (let row = Number(sum[2]); row <= Number(sum[4]); row++) {
          const value = read(sheet, String.fromCharCode(col) + row);
          if (typeof value === "string" && value.startsWith("#")) { result = value; break; }
          if (typeof value === "number") result = Number(result) + value;
        }
        if (typeof result === "string") break;
      }
    } else if (product) {
      const left = ref(product[1]);
      const right = /^\d/.test(product[2]) ? Number(product[2]) : ref(product[2]);
      const error = [left, right].find(v => typeof v === "string" && v.startsWith("#"));
      result = error ?? ((left === null || typeof left === "number") && (right === null || typeof right === "number") ? Number(left) * Number(right) : "#VALUE!");
    } else result = ref(formula);
    cell.value = result;
    active.delete(key);
    completed.add(key);
    return result;
  }
  for (const sheet of book.sheets) for (const address of Object.keys(sheet.cells)) read(sheet, address);
  return book;
}

export function inventoryFormulaErrors(book: InventoryWorkbook) {
  return book.sheets.flatMap(sheet => Object.entries(sheet.cells)
    .filter(([, cell]) => typeof cell.value === "string" && /^#(REF!|VALUE!|NAME\?|DIV\/0!|N\/A|NUM!|NULL!)/.test(cell.value))
    .map(([address, cell]) => ({ sheet: sheet.name, address, error: String(cell.value) })));
}
