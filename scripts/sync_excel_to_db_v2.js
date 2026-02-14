
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const EXCEL_FILES = [
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）自社.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）Shopee台湾.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）OEM.xlsx'
];

function cleanName(val) {
    if (!val) return '';
    return String(val).trim();
}

async function main() {
    console.log("Starting DB Sync from Excel Files...");

    for (const filePath of EXCEL_FILES) {
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            continue;
        }

        console.log(`Processing file: ${path.basename(filePath)}`);
        const workbook = XLSX.readFile(filePath);

        for (const sheetName of workbook.SheetNames) {
            if (sheetName.includes('目次') || sheetName.includes('集計') || sheetName.includes('Sheet')) continue;

            const sheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (data.length < 5) continue;

            // Recipe Name from C2 (Row 1, Index 2)
            let recipeName = data[1] && data[1][2];
            if (!recipeName) recipeName = sheetName;

            // Clean up recipe name
            let clean = cleanName(recipeName).replace(/^【商品】/, '');

            // Find Recipe in DB
            let { data: recipes } = await supabase.from('recipes').select('id, name').like('name', `%${clean}%`);

            if (!recipes || recipes.length === 0) {
                // Try removing spaces
                clean = clean.replace(/\s+/g, '');
                ({ data: recipes } = await supabase.from('recipes').select('id, name').like('name', `%${clean}%`));
            }

            if (!recipes || recipes.length === 0) {
                // If sheet name is used, try fuzzy matching more loosely
                // Or try searching by exact sheet name
                ({ data: recipes } = await supabase.from('recipes').select('id, name').eq('name', cleanName(recipeName)));
            }

            if (!recipes || recipes.length === 0) {
                console.warn(`  [SKIP] Recipe not found in DB: ${recipeName}`);
                continue;
            }

            const targetRecipe = recipes[0];
            const recipeId = targetRecipe.id;
            console.log(`  Syncing Recipe: ${targetRecipe.name} (ID: ${recipeId})`);

            const newItems = [];

            // State machine for parsing
            let section = 'ingredients'; // ingredients, gap, materials
            let headersFound = false;

            // Ingredients start at row 5 (index 5) implicitly
            // But we must stop when we see summary rows

            for (let i = 5; i < data.length; i++) {
                const row = data[i];
                if (!row) continue;

                const name = cleanName(row[2]); // Col C

                // Section transition logic
                if (name.includes('資材名') || name.includes('資材・人件費')) {
                    section = 'materials';
                    continue; // Skip header
                }

                if (name.includes('充填量') || name.includes('歩留まり') || name.includes('小計')) {
                    // End of ingredients block
                    if (section === 'ingredients') section = 'gap';
                    continue;
                }

                if (!name || name === 'NO' || name === '空白' || name.startsWith('合計')) continue;

                if (section === 'ingredients') {
                    // Ingredients Logic
                    const unitQty = Number(row[3]) || 0; // D: 入数
                    const unitPrice = Number(row[4]) || 0; // E: 単価(込)
                    const usage = Number(row[6]) || 0; // G: 使用量
                    const cost = Number(row[7]) || 0; // H: 原価

                    if (usage > 0 || cost > 0) {
                        newItems.push({
                            recipe_id: recipeId,
                            item_name: name,
                            item_type: 'ingredient',
                            unit_quantity: unitQty,
                            unit_price: unitPrice,
                            usage_amount: usage,
                            cost: cost
                        });
                    }
                } else if (section === 'materials') {
                    // Materials Logic
                    // D(3): Cost per unit
                    // G(6): Usage (often string or empty, default to 1)

                    const valD = Number(row[3]) || 0;
                    const cost = valD;
                    let usage = 1;

                    let itemType = 'material';
                    if (name.includes('送料') || name.includes('人件費') || name.includes('手数料')) {
                        itemType = 'expense';
                    }

                    if (cost > 0) {
                        newItems.push({
                            recipe_id: recipeId,
                            item_name: name,
                            item_type: itemType,
                            unit_quantity: 1,
                            unit_price: cost,
                            usage_amount: usage,
                            cost: cost
                        });
                    }
                }
            }

            // Batch Insert
            if (newItems.length > 0) {
                // Delete old items
                await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);

                // Insert new
                const { error: insError } = await supabase.from('recipe_items').insert(newItems);

                if (insError) {
                    console.error(`  [ERROR] Failed to insert items for ${targetRecipe.name}:`, insError.message);
                } else {
                    // Calculate totals
                    const totalCost = newItems.reduce((acc, item) => acc + (item.cost || 0), 0);

                    // Update Recipe
                    // Get Selling Price from J2 (Row 1, Index 9)
                    const sellingPrice = Number(data[1] && data[1][9]) || 0;

                    // Update DB with exact costs
                    await supabase.from('recipes').update({
                        total_cost: totalCost,
                        selling_price: sellingPrice > 0 ? sellingPrice : undefined
                    }).eq('id', recipeId);

                    console.log(`  [SUCCESS] Updated ${newItems.length} items. Total Cost: ${totalCost}`);
                }
            } else {
                console.log(`  [INFO] No valid items found for ${targetRecipe.name}`);
            }
        }
    }
}

main().catch(console.error);
