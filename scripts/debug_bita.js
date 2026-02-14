
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

// Target file where BUTA1 is likely located
const FILE_PATH = 'c:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）自社.xlsx';
const TARGET_NAME_PART = 'えちご家';

function cleanName(val) {
    if (!val) return '';
    return String(val).trim();
}

async function main() {
    console.log(`Inspecting ${TARGET_NAME_PART} in ${path.basename(FILE_PATH)}`);

    // 1. Excel Data
    const workbook = XLSX.readFile(FILE_PATH);
    let excelData = null;
    let sheetNameFound = '';

    for (const sName of workbook.SheetNames) {
        if (sName.includes(TARGET_NAME_PART)) {
            sheetNameFound = sName;
            excelData = XLSX.utils.sheet_to_json(workbook.Sheets[sName], { header: 1 });
            break;
        }
    }

    if (!excelData) {
        console.error("Sheet not found in Excel");
        console.log("Available sheets:", workbook.SheetNames.slice(0, 10)); // First 10
        const matched = workbook.SheetNames.filter(s => s.includes('えちご'));
        console.log("Potentially matching sheets:", matched);
        return;
    }

    console.log(`Found Sheet: ${sheetNameFound}`);

    console.log("--- Excel Items ---");
    let section = 'ingredients';
    let excelTotal = 0;

    for (let i = 5; i < excelData.length; i++) {
        const row = excelData[i];
        if (!row) continue;
        const name = cleanName(row[2]);

        if (name.includes('充填量') || name.includes('歩留まり') || name.includes('小計') || name.includes('原価計')) {
            if (section === 'ingredients') section = 'gap';
            continue;
        }
        if (name.includes('資材名') || name.includes('資材・人件費')) {
            section = 'materials';
            continue;
        }
        if (!name || name === 'NO' || name === '空白' || name.startsWith('合計') || name.startsWith('利益')) continue;

        let cost = 0;
        let usage = 0;

        if (section === 'ingredients') {
            cost = Number(row[7]);
            usage = Number(row[6]);
        } else if (section === 'materials') {
            cost = Number(row[3]);
            usage = 1;
        }

        if (cost > 0) {
            console.log(`[${section}] ${name}: ¥${cost} (Usage: ${usage})`);
            excelTotal += cost;
        }
    }
    console.log(`Excel Total: ¥${excelTotal}`);


    // 2. DB Data
    console.log("\n--- DB Items ---");
    const { data: recipes } = await supabase.from('recipes').select('id, name, total_cost').like('name', `%${TARGET_NAME_PART}%`);

    if (!recipes || recipes.length === 0) {
        console.error("Recipe not found in DB");
        return;
    }

    const recipe = recipes[0];
    console.log(`DB Recipe: ${recipe.name} (Total: ¥${recipe.total_cost})`);

    const { data: items } = await supabase.from('recipe_items').select('*').eq('recipe_id', recipe.id).order('item_type');

    let dbTotal = 0;
    items.forEach(item => {
        console.log(`[${item.item_type}] ${item.item_name}: ¥${item.cost} (Usage: ${item.usage_amount})`);
        dbTotal += Number(item.cost);
    });

    console.log(`DB Total Calc: ¥${dbTotal}`);
    console.log(`Diff: ¥${Math.abs(excelTotal - dbTotal).toFixed(2)}`);
}

main().catch(console.error);
