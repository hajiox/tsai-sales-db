// scripts/analyze-excel.ts
// Excelファイルの構造を分析

import * as XLSX from "xlsx";

const filePath = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx";

const workbook = XLSX.readFile(filePath);

console.log("=== Excel Structure Analysis ===\n");
console.log(`Sheets (${workbook.SheetNames.length}):`);
workbook.SheetNames.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));

// 最初のシートの構造を詳細に見る
const firstSheet = workbook.SheetNames[0];
const sheet = workbook.Sheets[firstSheet];

console.log(`\n=== First Sheet: ${firstSheet} ===`);
console.log(`Range: ${sheet['!ref']}`);

// 最初の20行x15列を表示
console.log("\nCell Contents (first 20 rows, 15 cols):\n");
for (let row = 0; row < 20; row++) {
    let rowContent = [];
    for (let col = 0; col < 15; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        const value = cell ? String(cell.v).substring(0, 12) : "";
        rowContent.push(value.padEnd(12));
    }
    console.log(`Row ${row + 1}: ${rowContent.join(" | ")}`);
}

// データベースシートがあるか確認
const dbSheet = workbook.SheetNames.find(n => n.includes("データベース") || n.includes("材料"));
if (dbSheet) {
    console.log(`\n=== Database Sheet: ${dbSheet} ===`);
    const db = workbook.Sheets[dbSheet];
    console.log(`Range: ${db['!ref']}`);

    // ヘッダー行を表示
    const range = XLSX.utils.decode_range(db['!ref'] || 'A1');
    console.log("\nHeaders:");
    for (let row = 0; row < 3; row++) {
        let rowContent = [];
        for (let col = 0; col <= Math.min(range.e.c, 15); col++) {
            const cell = db[XLSX.utils.encode_cell({ r: row, c: col })];
            const value = cell ? String(cell.v).substring(0, 15) : "";
            rowContent.push(value);
        }
        console.log(`Row ${row + 1}: ${rowContent.join(" | ")}`);
    }
}
