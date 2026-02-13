
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const RECIPE_DIR = 'C:/Users/ts/OneDrive/Desktop/作業用/レシピ';
const OUTPUT_FILE = 'C:/Users/ts/OneDrive/Desktop/作業用/tsai-sales-db/scripts/recipe_analysis_output.txt';

function analyzeFile(filePath) {
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(1);

    const workbook = XLSX.readFile(filePath);

    const sheets = workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

        const rowCount = range.e.r - range.s.r + 1;
        const colCount = range.e.c - range.s.c + 1;

        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        let headerRowIdx = 0;
        let headers = [];
        for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i];
            const nonEmpty = row?.filter(c => c !== '').length || 0;
            if (nonEmpty >= 3) {
                headers = row.map(cell => String(cell || ''));
                headerRowIdx = i;
                break;
            }
        }

        const sampleData = jsonData.slice(0, 30);

        return {
            name: sheetName,
            rowCount,
            colCount,
            headers,
            sampleData
        };
    });

    return {
        fileName,
        sheets
    };
}

function run() {
    const files = fs.readdirSync(RECIPE_DIR).filter(f => f.endsWith('.xlsx'));
    let out = "";

    for (const f of files) {
        const analysis = analyzeFile(path.join(RECIPE_DIR, f));
        out += `\nFILE: ${analysis.fileName}\n`;
        analysis.sheets.forEach(s => {
            out += `  SHEET: ${s.name}\n`;
            out += `    HEADERS: ${s.headers.join(' | ')}\n`;
            // Look for keywords
            const keywords = ['製造', 'メモ', '充填', '量', '保存', '冷凍', '冷蔵', '開発'];
            s.headers.forEach((h, i) => {
                if (keywords.some(k => h.includes(k))) {
                    out += `    FOUND KEYWORD [${h}] at index ${i}\n`;
                }
            });
            // Show more data rows
            s.sampleData.slice(0, 10).forEach((row, ri) => {
                out += `    ROW ${ri}: ${row.slice(0, 10).join(' | ')}\n`;
            });
        });
    }

    fs.writeFileSync(OUTPUT_FILE, out);
}

run();
