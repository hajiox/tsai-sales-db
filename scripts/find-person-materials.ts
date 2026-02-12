// scripts/find-person-materials.ts
// Excelシートの資材セクションで人名行を確認する

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";
const filePath = path.join(RECIPE_DIR, "【重要】【製造】総合管理（新型）ネット専用.xlsx");

const wb = XLSX.readFile(filePath);

// 1つのレシピシートの資材セクション（F列がMATERIAL_KEYWORDSにマッチする行）付近を全行見る
const sheet = wb.Sheets["【商品】パーフェクトラーメン【S】BUTA1食"];
if (!sheet) {
    console.log("Sheet not found");
    process.exit(1);
}

const range = XLSX.utils.decode_range(sheet["!ref"]!);

console.log("=== Full sheet rows (columns A-H) ===\n");
for (let r = 0; r <= Math.min(range.e.r, 55); r++) {
    const row: string[] = [];
    for (let c = 0; c <= 7; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const val = cell ? String(cell.v).substring(0, 20) : "";
        row.push(val.padEnd(20));
    }
    console.log(`Row ${String(r).padStart(2)}: ${row.join(" | ")}`);
}
