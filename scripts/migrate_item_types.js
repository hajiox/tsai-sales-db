
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('Migrating item types...');

    // 1. Move [Product] items to 'product' type
    const { error: pError, count: pCount } = await supabase
        .from('recipe_items')
        .update({ item_type: 'product' })
        .ilike('item_name', '【商品】%')
        .eq('item_type', 'ingredient'); // Only migrate if currently ingredient (or other wrong type)

    if (pError) console.error('Error migrating products:', pError);
    else console.log(`Migrated products.`); // count not returned by update without select

    // 2. Move Shipping/Labor to 'expense'
    const expenseKeywords = ['送料', '人件費', '手数料'];
    for (const keyword of expenseKeywords) {
        const { error: eError } = await supabase
            .from('recipe_items')
            .update({ item_type: 'expense' })
            .ilike('item_name', `%${keyword}%`)
            .in('item_type', ['ingredient', 'material']); // Target wrong types

        if (eError) console.error(`Error migrating expenses (${keyword}):`, eError);
        else console.log(`Migrated expenses for keyword: ${keyword}`);
    }

    // 3. Move Cardboard/Packing to 'material'
    const materialKeywords = ['ダンボール', '梱包', '資材'];
    for (const keyword of materialKeywords) {
        const { error: mError } = await supabase
            .from('recipe_items')
            .update({ item_type: 'material' })
            .ilike('item_name', `%${keyword}%`)
            .in('item_type', ['ingredient']); // Target wrong types

        if (mError) console.error(`Error migrating materials (${keyword}):`, mError);
        else console.log(`Migrated materials for keyword: ${keyword}`);
    }

    console.log('Migration complete.');
}

main().catch(err => console.error(err));
