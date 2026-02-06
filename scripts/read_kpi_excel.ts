
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

    // Find Manufacturing
    log('--- Manufacturing Rows ---');
    data.forEach((row: any, index: number) => {
        const rowStr = JSON.stringify(row);
        if (rowStr.includes('商品製造')) {
            log(`Row ${index} [Index]: ${rowStr}`);
            // Print next few rows
            for (let i = 1; i <= 5; i++) {
                log(`Row ${index + i} [+${i}]: ${JSON.stringify(data[index + i])}`);
            }
        }
        // Find Sales Activity if present
        if (rowStr.includes('営業活動') || rowStr.includes('獲得')) {
            log(`Row ${index} [SalesActivity]: ${rowStr}`);
            for (let i = 1; i <= 3; i++) {
                log(`Row ${index + i} [+${i}]: ${JSON.stringify(data[index + i])}`);
            }
        }
    });

    fs.writeFileSync('analysis_output.txt', output);
    console.log('Analysis written to analysis_output.txt');

} catch (error) {
    console.error(error);
}
