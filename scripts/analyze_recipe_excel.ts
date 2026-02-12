/**
 * Recipe Excel File Analyzer
 * Analyzes the structure and content of the 4 recipe Excel files
 * Output saved to file for complete review
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const RECIPE_DIR = 'C:/Users/ts/OneDrive/Desktop/作業用/レシピ';
const OUTPUT_FILE = 'C:/Users/ts/OneDrive/Desktop/作業用/tsai-sales-db/scripts/recipe_analysis_output.txt';

interface SheetInfo {
    name: string;
    rowCount: number;
    colCount: number;
    headers: string[];
    sampleData: any[][];
    mergedCells?: string[];
    columnAnalysis: { index: number; header: string; sampleValues: string[] }[];
}

interface FileAnalysis {
    fileName: string;
    fileSize: string;
    sheetCount: number;
    sheets: SheetInfo[];
}

function analyzeFile(filePath: string): FileAnalysis {
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(1);

    const workbook = XLSX.readFile(filePath);

    const sheets: SheetInfo[] = workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

        const rowCount = range.e.r - range.s.r + 1;
        const colCount = range.e.c - range.s.c + 1;

        // Get data as JSON
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

        // Extract headers (look for first meaningful row)
        let headerRowIdx = 0;
        let headers: string[] = [];
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            const row = jsonData[i];
            const nonEmpty = row?.filter((c: any) => c !== '').length || 0;
            if (nonEmpty >= 3) {
                headers = row.map((cell: any) => String(cell || ''));
                headerRowIdx = i;
                break;
            }
        }

        // Sample data (first 20 rows)
        const sampleData = jsonData.slice(0, 25);

        // Column analysis
        const columnAnalysis: { index: number; header: string; sampleValues: string[] }[] = [];
        for (let col = 0; col < Math.min(colCount, 30); col++) {
            const header = headers[col] || `Col${col}`;
            const sampleValues: string[] = [];
            for (let row = headerRowIdx + 1; row < Math.min(jsonData.length, headerRowIdx + 10); row++) {
                const val = jsonData[row]?.[col];
                if (val !== undefined && val !== '') {
                    sampleValues.push(String(val).substring(0, 40));
                }
            }
            if (header || sampleValues.length > 0) {
                columnAnalysis.push({ index: col, header: header.substring(0, 40), sampleValues: sampleValues.slice(0, 5) });
            }
        }

        // Merged cells
        const merges = sheet['!merges'] || [];
        const mergedCells = merges.slice(0, 15).map(m =>
            `${XLSX.utils.encode_cell(m.s)}:${XLSX.utils.encode_cell(m.e)}`
        );

        return {
            name: sheetName,
            rowCount,
            colCount,
            headers,
            sampleData,
            mergedCells: mergedCells.length > 0 ? mergedCells : undefined,
            columnAnalysis
        };
    });

    return {
        fileName,
        fileSize: `${fileSizeKB} KB`,
        sheetCount: workbook.SheetNames.length,
        sheets
    };
}

function formatOutput(analysis: FileAnalysis): string {
    let output = `\n${'='.repeat(100)}\n`;
    output += `📁 ファイル: ${analysis.fileName}\n`;
    output += `   サイズ: ${analysis.fileSize} | シート数: ${analysis.sheetCount}\n`;
    output += `${'='.repeat(100)}\n`;

    analysis.sheets.forEach((sheet, idx) => {
        output += `\n${'─'.repeat(80)}\n`;
        output += `📄 Sheet ${idx + 1}: "${sheet.name}"\n`;
        output += `   行数: ${sheet.rowCount} | 列数: ${sheet.colCount}\n`;

        if (sheet.mergedCells && sheet.mergedCells.length > 0) {
            output += `   結合セル: ${sheet.mergedCells.join(', ')}\n`;
        }

        output += `\n   【列構成と値サンプル】\n`;
        sheet.columnAnalysis.forEach(col => {
            if (col.header || col.sampleValues.length > 0) {
                output += `     [${String(col.index).padStart(2, '0')}] ${col.header.padEnd(25, ' ')}`;
                if (col.sampleValues.length > 0) {
                    output += ` → ${col.sampleValues.slice(0, 3).join(', ')}`;
                }
                output += `\n`;
            }
        });

        output += `\n   【生データ（先頭20行）】\n`;
        sheet.sampleData.slice(0, 20).forEach((row, rowIdx) => {
            const cells = row.slice(0, 15).map((c: any) => {
                const s = String(c || '').trim();
                return s.substring(0, 15).padEnd(15, ' ');
            });
            if (cells.some((c: string) => c.trim() !== '')) {
                output += `     ${String(rowIdx + 1).padStart(3, ' ')}: ${cells.join('|')}\n`;
            }
        });
    });

    return output;
}

async function main() {
    let fullOutput = '# レシピExcelファイル 完全解析レポート\n';
    fullOutput += `# 生成日時: ${new Date().toLocaleString('ja-JP')}\n\n`;

    console.log('🔍 レシピExcelファイル解析開始...');

    const files = fs.readdirSync(RECIPE_DIR)
        .filter(f => f.endsWith('.xlsx'))
        .map(f => path.join(RECIPE_DIR, f));

    console.log(`📂 発見ファイル数: ${files.length}`);
    fullOutput += `発見ファイル数: ${files.length}\n`;

    const analyses: FileAnalysis[] = [];

    for (const file of files) {
        try {
            console.log(`解析中: ${path.basename(file)}...`);
            const analysis = analyzeFile(file);
            analyses.push(analysis);
            fullOutput += formatOutput(analysis);
        } catch (error) {
            const errMsg = `エラー: ${path.basename(file)}: ${error}`;
            console.error(errMsg);
            fullOutput += `\n${errMsg}\n`;
        }
    }

    // Summary
    fullOutput += '\n' + '='.repeat(100) + '\n';
    fullOutput += '# 📊 総合サマリー\n';
    fullOutput += '='.repeat(100) + '\n\n';

    analyses.forEach(a => {
        fullOutput += `【${a.fileName}】\n`;
        a.sheets.forEach(s => {
            fullOutput += `  └ シート: "${s.name}" (${s.rowCount}行 × ${s.colCount}列)\n`;
            const mainCols = s.columnAnalysis.filter(c => c.header).slice(0, 10).map(c => c.header);
            if (mainCols.length > 0) {
                fullOutput += `    主要列: ${mainCols.join(', ')}\n`;
            }
        });
        fullOutput += '\n';
    });

    // Write to file
    fs.writeFileSync(OUTPUT_FILE, fullOutput, 'utf-8');
    console.log(`\n✅ 解析完了！ 結果は以下に保存されました:`);
    console.log(`   ${OUTPUT_FILE}`);
}

main();
