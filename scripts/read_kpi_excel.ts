
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const SAT_FILE_PATH = 'c:/Users/ts/OneDrive/Desktop/作業用/参考用KPI.xlsx';

try {
    const workbook = XLSX.readFile(SAT_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let output = '';
    const log = (msg: string) => { output += msg + '\n'; };

    // Print Header Row (assuming Row 0 or 1 contains '8月', '9月' etc)
    log('--- Header Candidates ---');
    log('Row 0: ' + JSON.stringify(data[0]));
    log('Row 1: ' + JSON.stringify(data[1]));
    log('Row 2: ' + JSON.stringify(data[2]));

    // Find "Sales Activity"
    log('--- Sales Activity Rows ---');
    data.forEach((row: any, index: number) => {
        const rowStr = JSON.stringify(row);
        if (rowStr.includes('営業活動')) {
            log(`Row ${index} [SalesActivity Start]: ${rowStr}`);
            for (let i = 1; i <= 10; i++) {
                log(`Row ${index + i} [+${i}]: ${JSON.stringify(data[index + i])}`);
            }
        }
    });

    // Find Main Table Structure (look for channel names)
    const channels = ['通販', '卸', '会津ブランド館', '食のブランド館'];
    log('--- Main Table Structure ---');
    data.forEach((row: any, index: number) => {
        const rowStr = JSON.stringify(row);
        for (const c of channels) {
            if (rowStr.includes(c)) {
                log(`[Channel Found: ${c}] Row ${index}: ${rowStr}`);
                // Print next 5 rows to see metric structure (Target, Actual, Last Year)
                for (let i = 1; i <= 5; i++) {
                    log(`Row ${index + i} [+${i}]: ${JSON.stringify(data[index + i])}`);
                }
            }
        }
    });

    // Dump rows 19-25 to find Wholesale
    log('--- Wholesale Verification (Rows 19-25) ---');
    for (let i = 19; i <= 25; i++) {
        if (data[i]) {
            log(`Row ${i}: ${JSON.stringify(data[i])}`);
        }
    }

    // Dump rows 30-70 to find Sales Activity and Wholesale
    log('--- Rows 30-70 Dump ---');
    for (let i = 30; i < 70; i++) {
        if (data[i]) {
            log(`Row ${i}: ${JSON.stringify(data[i])}`);
        }
    }

    // Explicit search for Wholesale
    log('--- Wholesale Search ---');
    data.forEach((row: any, index: number) => {
        const rowStr = JSON.stringify(row);
        if (rowStr.includes('卸')) {
            log(`[Wholesale Found] Row ${index}: ${rowStr}`);
        }
    });

    fs.writeFileSync('analysis_output_debug.txt', output);
    console.log('Analysis written to analysis_output_debug.txt');

} catch (error) {
    console.error(error);
}
