// scripts/analyze-recipe-sheet.ts
// レシピシートの列構造を分析

import * as XLSX from "xlsx";

const filePath = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx";
const wb = XLSX.readFile(filePath);

// 具体的なシートを確認
const sheetNames = wb.SheetNames.slice(0, 15);
console.log("First 15 sheets:", sheetNames);

// パーフェクトラーメン系を探す
const perfectSheets = wb.SheetNames.filter(n => n.includes('パーフェクト'));
console.log("\nPerfect sheets:", perfectSheets.slice(0, 3));

if (perfectSheets.length > 0) {
    const sheetName = perfectSheets[0];
    console.log("\n=== Sheet:", sheetName, "===\n");

    const sheet = wb.Sheets[sheetName];

    for (let r = 0; r <= 25; r++) {
        const row: string[] = [];
        for (let c = 0; c <= 9; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            let val = "";
            if (cell) {
                val = String(cell.v).replace(/\n/g, " ").substring(0, 10);
            }
            row.push(`${val.padEnd(10)}`);
        }
        console.log(`R${String(r).padStart(2)}: ${row.join(" ")}`);
    }
}
