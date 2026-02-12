// scripts/setup-revised-schema.ts
// 改訂版スキーマ作成とデータインポート

import pg from "pg";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const { Client } = pg;

const connectionString = "postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";

async function main() {
    console.log("=== Setting Up Revised Schema ===\n");

    const client = new Client({ connectionString });
    await client.connect();

    try {
        // 1. テーブル作成（既存削除）
        console.log("1. Creating tables...");

        await client.query(`
      -- 既存テーブル削除
      DROP TABLE IF EXISTS recipe_items CASCADE;
      DROP TABLE IF EXISTS intermediate_products CASCADE;
      DROP TABLE IF EXISTS materials CASCADE;
      DROP TABLE IF EXISTS recipes CASCADE;
      DROP TABLE IF EXISTS ingredients CASCADE;
      DROP TABLE IF EXISTS recipe_ingredients CASCADE;
      DROP TABLE IF EXISTS ingredient_categories CASCADE;
      DROP TABLE IF EXISTS recipe_categories CASCADE;
      
      -- 食材テーブル
      CREATE TABLE ingredients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        unit_quantity DECIMAL(10,2) DEFAULT 1000,
        price DECIMAL(10,2),
        calories DECIMAL(10,2),
        protein DECIMAL(10,2),
        fat DECIMAL(10,2),
        carbohydrate DECIMAL(10,2),
        sodium DECIMAL(10,3),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      
      -- 資材テーブル
      CREATE TABLE materials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        unit_quantity TEXT,
        price DECIMAL(10,2),
        supplier TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      
      -- レシピテーブル
      CREATE TABLE recipes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        is_intermediate BOOLEAN DEFAULT false,
        development_date DATE,
        selling_price DECIMAL(10,2),
        total_cost DECIMAL(10,2),
        source_file TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      
      -- レシピ材料テーブル
      CREATE TABLE recipe_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
        item_name TEXT NOT NULL,
        item_type TEXT NOT NULL,
        unit_quantity DECIMAL(10,2),
        unit_price DECIMAL(10,4),
        usage_amount DECIMAL(10,4),
        cost DECIMAL(10,4),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      
      -- インデックス
      CREATE INDEX idx_ingredients_name ON ingredients(name);
      CREATE INDEX idx_materials_name ON materials(name);
      CREATE INDEX idx_recipes_category ON recipes(category);
      CREATE INDEX idx_recipes_intermediate ON recipes(is_intermediate);
      CREATE INDEX idx_recipe_items_recipe ON recipe_items(recipe_id);
    `);
        console.log("  ✓ Tables created\n");

        // 2. 食材DBインポート
        console.log("2. Importing ingredients from 食材総合データベース...");
        const netFilePath = path.join(RECIPE_DIR, "【重要】【製造】総合管理（新型）ネット専用.xlsx");
        const workbook = XLSX.readFile(netFilePath);

        const ingredientSheet = workbook.Sheets["食材総合データベース"];
        if (ingredientSheet) {
            const range = XLSX.utils.decode_range(ingredientSheet["!ref"]!);
            let count = 0;

            for (let r = 4; r <= range.e.r; r++) {
                const nameCell = ingredientSheet[XLSX.utils.encode_cell({ r, c: 2 })];
                if (!nameCell || !nameCell.v || nameCell.v === "空白") continue;

                const name = String(nameCell.v).trim();
                if (!name || name.length < 2) continue;

                const getNum = (col: number) => {
                    const cell = ingredientSheet[XLSX.utils.encode_cell({ r, c: col })];
                    return cell && !isNaN(Number(cell.v)) ? parseFloat(String(cell.v)) : null;
                };

                await client.query(
                    `INSERT INTO ingredients (name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [name, getNum(3), getNum(4), getNum(5), getNum(6), getNum(7), getNum(8), getNum(9)]
                );
                count++;
            }
            console.log(`  ✓ Imported ${count} ingredients\n`);
        }

        // 3. 資材DBインポート
        console.log("3. Importing materials from 資材総合データベース...");
        const materialSheet = workbook.Sheets["資材総合データベース"];
        if (materialSheet) {
            const range = XLSX.utils.decode_range(materialSheet["!ref"]!);
            let count = 0;

            for (let r = 4; r <= range.e.r; r++) {
                const nameCell = materialSheet[XLSX.utils.encode_cell({ r, c: 2 })];
                if (!nameCell || !nameCell.v || nameCell.v === "空白") continue;

                const name = String(nameCell.v).trim();
                if (!name || name.length < 2) continue;

                const unitCell = materialSheet[XLSX.utils.encode_cell({ r, c: 3 })];
                const priceCell = materialSheet[XLSX.utils.encode_cell({ r, c: 4 })];
                const supplierCell = materialSheet[XLSX.utils.encode_cell({ r, c: 6 })];
                const notesCell = materialSheet[XLSX.utils.encode_cell({ r, c: 7 })];

                await client.query(
                    `INSERT INTO materials (name, unit_quantity, price, supplier, notes)
           VALUES ($1, $2, $3, $4, $5)`,
                    [
                        name,
                        unitCell?.v ? String(unitCell.v) : null,
                        priceCell && !isNaN(Number(priceCell.v)) ? parseFloat(String(priceCell.v)) : null,
                        supplierCell?.v ? String(supplierCell.v) : null,
                        notesCell?.v ? String(notesCell.v) : null,
                    ]
                );
                count++;
            }
            console.log(`  ✓ Imported ${count} materials\n`);
        }

        // 4. レシピインポート
        console.log("4. Importing recipes from all files...");

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

        let totalRecipes = 0;

        for (const { file, category } of files) {
            const filePath = path.join(RECIPE_DIR, file);
            if (!fs.existsSync(filePath)) continue;

            const wb = XLSX.readFile(filePath);
            let fileRecipeCount = 0;

            for (const sheetName of wb.SheetNames) {
                if (skipSheets.has(sheetName)) continue;

                const sheet = wb.Sheets[sheetName];
                if (!sheet["!ref"]) continue;

                let recipeName = sheetName;
                const nameCell = sheet["D1"] || sheet["D2"] || sheet["C1"];
                if (nameCell && nameCell.v) {
                    recipeName = String(nameCell.v).trim() || sheetName;
                }

                const isIntermediate = sheetName.startsWith("【P】");

                const dateCell = sheet["D2"] || sheet["D3"];
                let devDate = null;
                if (dateCell && dateCell.v && !isNaN(Number(dateCell.v))) {
                    try {
                        const serial = parseInt(String(dateCell.v));
                        const utcDays = Math.floor(serial - 25569);
                        devDate = new Date(utcDays * 86400 * 1000).toISOString().split("T")[0];
                    } catch (e) { }
                }

                let sellingPrice = null;
                for (let c = 8; c <= 12; c++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })] ||
                        sheet[XLSX.utils.encode_cell({ r: 1, c })];
                    if (cell && !isNaN(Number(cell.v)) && parseFloat(String(cell.v)) > 0) {
                        sellingPrice = parseFloat(String(cell.v));
                        break;
                    }
                }

                const result = await client.query(
                    `INSERT INTO recipes (name, category, is_intermediate, development_date, selling_price, source_file)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                    [recipeName, category, isIntermediate, devDate, sellingPrice, file]
                );
                const recipeId = result.rows[0].id;

                const range = XLSX.utils.decode_range(sheet["!ref"]!);
                let headerRow = -1;

                for (let r = 0; r <= Math.min(range.e.r, 10); r++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
                    if (cell && String(cell.v).includes("材料名")) {
                        headerRow = r;
                        break;
                    }
                }

                if (headerRow >= 0) {
                    for (let r = headerRow + 1; r <= range.e.r; r++) {
                        const itemNameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
                        if (!itemNameCell || !itemNameCell.v) continue;

                        const itemName = String(itemNameCell.v).trim();
                        if (!itemName || itemName === "0" || itemName === "空白" || itemName.length < 2) continue;

                        let itemType = "ingredient";
                        if (itemName.startsWith("【P】")) {
                            itemType = "intermediate";
                        } else if (itemName.includes("袋") || itemName.includes("ラベル") ||
                            itemName.includes("シール") || itemName.includes("箱") ||
                            itemName.includes("容器") || itemName.includes("パック") ||
                            itemName.includes("瓶") || itemName.includes("巻紙")) {
                            itemType = "material";
                        }

                        const getNum = (col: number) => {
                            const cell = sheet[XLSX.utils.encode_cell({ r, c: col })];
                            return cell && !isNaN(Number(cell.v)) ? parseFloat(String(cell.v)) : null;
                        };

                        await client.query(
                            `INSERT INTO recipe_items (recipe_id, item_name, item_type, unit_quantity, unit_price, usage_amount, cost)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [recipeId, itemName, itemType, getNum(3), getNum(4), getNum(6), getNum(7)]
                        );
                    }
                }

                fileRecipeCount++;
                totalRecipes++;
            }

            console.log(`  ✓ ${category}: ${fileRecipeCount} recipes`);
        }

        console.log(`  Total: ${totalRecipes} recipes\n`);

        console.log("=== Setup Complete ===");

    } finally {
        await client.end();
    }
}

main().catch(console.error);
