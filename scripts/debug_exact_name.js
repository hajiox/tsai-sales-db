
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Checking for 'チャーシューたれ（大）' in recipe_items...");

    // Check specific name without P
    const nameToCheck = 'チャーシューたれ（大）';

    const { data: items, error } = await supabase
        .from('recipe_items')
        .select('item_name, recipe_id, recipes(name)')
        .eq('item_name', nameToCheck);

    if (items && items.length > 0) {
        console.log(`Found ${items.length} items with name "${nameToCheck}":`);
        items.forEach(i => console.log(` - Used in: ${i.recipes?.name}`));
    } else {
        console.log(`No items found with name "${nameToCheck}".`);
    }

    // Check with P
    const nameWithP = '【P】チャーシューたれ（大）';
    const { data: itemsP } = await supabase
        .from('recipe_items')
        .select('item_name, recipe_id, recipes(name)')
        .eq('item_name', nameWithP);

    if (itemsP && itemsP.length > 0) {
        console.log(`Found ${itemsP.length} items with name "${nameWithP}":`);
        itemsP.forEach(i => console.log(` - Used in: ${i.recipes?.name}`));
    } else {
        console.log(`No items found with name "${nameWithP}".`);
    }
}

main().catch(console.error);
