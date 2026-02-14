
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = 'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx';

function main() {
    if (!fs.existsSync(filePath)) {
        console.error("File not found:", filePath);
        return;
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = '【商品】極太麺焼きそば＆ソース4食';

    if (!workbook.Sheets[sheetName]) {
        console.error("Sheet not found:", sheetName);
        console.log("Available sheets:", workbook.SheetNames.slice(0, 5));
        return;
    }

    const sheet = workbook.Sheets[sheetName];
    // Convert to JSON with array of arrays to inspect layout
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log("Sheet Data Preview (first 20 rows):");
    data.slice(0, 20).forEach((row, idx) => {
        console.log(`${idx}: ${JSON.stringify(row)}`);
    });

    // Check specific columns for items
    console.log("\nItems extraction test:");
    // Assuming row 5 (index 4) is header, data starts from row 6 (index 5)
    for (let i = 5; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Col C (index 2): Material Name
        const name = row[2];
        if (!name || name === '空白' || name === '小計' || name === '原価計' || name === '売価' || name === '粗利益') continue;

        // Col G (index 6): Usage per unit (1本使用量)
        const usage = row[6];
        // Col E (index 4): Unit Price (単価)
        const unitPrice = row[4];

        console.log(`Row ${i}: Name="${name}", Usage=${usage}, UnitPrice=${unitPrice}`);
    }
}

main();
