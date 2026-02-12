// scripts/fix-recipe-import-v2.ts
// レシピデータ修正インポート v2 - 資材の列マッピング修正

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
    "資材・人件費", "空白", "原材料名", "材料名",
    "スチームコンベクシ", "急速冷却", "原価合計", "時間"
];

// 資材判定用のキーワード
const MATERIAL_KEYWORDS = [
    "袋", "ラベル", "シール", "箱", "容器", "パック", "瓶", "巻紙",
    "フィルム", "バッグ", "ロール", "クリスタル", "CA-800", "QL-"
];

function isMaterial(name: string): boolean {
    return MATERIAL_KEYWORDS.some(kw => name.includes(kw));
}

function shouldSkip(name: string): boolean {
    if (!name || name.length < 2) return true;
    if (/^\d+(\.\d+)?$/.test(name)) return true;
    if (SKIP_KEYWORDS.some(kw => name.includes(kw))) return true;
    return false;
}

async function main() {
    console.log("=== Fixing Recipe Items Import v2 ===\n");

    const client = new Client({ connectionString });
    await client.connect();

    try {
        // 1. recipe_itemsテーブルをクリア
        console.log("1. Clearing recipe_items table...");
        await client.query("DELETE FROM recipe_items");

        // total_costもリセット
        await client.query("UPDATE recipes SET total_cost = NULL");
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
                const nameCell = sheet["D1"] || sheet["C1"];
                if (nameCell && nameCell.v) {
                    recipeName = String(nameCell.v).trim() || sheetName;
                }

                // 既存レシピIDを探す
                const recipeResult = await client.query(
                    `SELECT id FROM recipes WHERE source_file = $1 AND (name = $2 OR name = $3)`,
                    [file, recipeName, sheetName]
                );

                let recipeId: string;
                if (recipeResult.rows.length === 0) {
                    const isIntermediate = sheetName.startsWith("【P】");

                    // 販売価格を探す
                    let sellingPrice = null;
                    for (const cellAddr of ["J2", "I2", "J1", "I1", "J3"]) {
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
                    recipeId = insertResult.rows[0].id;
                } else {
                    recipeId = recipeResult.rows[0].id;
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
                let sheetTotalCost = 0;

                for (let r = headerRow + 1; r <= range.e.r; r++) {
                    const itemNameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
                    if (!itemNameCell || !itemNameCell.v) continue;

                    const itemName = String(itemNameCell.v).trim();

                    // スキップ判定
                    if (shouldSkip(itemName)) continue;

                    // アイテムタイプ判定
                    let itemType = "ingredient";
                    const isMaterialItem = isMaterial(itemName);

                    if (itemName.startsWith("【P】")) {
                        itemType = "intermediate";
                    } else if (isMaterialItem) {
                        itemType = "material";
                    }

                    const getNum = (col: number) => {
                        const cell = sheet[XLSX.utils.encode_cell({ r, c: col })];
                        if (!cell) return null;
                        const val = parseFloat(String(cell.v));
                        return isNaN(val) ? null : val;
                    };

                    let unitQuantity: number | null;
                    let unitPrice: number | null;
                    let usageAmount: number | null;
                    let cost: number | null;

                    if (isMaterialItem) {
                        // 資材の場合: D列が単価（=原価）、使用量は1
                        unitQuantity = 1;
                        cost = getNum(3);  // D列 = 単価がそのまま原価
                        unitPrice = cost;
                        usageAmount = 1;
                    } else {
                        // 食材・中間部品の場合: 通常の列マッピング
                        // D (3): 入数
                        // E (4): 単価
                        // G (6): 使用量
                        // H (7): 1本原価
                        unitQuantity = getNum(3);
                        unitPrice = getNum(4);
                        usageAmount = getNum(6);
                        cost = getNum(7);
                    }

                    // 原価がnullまたは0以下の場合はスキップ
                    if (cost === null || cost <= 0) continue;

                    await client.query(
                        `INSERT INTO recipe_items (recipe_id, item_name, item_type, unit_quantity, unit_price, usage_amount, cost)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [recipeId, itemName, itemType, unitQuantity, unitPrice, usageAmount, cost]
                    );

                    sheetTotalCost += cost;
                    sheetItemCount++;
                    fileItemCount++;
                }

                if (sheetItemCount > 0) {
                    // 総原価を更新
                    await client.query(
                        `UPDATE recipes SET total_cost = $1 WHERE id = $2`,
                        [sheetTotalCost, recipeId]
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
