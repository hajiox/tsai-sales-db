// scripts/analyze-materials.ts
// Excelファイルから資材データを詳細分析

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

    log("=== Analyzing Excel Files for Materials ===\n");

    const files = fs.readdirSync(RECIPE_DIR).filter(f => f.endsWith('.xlsx'));

    const allItems = new Set<string>();
    const materialItems = new Set<string>();
    const foodItems = new Set<string>();

    for (const file of files) {
        log(`\n📁 File: ${file}`);
        const filePath = path.join(RECIPE_DIR, file);
        const workbook = XLSX.readFile(filePath);

        log(`   Sheets: ${workbook.SheetNames.length}`);

        for (const sheetName of workbook.SheetNames) {
            // システムシートをスキップ
            if (sheetName.includes("製造") || sheetName.includes("総合") ||
                sheetName === "Sheet1" || sheetName === "Sheet2") {
                continue;
            }

            const sheet = workbook.Sheets[sheetName];
            if (!sheet['!ref']) continue;

            const range = XLSX.utils.decode_range(sheet['!ref']);

            // ヘッダー行を探す（材料名が含まれる行）
            let headerRow = -1;
            for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
                for (let c = 0; c <= range.e.c; c++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                    if (cell && String(cell.v).includes("材料名")) {
                        headerRow = r;
                        break;
                    }
                }
                if (headerRow >= 0) break;
            }

            if (headerRow < 0) continue;

            // 材料名カラムを特定
            let nameCol = -1;
            for (let c = 0; c <= range.e.c; c++) {
                const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
                if (cell && String(cell.v).includes("材料名")) {
                    nameCol = c;
                    break;
                }
            }

            if (nameCol < 0) continue;

            // 材料名を抽出
            for (let r = headerRow + 1; r <= range.e.r; r++) {
                const cell = sheet[XLSX.utils.encode_cell({ r, c: nameCol })];
                if (!cell || !cell.v) continue;

                const name = String(cell.v).trim();
                if (!name || name === "0" || name.length < 2) continue;

                allItems.add(name);

                // 資材判定（より広範囲のキーワードで判定）
                const isMaterial = isMaterialItem(name);

                if (isMaterial) {
                    materialItems.add(name);
                } else {
                    foodItems.add(name);
                }
            }
        }
    }

    log("\n\n=== Summary ===");
    log(`Total unique items: ${allItems.size}`);
    log(`Food items: ${foodItems.size}`);
    log(`Material items: ${materialItems.size}`);

    log("\n=== Material Items Found ===");
    const sortedMaterials = Array.from(materialItems).sort();
    sortedMaterials.forEach((m, i) => log(`  ${i + 1}. ${m}`));

    // 結果をファイルに保存
    fs.writeFileSync("materials_analysis.txt", output.join("\n"), "utf-8");
    console.log("\n\nResults saved to materials_analysis.txt");
}

function isMaterialItem(name: string): boolean {
    const keywords = [
        "袋", "容器", "パック", "パウチ", "ラベル", "シール", "箱", "カップ",
        "蓋", "フタ", "トレー", "トレイ", "ケース", "ボトル", "缶", "瓶",
        "紙", "段ボール", "ダンボール", "フィルム", "シュリンク", "包装", "梱包",
        "資材", "包材", "PP", "PE", "OPP", "ナイロン", "アルミ", "ビニール",
        "レトルトパウチ", "チャック", "ジップ", "スタンド", "ガゼット",
        "外装", "内袋", "シール機", "脱酸素", "乾燥剤", "タイ", "バンド",
        "クリップ", "封筒", "のし", "熨斗", "リボン", "テープ", "ストロー",
        "スプーン", "フォーク", "割り箸", "おしぼり", "ナプキン", "プレート",
        "中厚", "大角", "角袋", "平袋"
    ];

    const nameLower = name.toLowerCase();

    for (const kw of keywords) {
        if (name.includes(kw)) {
            return true;
        }
    }

    // サイズ表記があるものも資材の可能性（180×250など）
    if (/\d+[×x]\d+/.test(name)) {
        return true;
    }

    return false;
}

main().catch(console.error);
