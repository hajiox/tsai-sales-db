
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_FILE = "C:/作業用/レシピ/【重要】【製造】総合管理（新型）終売.xlsx";
const CATEGORY_NAME = "終売";

function findHeaderRow(sheet) {
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    for (let row = 0; row <= Math.min(10, range.e.r); row++) {
        const cellA = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
        if (cellA && cellA.v === "NO") return row;
    }
    return 4;
}

function extractProductName(sheet, sheetName) {
    const candidates = [
        sheet["B2"], sheet["C2"], sheet["B3"], sheet["C3"],
        sheet["A2"], sheet["A3"]
    ];
    for (const cell of candidates) {
        if (cell && cell.v && typeof cell.v === "string" && cell.v.length > 2) {
            if (!cell.v.includes("商品名") && !cell.v.includes("開発日") && !cell.v.includes("価格")) {
                return cell.v.trim();
            }
        }
    }
    return sheetName;
}

function extractDevelopmentDate(sheet) {
    for (let row = 1; row <= 5; row++) {
        for (let col = 0; col <= 15; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && cell.t === "n" && cell.v > 40000 && cell.v < 50000) {
                const date = XLSX.SSF.parse_date_code(cell.v);
                return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
            }
        }
    }
    return null;
}

function extractIngredients(sheet, headerRow) {
    const ingredients = [];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    let colMap = {};

    for (let col = 0; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })];
        if (cell && cell.v) {
            const header = String(cell.v).trim();
            if (header === "材料名") colMap["name"] = col;
            else if (header.includes("使用量") || header.includes("1本使用量")) colMap["usage"] = col;
            else if (header.includes("原価") || header.includes("1本原価")) colMap["cost"] = col;
        }
    }

    if (colMap["name"] === undefined) return [];

    for (let row = headerRow + 1; row <= Math.min(range.e.r, headerRow + 50); row++) {
        const nameCell = sheet[XLSX.utils.encode_cell({ r: row, c: colMap["name"] })];
        if (!nameCell || !nameCell.v) continue;
        const name = String(nameCell.v).trim();
        if (!name || name === "合計" || name === "小計" || name.includes("---")) continue;

        const getValue = (key) => {
            if (colMap[key] === undefined) return null;
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: colMap[key] })];
            return (cell && typeof cell.v === 'number') ? cell.v : null;
        };

        ingredients.push({
            item_name: name,
            usage_amount: getValue("usage"),
            cost: getValue("cost")
        });
    }
    return ingredients;
}

async function main() {
    if (!fs.existsSync(TARGET_FILE)) {
        console.error(`File not found: ${TARGET_FILE}`);
        return;
    }

    console.log(`Processing ${TARGET_FILE}...`);
    const workbook = XLSX.readFile(TARGET_FILE);

    for (const sheetName of workbook.SheetNames) {
        if (sheetName.includes("原価計算") || sheetName.includes("データベース") || sheetName.includes("加工記録")) continue;

        const sheet = workbook.Sheets[sheetName];
        if (!sheet || !sheet["!ref"]) continue;

        const productName = extractProductName(sheet, sheetName);
        console.log(`  Importing sheet: ${sheetName} -> ${productName}`);

        // Check existing
        const { data: existing } = await supabase.from("recipes").select("id").eq("name", productName).single();
        if (existing) {
            console.log(`    Skipping existing recipe: ${productName}`);
            continue;
        }

        const devDate = extractDevelopmentDate(sheet);
        const headerRow = findHeaderRow(sheet);
        const items = extractIngredients(sheet, headerRow);

        let totalCost = 0;
        items.forEach(i => totalCost += (i.cost || 0));

        // Insert Recipe
        const { data: recipe, error: rError } = await supabase
            .from("recipes")
            .insert({
                name: productName,
                category: CATEGORY_NAME, // "終売"
                development_date: devDate,
                total_cost: totalCost,
                source_file: path.basename(TARGET_FILE),
                // source_sheet: sheetName
            })
            .select("id")
            .single();

        if (rError) {
            console.error(`    Error inserting recipe: ${rError.message}`);
            continue;
        }

        // Insert Items
        if (items.length > 0) {
            // Determine type (simplified)
            const dbItems = items.map(i => ({
                recipe_id: recipe.id,
                item_name: i.item_name,
                usage_amount: i.usage_amount,
                cost: i.cost,
                item_type: 'ingredient' // Default to ingredient, can be refined later
            }));

            const { error: iError } = await supabase.from("recipe_items").insert(dbItems);
            if (iError) {
                console.error(`    Error inserting items: ${iError.message}`);
            } else {
                console.log(`    Inserted ${items.length} items`);
            }
        }
    }
    console.log("Done.");
}

main();
