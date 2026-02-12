// scripts/analyze-development-date.ts
// Excelシートから開発日の場所を分析

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";

const files = [
    "【重要】【製造】総合管理（新型）ネット専用.xlsx",
    "【重要】【製造】総合管理（新型）自社.xlsx",
    "【重要】【製造】総合管理（新型）OEM.xlsx",
    "【重要】【製造】総合管理（新型）Shopee台湾.xlsx",
];

const skipSheets = new Set([
    "チャーシュー原価計算", "卸商品原価", "農産物加工記録",
    "資材総合データベース", "食材総合データベース",
    "Sheet1", "Sheet2", "Sheet7"
]);

interface DateInfo {
    file: string;
    sheet: string;
    cell: string;
    value: any;
    formatted: string | null;
}

const results: DateInfo[] = [];

for (const file of files) {
    const filePath = path.join(RECIPE_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const wb = XLSX.readFile(filePath);

    for (const sheetName of wb.SheetNames) {
        if (skipSheets.has(sheetName)) continue;

        const sheet = wb.Sheets[sheetName];
        if (!sheet["!ref"]) continue;

        // 開発日を探す - よくある場所をチェック
        // 通常は1-3行目のどこかにある
        const searchCells = [
            "A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1", "J1",
            "A2", "B2", "C2", "D2", "E2", "F2", "G2", "H2", "I2", "J2",
            "A3", "B3", "C3", "D3", "E3", "F3", "G3", "H3", "I3", "J3",
        ];

        for (const cellAddr of searchCells) {
            const cell = sheet[cellAddr];
            if (cell && cell.v !== undefined) {
                const val = cell.v;

                // 日付の可能性をチェック
                // 1. Excelのシリアル日付 (数字で大体40000-50000程度)
                // 2. 日付文字列パターン
                if (typeof val === "number" && val > 40000 && val < 50000) {
                    // Excel serial date
                    const date = XLSX.SSF.parse_date_code(val);
                    const formatted = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                    results.push({
                        file: file.replace("【重要】【製造】総合管理（新型）", "").replace(".xlsx", ""),
                        sheet: sheetName,
                        cell: cellAddr,
                        value: val,
                        formatted
                    });
                } else if (typeof val === "string") {
                    // 日付パターンをチェック
                    if (/\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(val) ||
                        /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(val) ||
                        /開発/.test(val)) {
                        results.push({
                            file: file.replace("【重要】【製造】総合管理（新型）", "").replace(".xlsx", ""),
                            sheet: sheetName,
                            cell: cellAddr,
                            value: val,
                            formatted: null
                        });
                    }
                }
            }
        }
    }
}

// 結果をJSONで保存
fs.writeFileSync("development_date_analysis.json", JSON.stringify(results.slice(0, 100), null, 2), "utf8");
console.log(`Found ${results.length} potential date fields`);
console.log("First 10:");
results.slice(0, 10).forEach(r => {
    console.log(`  ${r.file} / ${r.sheet} [${r.cell}]: ${r.formatted || r.value}`);
});
