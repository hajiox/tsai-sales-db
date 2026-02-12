// scripts/find-person-materials-v2.ts
// Excelの資材セクションから人名行を特定

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

// 資材データベースの全アイテム名を取得（正当な資材）
const mainFile = path.join(RECIPE_DIR, files[0]);
const mainWb = XLSX.readFile(mainFile);
const matSheet = mainWb.Sheets["資材総合データベース"];
const validMaterialNames = new Set<string>();

if (matSheet) {
    const matRange = XLSX.utils.decode_range(matSheet["!ref"]!);
    for (let r = 4; r <= matRange.e.r; r++) {
        const nameCell = matSheet[XLSX.utils.encode_cell({ r, c: 2 })]; // C列
        if (nameCell && nameCell.v) {
            validMaterialNames.add(String(nameCell.v).trim());
        }
    }
}
console.log(`Valid materials in DB: ${validMaterialNames.size}\n`);

// 各レシピシートの資材セクションを確認
const suspiciousItems = new Map<string, number>();

for (const file of files) {
    const filePath = path.join(RECIPE_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const wb = XLSX.readFile(filePath);

    for (const sheetName of wb.SheetNames) {
        if (skipSheets.has(sheetName)) continue;
        const sheet = wb.Sheets[sheetName];
        if (!sheet["!ref"]) continue;

        const range = XLSX.utils.decode_range(sheet["!ref"]!);

        // 資材セクション（52行目付近〜）を確認
        for (let r = 50; r <= Math.min(range.e.r, 70); r++) {
            const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })]; // C列
            const priceCell = sheet[XLSX.utils.encode_cell({ r, c: 3 })]; // D列

            if (!nameCell || !nameCell.v) continue;
            const name = String(nameCell.v).trim();
            if (name.length < 2) continue;

            // ヘッダー行をスキップ
            if (name === "資材名" || name === "資材・人件費" || name === "資材単価" || name === "備考") continue;

            // 資材データベースにない名前＝人名の可能性が高い
            if (!validMaterialNames.has(name)) {
                const count = suspiciousItems.get(name) || 0;
                suspiciousItems.set(name, count + 1);
            }
        }
    }
}

console.log("=== Items NOT in materials database (likely person names / calculations) ===\n");
const sorted = [...suspiciousItems.entries()].sort((a, b) => b[1] - a[1]);
sorted.forEach(([name, count]) => {
    console.log(`  ${name} (${count}件)`);
});

// 保存
fs.writeFileSync("suspicious_materials.json", JSON.stringify(sorted, null, 2), "utf8");
