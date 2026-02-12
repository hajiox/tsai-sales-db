// scripts/deep-analyze-excel.ts
// Excelファイルの詳細構造分析

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";

async function main() {
    const output: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        output.push(msg);
    };

    log("=== Deep Excel File Analysis ===\n");

    const files = fs.readdirSync(RECIPE_DIR).filter(f => f.endsWith('.xlsx'));

    for (const file of files) {
        log("\n" + "=".repeat(60));
        log(`📁 ${file}`);
        log("=".repeat(60));

        const filePath = path.join(RECIPE_DIR, file);
        const workbook = XLSX.readFile(filePath);

        log(`シート数: ${workbook.SheetNames.length}`);
        log("\nシート一覧:");
        workbook.SheetNames.forEach((name, i) => log(`  ${i + 1}. ${name}`));

        // 最初の5シートを詳細分析
        const sheetsToAnalyze = workbook.SheetNames.slice(0, 5);

        for (const sheetName of sheetsToAnalyze) {
            log(`\n--- シート: ${sheetName} ---`);

            const sheet = workbook.Sheets[sheetName];
            if (!sheet['!ref']) {
                log("  (空のシート)");
                continue;
            }

            const range = XLSX.utils.decode_range(sheet['!ref']);
            log(`  範囲: ${sheet['!ref']} (${range.e.r + 1}行 × ${range.e.c + 1}列)`);

            // 最初の15行を表示
            log("\n  最初の15行:");
            for (let r = 0; r <= Math.min(range.e.r, 14); r++) {
                let rowContent = [];
                for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                    const value = cell ? String(cell.v).substring(0, 15) : "";
                    rowContent.push(value || "");
                }
                // 空行をスキップ
                if (rowContent.some(v => v)) {
                    log(`    Row ${r + 1}: ${rowContent.join(" | ")}`);
                }
            }
        }
    }

    log("\n\n=== ファイル別カテゴリ ===");
    log("ネット専用.xlsx → ネット専用レシピ");
    log("自社.xlsx → 自社レシピ");
    log("OEM.xlsx → OEMレシピ");
    log("Shopee台湾.xlsx → Shopee台湾レシピ");

    // 結果をファイルに保存
    fs.writeFileSync("excel_analysis.txt", output.join("\n"), "utf-8");
    console.log("\n\nResults saved to excel_analysis.txt");
}

main().catch(console.error);
