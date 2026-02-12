// scripts/fix-recipe-import.ts
// レシピデータ修正インポート

import pg from "pg";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const { Client } = pg;

const connectionString = "postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";

// 無視すべき材料行のキーワード
const SKIP_KEYWORDS = [
    "合計", "表記量", "充填量", "保存方法", "賞味期限", "配合",
    "資材・人件費", "空白", "原材料名", "材料名", "0",
    "スチームコンベクシ", "急速冷却"
];

async function main() {
    console.log("=== Fixing Recipe Items Import ===\n");

    const client = new Client({ connectionString });
    await client.connect();

    try {
        // 1. recipe_itemsテーブルをクリア
        console.log("1. Clearing recipe_items table...");
        await client.query("DELETE FROM recipe_items");
        console.log("  ✓ Cleared\n");

        // 2. レシピを再取得して材料をインポート
        console.log("2. Re-importing recipe items...\n");

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

        let totalItems = 0;
        let totalRecipes = 0;

        for (const { file, category } of files) {
            const filePath = path.join(RECIPE_DIR, file);
            if (!fs.existsSync(filePath)) {
                console.log(`  ⚠ File not found: ${file}`);
                continue;
            }

            const wb = XLSX.readFile(filePath);
            let fileRecipeCount = 0;
            let fileItemCount = 0;

            for (const sheetName of wb.SheetNames) {
                if (skipSheets.has(sheetName)) continue;

                const sheet = wb.Sheets[sheetName];
                if (!sheet["!ref"]) continue;

                // レシピ名を取得
                let recipeName = sheetName;
                const nameCell = sheet["D1"] || sheet["D2"] || sheet["C1"];
                if (nameCell && nameCell.v) {
                    recipeName = String(nameCell.v).trim() || sheetName;
                }

                // 既存レシピIDを探す
                const recipeResult = await client.query(
                    `SELECT id FROM recipes WHERE source_file = $1 AND (name = $2 OR name = $3)`,
                    [file, recipeName, sheetName]
                );

                if (recipeResult.rows.length === 0) {
                    // 新しく作成
                    const isIntermediate = sheetName.startsWith("【P】");

                    // 販売価格を探す (H列/I列の1-3行目)
                    let sellingPrice = null;
                    for (const cellAddr of ["I2", "J2", "I1", "J1", "I3", "J3"]) {
                        const cell = sheet[cellAddr];
                        if (cell && !isNaN(Number(cell.v)) && parseFloat(String(cell.v)) > 100) {
                            sellingPrice = parseFloat(String(cell.v));
                            break;
                        }
                    }

                    const insertResult = await client.query(
                        `INSERT INTO recipes (name, category, is_intermediate, selling_price, source_file)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                        [recipeName, category, isIntermediate, sellingPrice, file]
                    );
                    var recipeId = insertResult.rows[0].id;
                } else {
                    var recipeId = recipeResult.rows[0].id;
                }

                // ヘッダー行を探す
                const range = XLSX.utils.decode_range(sheet["!ref"]!);
                let headerRow = -1;

                for (let r = 0; r <= Math.min(range.e.r, 10); r++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
                    if (cell && String(cell.v).includes("材料名")) {
                        headerRow = r;
                        break;
                    }
                }

                if (headerRow < 0) continue;

                // 材料をインポート
                let sheetItemCount = 0;
                for (let r = headerRow + 1; r <= range.e.r; r++) {
                    const itemNameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
                    if (!itemNameCell || !itemNameCell.v) continue;

                    const itemName = String(itemNameCell.v).trim();

                    // スキップすべきか判定
                    if (!itemName || itemName.length < 2) continue;
                    if (SKIP_KEYWORDS.some(kw => itemName.includes(kw))) continue;

                    // 数字のみの場合スキップ
                    if (/^\d+(\.\d+)?$/.test(itemName)) continue;

                    // アイテムタイプ判定
                    let itemType = "ingredient";
                    if (itemName.startsWith("【P】")) {
                        itemType = "intermediate";
                    } else if (
                        itemName.includes("袋") || itemName.includes("ラベル") ||
                        itemName.includes("シール") || itemName.includes("箱") ||
                        itemName.includes("容器") || itemName.includes("パック") ||
                        itemName.includes("瓶") || itemName.includes("巻紙") ||
                        itemName.includes("フィルム") || itemName.includes("バッグ") ||
                        itemName.includes("ロール") || itemName.includes("クリスタル")
                    ) {
                        itemType = "material";
                    }

                    const getNum = (col: number) => {
                        const cell = sheet[XLSX.utils.encode_cell({ r, c: col })];
                        if (!cell) return null;
                        const val = parseFloat(String(cell.v));
                        return isNaN(val) ? null : val;
                    };

                    // 列マッピング:
                    // D (3): 入数
                    // E (4): 単価
                    // G (6): 使用量  
                    // H (7): 原価

                    const unitQuantity = getNum(3);
                    const unitPrice = getNum(4);
                    const usageAmount = getNum(6);
                    const cost = getNum(7);

                    // 原価または使用量が0以上の場合のみインサート
                    if (cost === null && usageAmount === null) continue;

                    await client.query(
                        `INSERT INTO recipe_items (recipe_id, item_name, item_type, unit_quantity, unit_price, usage_amount, cost)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [recipeId, itemName, itemType, unitQuantity, unitPrice, usageAmount, cost]
                    );
                    sheetItemCount++;
                    fileItemCount++;
                }

                if (sheetItemCount > 0) {
                    // 総原価を計算して更新
                    const costResult = await client.query(
                        `SELECT COALESCE(SUM(cost), 0) as total FROM recipe_items WHERE recipe_id = $1`,
                        [recipeId]
                    );
                    const totalCost = parseFloat(costResult.rows[0].total);

                    await client.query(
                        `UPDATE recipes SET total_cost = $1 WHERE id = $2`,
                        [totalCost, recipeId]
                    );
                }

                fileRecipeCount++;
                totalRecipes++;
            }

            totalItems += fileItemCount;
            console.log(`  ✓ ${category}: ${fileRecipeCount} recipes, ${fileItemCount} items`);
        }

        console.log(`\n  Total: ${totalRecipes} recipes, ${totalItems} items`);
        console.log("\n=== Fix Complete ===");

    } finally {
        await client.end();
    }
}

main().catch(console.error);
