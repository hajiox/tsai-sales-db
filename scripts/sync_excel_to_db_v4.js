
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
    console.log("Starting DB Sync v4...");

    for (const filePath of EXCEL_FILES) {
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            continue;
        }

        console.log(`Processing file: ${path.basename(filePath)}`);

        try {
            const workbook = XLSX.readFile(filePath);

            for (const sheetName of workbook.SheetNames) {
                if (sheetName.includes('目次') || sheetName.includes('集計') || sheetName.includes('Sheet')) continue;

                try {
                    const sheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (!data || data.length < 5) continue;

                    let recipeName = data[1] && data[1][3];
                    if (!recipeName || recipeName === '商品名') recipeName = sheetName;

                    const cleanRecipeName = cleanName(recipeName).replace(/^【商品】/, '');

                    // console.log(`  Checking Sheet: ${sheetName} -> ${cleanRecipeName}`);

                    let { data: recipes } = await supabase.from('recipes').select('id, name').like('name', `%${cleanRecipeName}%`);
                    if (!recipes || recipes.length === 0) {
                        ({ data: recipes } = await supabase.from('recipes').select('id, name').eq('name', cleanName(sheetName)));
                    }
                    if (!recipes || recipes.length === 0) {
                        const noSpace = cleanRecipeName.replace(/\s+/g, '');
                        if (noSpace !== cleanRecipeName) {
                            ({ data: recipes } = await supabase.from('recipes').select('id, name').like('name', `%${noSpace}%`));
                        }
                    }

                    if (!recipes || recipes.length === 0) {
                        // console.warn(`  [SKIP] Not found in DB: ${cleanRecipeName}`);
                        continue;
                    }

                    const targetRecipe = recipes[0];
                    const recipeId = targetRecipe.id;

                    // Log target recipe update
                    if (targetRecipe.name.includes('焼きそば')) {
                        console.log(`  Updating Target: ${targetRecipe.name}`);
                    }

                    const newItems = [];
                    let section = 'ingredients';

                    for (let i = 5; i < data.length; i++) {
                        const row = data[i];
                        if (!row) continue;

                        const nameCol = row[2];
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
                            unitQty = Number(row[3]) || 0;
                            unitPrice = Number(row[4]) || 0;
                            usage = Number(row[6]) || 0;
                            cost = Number(row[7]) || 0;
                            itemType = 'ingredient';
                        } else if (section === 'materials') {
                            const valD = Number(row[3]);
                            if (isNaN(valD)) continue;

                            cost = valD;
                            usage = 1;
                            unitPrice = valD;
                            unitQty = 1;

                            if (name.includes('送料') || name.includes('人件費') || name.includes('手数料')) {
                                itemType = 'expense';
                            } else {
                                itemType = 'material';
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
                        await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
                        const { error: insError } = await supabase.from('recipe_items').insert(newItems);

                        if (insError) {
                            console.error(`  [ERROR] DB Insert ${targetRecipe.name}: ${insError.message}`);
                        } else {
                            const totalCost = newItems.reduce((acc, item) => acc + (item.cost || 0), 0);
                            const sellingPrice = Number(data[1] && data[1][9]) || 0;

                            await supabase.from('recipes').update({
                                total_cost: totalCost,
                                selling_price: sellingPrice > 0 ? sellingPrice : undefined
                            }).eq('id', recipeId);

                            if (targetRecipe.name.includes('焼きそば')) {
                                console.log(`  [SUCCESS] Updated ${targetRecipe.name}. Total Cost: ${totalCost}`);
                            }
                        }
                    }

                } catch (e) {
                    console.error(`Error processing sheet ${sheetName}:`, e.message);
                }
            }
        } catch (fileError) {
            console.error(`Error processing file ${filePath}:`, fileError.message);
        }
    }
    console.log("DB Sync Completed.");
}

main().catch(console.error);
