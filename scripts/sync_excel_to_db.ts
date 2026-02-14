
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import XLSX from 'xlsx';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EXCEL_FILES = [
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）自社.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）Shopee台湾.xlsx',
    'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）OEM.xlsx'
];

// Helper to normalize strings
const cleanName = (s: any) => String(s || '').trim();

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
            // Skip summary sheets or instructions if any
            if (sheetName.includes('目次') || sheetName.includes('集計')) continue;

            // Try to identify recipe name from sheet content (C2) or sheet name
            // Note: Sheet name often has "【商品】" but C2 is the formal name
            const sheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            // Basic validation
            if (data.length < 5) continue;

            // Get Recipe Name from C2 (Row 1, Col 2)
            let recipeName = data[1]?.[2];
            if (!recipeName) recipeName = sheetName; // Fallback

            // Normalize recipe name (remove 【商品】 prefix for searching if needed, but DB likely has it)
            // Let's try exact match first
            let { data: recipes, error } = await supabase.from('recipes').select('id, name').eq('name', recipeName);

            if (!recipes || recipes.length === 0) {
                // Try fuzzy match or removing prefix
                const clean = recipeName.replace(/^【商品】/, '');
                const { data: fuzzy, error: fError } = await supabase.from('recipes').select('id, name').like('name', `%${clean}%`);
                if (fuzzy && fuzzy.length > 0) {
                    recipes = fuzzy;
                    console.log(`  Matched "${recipeName}" to DB "${recipes[0].name}"`);
                } else {
                    console.warn(`  [SKIP] Recipe not found in DB: ${recipeName}`);
                    continue;
                }
            }

            const recipeId = recipes[0].id;
            console.log(`  Syncing Recipe: ${recipeName} (ID: ${recipeId})`);

            // Extract Items
            const newItems = [];

            // 1. Ingredients (Start Row 5 / Index 5)
            // Assume header is at Row 4 (Index 4)
            // Loop until "空白" or empty
            for (let i = 5; i < data.length; i++) {
                const row = data[i];
                if (!row) continue;

                const name = cleanName(row[2]); // Col C

                if (!name || name === '空白' || name.startsWith('小計') || name.startsWith('原価計') || name.startsWith('資材')) break;
                if (name === 'NO') continue; // Verify header just in case

                // Ingredients columns:
                // D(3): 入数, E(4): 単価(込), G(6): 使用量, H(7): 原価

                const unitQty = Number(row[3]) || 0;
                const unitPrice = Number(row[4]) || 0;
                const usage = Number(row[6]) || 0;
                const cost = Number(row[7]) || 0;

                if (name) {
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
            }

            // 2. Materials/Expenses (Search for header "資材名" or similar)
            let materialStartIndex = -1;
            for (let i = 0; i < data.length; i++) {
                if (data[i] && cleanName(data[i][2]).includes('資材名')) {
                    materialStartIndex = i + 1;
                    break;
                }
            }

            if (materialStartIndex > -1) {
                for (let i = materialStartIndex; i < data.length; i++) {
                    const row = data[i];
                    if (!row) continue;

                    const name = cleanName(row[2]); // Col C
                    if (!name || name === '空白' || name === '合計') continue;

                    // Stop if we hit empty block or next section
                    // Actually materials section might end with "合計"

                    // Materials columns:
                    // D(3): 単価(Cost per unit)
                    // Usage is typically 1 unless specified

                    const cost = Number(row[3]) || 0;
                    let usage = 1;

                    // Check if it's expense or material
                    let type = 'material';
                    if (name.includes('送料') || name.includes('人件費')) type = 'expense';

                    if (name) {
                        newItems.push({
                            recipe_id: recipeId,
                            item_name: name,
                            item_type: type,
                            unit_quantity: 1,
                            unit_price: cost, // For materials, unit price often equals cost
                            usage_amount: usage,
                            cost: cost
                        });
                    }
                }
            }

            // Update DB
            // 1. Delete existing items
            await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);

            // 2. Insert new items
            if (newItems.length > 0) {
                const { error: insError } = await supabase.from('recipe_items').insert(newItems);
                if (insError) {
                    console.error(`  [ERROR] Failed to insert items for ${recipeName}:`, insError);
                } else {
                    // 3. Update Recipe Totals
                    const totalCost = newItems.reduce((sum, item) => sum + item.cost, 0);
                    // Also update selling price etc if available (J2 -> 1000)
                    const sellingPrice = Number(data[1]?.[9]) || 0;

                    await supabase.from('recipes').update({
                        total_cost: totalCost,
                        selling_price: sellingPrice,
                        // Update updated_at?
                    }).eq('id', recipeId);

                    console.log(`  [SUCCESS] Updated ${newItems.length} items. Total Cost: ${totalCost}`);
                }
            }
        }
    }
}

main().catch(console.error);
