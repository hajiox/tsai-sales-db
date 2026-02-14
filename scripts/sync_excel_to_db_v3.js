
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

// All Excel files
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

            if (!data || data.length < 5) continue;

            // Try to find Recipe Name
            // Row 1 (Index 1), Col D (Index 3) usually contains the name
            let recipeName = data[1] && data[1][3];

            // If empty or seems like a label, fallback to sheet name
            if (!recipeName || recipeName === '商品名') recipeName = sheetName;

            const cleanRecipeName = cleanName(recipeName).replace(/^【商品】/, '');

            // Find Recipe in DB
            let { data: recipes } = await supabase.from('recipes').select('id, name').like('name', `%${cleanRecipeName}%`);

            if (!recipes || recipes.length === 0) {
                // Try exact match with sheet name
                ({ data: recipes } = await supabase.from('recipes').select('id, name').eq('name', cleanName(sheetName)));
            }

            if (!recipes || recipes.length === 0) {
                // Try fuzzy match with remove spaces
                const noSpace = cleanRecipeName.replace(/\s+/g, '');
                if (noSpace !== cleanRecipeName) {
                    ({ data: recipes } = await supabase.from('recipes').select('id, name').like('name', `%${noSpace}%`));
                }
            }

            if (!recipes || recipes.length === 0) {
                // If still not found, log warn and skip
                // console.warn(`  [SKIP] Recipe not found in DB: ${recipeName} (cleaned: ${cleanRecipeName})`);
                continue;
            }

            const targetRecipe = recipes[0];
            const recipeId = targetRecipe.id;
            console.log(`  Syncing Recipe: ${targetRecipe.name} (ID: ${recipeId})`);

            const newItems = [];
            let section = 'ingredients';

            for (let i = 5; i < data.length; i++) {
                const row = data[i];
                if (!row) continue;

                const nameCol = row[2]; // Col C
                const name = cleanName(nameCol);

                if (name.includes('充填量') || name.includes('歩留まり') || name.includes('小計') || name.includes('原価計')) {
                    if (section === 'ingredients') section = 'gap';
                    continue;
                }

                if (name.includes('資材名') || name.includes('資材・人件費')) {
                    section = 'materials';
                    continue;
                }

                if (!name || name === 'NO' || name === '空白' || name.startsWith('合計') || name.startsWith('利益')) continue;

                let itemType = 'ingredient';
                let unitQty = 0;
                let unitPrice = 0;
                let usage = 0;
                let cost = 0;

                if (section === 'ingredients') {
                    // Ingredients
                    // D(3): 入数
                    // E(4): 単価(込)
                    // G(6): 使用量
                    // H(7): 原価
                    unitQty = Number(row[3]) || 0;
                    unitPrice = Number(row[4]) || 0;
                    usage = Number(row[6]) || 0;
                    cost = Number(row[7]) || 0;

                    itemType = 'ingredient';
                } else if (section === 'materials') {
                    // Materials
                    // D(3): Cost per unit (単価)
                    // Usage is typically 1 unless G(6) has explicit number (unlikely here based on previous dump)

                    const valD = Number(row[3]);
                    // Only use if valD is a valid number
                    if (isNaN(valD)) continue;

                    cost = valD;
                    usage = 1;
                    unitPrice = valD;
                    unitQty = 1;
                    itemType = 'material';

                    if (name.includes('送料') || name.includes('人件費') || name.includes('手数料')) {
                        itemType = 'expense';
                    }
                } else {
                    continue;
                }

                if ((cost > 0 || usage > 0) && !isNaN(cost)) {
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

            if (newItems.length > 0) {
                // Delete old items
                await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);

                // Insert new
                const { error: insError } = await supabase.from('recipe_items').insert(newItems);

                if (insError) {
                    console.error(`  [ERROR] insert items: ${insError.message}`);
                } else {
                    const totalCost = newItems.reduce((acc, item) => acc + (item.cost || 0), 0);
                    const sellingPrice = Number(data[1] && data[1][9]) || 0;

                    await supabase.from('recipes').update({
                        total_cost: totalCost,
                        selling_price: sellingPrice > 0 ? sellingPrice : undefined
                    }).eq('id', recipeId);

                    // console.log(`  [SUCCESS] Updated ${newItems.length} items. Total Cost: ${totalCost}`);
                }
            }
        }
    }
    console.log("DB Sync Completed.");
}

main().catch(console.error);
