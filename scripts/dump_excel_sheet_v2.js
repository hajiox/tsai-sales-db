
const XLSX = require('xlsx');
const fs = require('fs');

const filePaths = [
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx',
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

        // Find sheet matching "極太麺"
        const target = sheets.find(s => s.includes('極太麺'));
        if (target) {
            console.log(`** FOUND TARGET SHEET: ${target} **`);
            const sheet = workbook.Sheets[target];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            console.log("Sheet rows 50-70 dump:");
            for (let i = 50; i < 70 && i < data.length; i++) {
                if (data[i]) console.log(`Row ${i}: ${JSON.stringify(data[i])}`);
            }
        }
    });
}

main();
