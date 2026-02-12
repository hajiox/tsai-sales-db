// scripts/check-materials-db.ts
// 資材総合データベースの中身を確認

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";
const filePath = path.join(RECIPE_DIR, "【重要】【製造】総合管理（新型）ネット専用.xlsx");

const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets["資材総合データベース"];

if (!sheet) {
    console.log("Sheet not found!");
    process.exit(1);
}

const range = XLSX.utils.decode_range(sheet["!ref"]!);

// データを収集
const materials: any[] = [];
for (let r = 4; r <= range.e.r; r++) {
    const row: any = { rowNum: r };
    for (let c = 0; c <= 7; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        row[String.fromCharCode(65 + c)] = cell ? cell.v : null;
    }
    // 名前があるもののみ
    if (row.C && String(row.C).length > 2) {
        materials.push(row);
    }
}

// JSONで保存
fs.writeFileSync("materials_db.json", JSON.stringify(materials.slice(0, 100), null, 2), "utf8");
console.log(`Found ${materials.length} materials, saved to materials_db.json`);

// 人件費、送料、電気代を探す
const keywords = ["人件", "送料", "電気", "ヤマト", "佐川", "宅急便", "配送"];
console.log("\n=== Special Items ===");
materials.forEach(m => {
    const name = String(m.C || "");
    if (keywords.some(kw => name.includes(kw))) {
        console.log(`  ${name}: ${m.E || m.D}`);
    }
});
