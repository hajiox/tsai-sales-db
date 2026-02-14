
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Use SERVICE_ROLE_KEY if available to bypass RLS, otherwise use ANON_KEY
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const EXCEL_FILES = [
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）自社.xlsx',
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
            // If C2 is empty, fallback to sheetName
            if (!recipeName) recipeName = sheetName;

            // Clean up recipe name (e.g. remove 【商品】 prefix)
            const cleanRecipeName = cleanName(recipeName).replace(/^【商品】/, '');

            // Find Recipe in DB
            let { data: recipes, error } = await supabase
                .from('recipes')
                .select('id, name')
                .like('name', `%${cleanRecipeName}%`);

            if (!recipes || recipes.length === 0) {
                // Try exact match with original
                ({ data: recipes } = await supabase.from('recipes').select('id, name').eq('name', cleanName(recipeName)));
            }

            if (!recipes || recipes.length === 0) {
                console.warn(`  [SKIP] Recipe not found in DB: ${recipeName} (cleaned: ${cleanRecipeName})`);
                continue;
            }

            // Use the first match
            const targetRecipe = recipes[0];
            const recipeId = targetRecipe.id;
            console.log(`  Syncing Recipe: ${targetRecipe.name} (ID: ${recipeId})`);

            const newItems = [];

            // 1. Ingredients (Start Row 5 / Index 5)
            // Loop until we hit "充填量" or "空白" that is followed by "資材名"
            // Actually, we can just check if row is ingredient or material/expense

            let isMaterialSection = false;

            for (let i = 5; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;

                const nameCol = row[2]; // Col C
                const name = cleanName(nameCol);

                if (!name) continue;
                if (name === 'NO' || name === '空白') continue;
                if (name.includes('小計') || name.includes('原価計')) continue;

                if (name.includes('充填量') || name.includes('歩留まり')) {
                    // End of ingredients
                    continue;
                }

                if (name.includes('資材名') || name.includes('資材・人件費')) {
                    isMaterialSection = true;
                    continue; // Skip header row
                }

                if (name.includes('合計') || name.includes('利益')) continue;

                // Process Item
                let itemType = 'ingredient';
                let unitQty = 0;
                let unitPrice = 0;
                let usage = 0;
                let cost = 0;

                if (!isMaterialSection) {
                    // Ingredients
                    // D(3): 入数, E(4): 単価(込), G(6): 使用量, H(7): 原価
                    unitQty = Number(row[3]) || 0;
                    unitPrice = Number(row[4]) || 0;
                    usage = Number(row[6]) || 0;
                    cost = Number(row[7]) || 0;

                    // If usage is 0, skip? Maybe not, keep it as strict copy

                    itemType = 'ingredient';
                } else {
                    // Materials / Expenses
                    // Typically D(3): Cost per unit
                    // G(6): Usage might happen but often string

                    const valD = Number(row[3]) || 0;

                    cost = valD;
                    usage = 1; // Default
                    unitPrice = valD;
                    unitQty = 1;

                    // Determine type
                    if (name.includes('送料') || name.includes('人件費') || name.includes('手数料')) {
                        itemType = 'expense';
                    } else {
                        itemType = 'material';
                    }
                }

                // Final Check
                if (cost > 0 || usage > 0) {
                    newItems.push({
                        recipe_id: recipeId,
                        item_name: name,
                        item_type: itemType,
                        unit_quantity: unitQty,
                        unit_price: unitPrice,
                        usage_amount: usage,
                        cost: cost
                    });
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

                    await supabase.from('recipes').update({
                        total_cost: totalCost,
                        selling_price: sellingPrice > 0 ? sellingPrice : undefined
                    }).eq('id', recipeId);

                    console.log(`  [SUCCESS] Updated ${newItems.length} items. Total Cost: ${totalCost}`);
                }
            } else {
                console.log(`  [INFO] No items found for ${targetRecipe.name}`);
            }
        }
    }
}

main().catch(console.error);
