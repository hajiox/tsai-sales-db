
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RECIPE_DIR = 'C:/Users/ts/OneDrive/Desktop/作業用/レシピ';

async function main() {
    let log = '';
    const print = (msg: string) => { console.log(msg); log += msg + '\n'; };

    const filePath = path.join(RECIPE_DIR, '【重要】【製造】総合管理（新型）ネット専用.xlsx');
    print(`Reading: ${filePath}`);
    const workbook = XLSX.readFile(filePath);

    print(`All sheets: ${workbook.SheetNames.join(', ')}`);
    const matchingSheets = workbook.SheetNames.filter(s => s.includes('トマト'));
    print(`Matching sheets: ${matchingSheets.join(', ')}`);

    const sheetName = '【OB】トマト味噌';
    print(`Sheet: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
        print('Sheet not found');
        fs.writeFileSync('debug_tomato_miso_detailed.txt', log);
        return;
    }

    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as any[][];

    // Hardcoded check based on diagnose output
    // Row 42 (index 41) should be "製造手順メモ"
    // Row 43 (index 42) should be the content

    print(`Checking Row 42 (Index 41):`);
    if (json[41]) {
        print(`JSON[41] length: ${json[41].length}`);
        print(`JSON[41][5]: "${json[41][5]}"`);
    } else {
        print(`JSON[41] is undefined`);
    }

    print(`Checking Row 43 (Index 42):`);
    if (json[42]) {
        print(`JSON[42] length: ${json[42].length}`);
        print(`JSON[42] content: ${JSON.stringify(json[42])}`);
    } else {
        print(`JSON[42] is undefined`);
    }

    print(`Checking Row 44 (Index 43):`);
    if (json[43]) {
        print(`JSON[43] length: ${json[43].length}`);
        print(`JSON[43] content: ${JSON.stringify(json[43])}`);
    }

    print('\n--- Searching ENTIRE WORKBOOK for "ラード" ---');
    for (const sName of workbook.SheetNames) {
        const s = workbook.Sheets[sName];
        const j = XLSX.utils.sheet_to_json(s, { header: 1 }) as any[][];
        for (let r = 0; r < j.length; r++) {
            const row = j[r];
            for (let c = 0; c < row.length; c++) {
                if (String(row[c]).includes('ラード')) {
                    print(`Found "ラード" in [${sName}] at Row ${r + 1}, Col ${c}`);
                    print(`Value: "${row[c]}"`);
                }
            }
        }
    }

    fs.writeFileSync('debug_tomato_miso_detailed.txt', log);
}

main();
