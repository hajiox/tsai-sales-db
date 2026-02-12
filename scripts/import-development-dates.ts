// scripts/import-development-dates.ts
// Excelから開発日をインポート

import pg from "pg";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const { Client } = pg;

const connectionString = "postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";

const files = [
    { file: "【重要】【製造】総合管理（新型）ネット専用.xlsx", category: "ネット専用" },
    { file: "【重要】【製造】総合管理（新型）自社.xlsx", category: "自社" },
    { file: "【重要】【製造】総合管理（新型）OEM.xlsx", category: "OEM" },
    { file: "【重要】【製造】総合管理（新型）Shopee台湾.xlsx", category: "Shopee" },
];

const skipSheets = new Set([
    "チャーシュー原価計算", "卸商品原価", "農産物加工記録",
    "資材総合データベース", "食材総合データベース",
    "Sheet1", "Sheet2", "Sheet7"
]);

async function main() {
    console.log("=== Importing Development Dates ===\n");

    const client = new Client({ connectionString });
    await client.connect();

    let updated = 0;
    let notFound = 0;

    try {
        for (const { file } of files) {
            const filePath = path.join(RECIPE_DIR, file);
            if (!fs.existsSync(filePath)) {
                console.log(`  ⚠ File not found: ${file}`);
                continue;
            }

            const wb = XLSX.readFile(filePath);

            for (const sheetName of wb.SheetNames) {
                if (skipSheets.has(sheetName)) continue;

                const sheet = wb.Sheets[sheetName];
                if (!sheet["!ref"]) continue;

                // 開発日を探す - D3またはD2セル
                let developmentDate: string | null = null;

                for (const cellAddr of ["D3", "D2"]) {
                    const cell = sheet[cellAddr];
                    if (cell && typeof cell.v === "number" && cell.v > 40000 && cell.v < 60000) {
                        // Excel serial date
                        const date = XLSX.SSF.parse_date_code(cell.v);
                        developmentDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                        break;
                    }
                }

                if (!developmentDate) continue;

                // レシピ名を取得
                let recipeName = sheetName;
                const nameCell = sheet["D1"] || sheet["C1"];
                if (nameCell && nameCell.v) {
                    recipeName = String(nameCell.v).trim() || sheetName;
                }

                // レシピを更新
                const result = await client.query(
                    `UPDATE recipes SET development_date = $1 
           WHERE source_file = $2 AND (name = $3 OR name = $4)`,
                    [developmentDate, file, recipeName, sheetName]
                );

                if (result.rowCount && result.rowCount > 0) {
                    updated++;
                } else {
                    notFound++;
                }
            }
        }

        console.log(`\n  ✓ Updated: ${updated} recipes`);
        console.log(`  ⚠ Not found: ${notFound} recipes`);
        console.log("\n=== Import Complete ===");

    } finally {
        await client.end();
    }
}

main().catch(console.error);
