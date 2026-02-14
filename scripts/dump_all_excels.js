
const XLSX = require('xlsx');
const fs = require('fs');

const filePaths = [
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）自社.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）Shopee台湾.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）OEM.xlsx'
];

function main() {
    filePaths.forEach(fp => {
        if (!fs.existsSync(fp)) {
            console.error("File not found:", fp);
            return;
        }

        console.log(`\nScanning file: ${fp}`);
        const workbook = XLSX.readFile(fp);
        const sheets = workbook.SheetNames;
        console.log(`Total sheets: ${sheets.length}`);

        // Find sheet matching "極太麺"
        const target = sheets.find(s => s.includes('極太麺'));
        if (target) {
            console.log(`** FOUND TARGET SHEET: ${target} **`);
            dumpSheet(workbook.Sheets[target]);
        }
    });
}

function dumpSheet(sheet) {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("Sheet structure example (first 10 rows):");
    for (let i = 0; i < 10; i++) {
        console.log(`Row ${i}: ${JSON.stringify(data[i])}`);
    }

    // Find item rows
    // Usually items start around row 5
    console.log("\nItems attempt:");
    for (let i = 5; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        // Col C (index 2) is usually name
        const name = row[2];
        if (name && typeof name === 'string' && name !== '空白' && !name.startsWith('小計') && !name.startsWith('原価計')) {
            // Col G (index 6): Usage per unit (1本使用量 or similar)
            // Col E (index 4): Unit price
            console.log(`Row ${i}: Name="${name}", Usage=${row[6]}, UnitPrice=${row[4]}`);
        }
    }
}

main();
