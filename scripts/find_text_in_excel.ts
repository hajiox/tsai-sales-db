
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const RECIPE_DIR = 'C:/Users/ts/OneDrive/Desktop/作業用/レシピ';

function search() {
    const files = fs.readdirSync(RECIPE_DIR).filter(f => f.endsWith('.xlsx'));
    console.log(`Searching ${files.length} files for "1回仕込み量"...`);

    for (const file of files) {
        const wb = XLSX.readFile(path.join(RECIPE_DIR, file));
        for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
            for (let r = 0; r < json.length; r++) {
                const row = json[r];
                for (let c = 0; c < row.length; c++) {
                    const val = String(row[c]);
                    if (val.includes('1回仕込み量') || val.includes('１回仕込み量')) {
                        console.log(`FOUND in File: ${file}`);
                        console.log(`Sheet: ${sheetName}`);
                        console.log(`Row ${r + 1}, Col ${c}: ${val}`);
                        return;
                    }
                }
            }
        }
    }
    console.log('Not found in any file.');
}

search();
