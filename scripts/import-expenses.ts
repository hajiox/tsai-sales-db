// scripts/import-expenses.ts
// レシピの経費項目（送料、人件費、光熱費など）をインポート

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

// 経費項目のキーワードと正規化名
const EXPENSE_PATTERNS: { pattern: RegExp; name: string }[] = [
    { pattern: /ヤマト.*送料|ヤマト常温/i, name: "ヤマト送料" },
    { pattern: /ネコポス送料/i, name: "ネコポス送料" },
    { pattern: /平均送料予測.*冷凍/i, name: "冷凍冷蔵送料" },
    { pattern: /総合ネット発送人件費/i, name: "ネット発送人件費" },
    { pattern: /総合水道光熱費/i, name: "水道光熱費" },
    { pattern: /総合人件費/i, name: "製造人件費" },
];

async function main() {
    console.log("=== Importing Expense Items ===\n");

    const client = new Client({ connectionString });
    await client.connect();

    let totalExpenses = 0;
    let updatedRecipes = 0;

    try {
        // 既存の経費アイテムを削除
        const deleteResult = await client.query(
            "DELETE FROM recipe_items WHERE item_type = 'expense'"
        );
        console.log(`  Deleted ${deleteResult.rowCount} existing expense items\n`);

        for (const { file } of files) {
            const filePath = path.join(RECIPE_DIR, file);
            if (!fs.existsSync(filePath)) {
                console.log(`  ⚠ File not found: ${file}`);
                continue;
            }

            const wb = XLSX.readFile(filePath);
            let fileExpenseCount = 0;

            for (const sheetName of wb.SheetNames) {
                if (skipSheets.has(sheetName)) continue;

                const sheet = wb.Sheets[sheetName];
                if (!sheet["!ref"]) continue;

                // レシピ名を取得
                let recipeName = sheetName;
                const nameCell = sheet["D1"] || sheet["C1"];
                if (nameCell && nameCell.v) {
                    recipeName = String(nameCell.v).trim() || sheetName;
                }

                // レシピIDを取得
                const recipeResult = await client.query(
                    `SELECT id FROM recipes WHERE source_file = $1 AND (name = $2 OR name = $3)`,
                    [file, recipeName, sheetName]
                );

                if (recipeResult.rows.length === 0) continue;
                const recipeId = recipeResult.rows[0].id;

                // 経費項目を探す（50行目以降）
                const range = XLSX.utils.decode_range(sheet["!ref"]!);
                const expenses: { name: string; cost: number }[] = [];

                for (let r = 50; r <= Math.min(range.e.r, 80); r++) {
                    const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })]; // C列
                    if (!nameCell || typeof nameCell.v !== "string") continue;

                    const cellValue = String(nameCell.v);

                    // 経費パターンにマッチするか確認
                    for (const { pattern, name } of EXPENSE_PATTERNS) {
                        if (pattern.test(cellValue)) {
                            // 価格を探す（D〜H列）
                            let cost: number | null = null;
                            for (let c = 3; c <= 7; c++) {
                                const priceCell = sheet[XLSX.utils.encode_cell({ r, c })];
                                if (priceCell && typeof priceCell.v === "number" && priceCell.v > 0) {
                                    cost = priceCell.v;
                                    break;
                                }
                            }

                            if (cost !== null && cost > 0) {
                                // 重複チェック
                                if (!expenses.find(e => e.name === name)) {
                                    expenses.push({ name, cost });
                                }
                            }
                            break;
                        }
                    }
                }

                // 経費をインサート
                for (const expense of expenses) {
                    await client.query(
                        `INSERT INTO recipe_items (recipe_id, item_name, item_type, cost, usage_amount, unit_quantity)
             VALUES ($1, $2, 'expense', $3, 1, 1)`,
                        [recipeId, expense.name, expense.cost]
                    );
                    fileExpenseCount++;
                    totalExpenses++;
                }

                if (expenses.length > 0) {
                    // 総原価を再計算
                    const { rows } = await client.query(
                        `SELECT SUM(cost) as total FROM recipe_items WHERE recipe_id = $1`,
                        [recipeId]
                    );
                    const newTotal = rows[0]?.total || 0;

                    await client.query(
                        `UPDATE recipes SET total_cost = $1 WHERE id = $2`,
                        [newTotal, recipeId]
                    );
                    updatedRecipes++;
                }
            }

            console.log(`  ✓ ${file.replace("【重要】【製造】総合管理（新型）", "").replace(".xlsx", "")}: ${fileExpenseCount} expenses`);
        }

        console.log(`\n  Total: ${totalExpenses} expense items added to ${updatedRecipes} recipes`);
        console.log("\n=== Import Complete ===");

    } finally {
        await client.end();
    }
}

main().catch(console.error);
