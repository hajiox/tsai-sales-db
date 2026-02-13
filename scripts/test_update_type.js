
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('Testing update to item_type "product"...');

    // Find one item to test with
    const { data: items } = await supabase
        .from('recipe_items')
        .select('id, item_name')
        .ilike('item_name', '【商品】%')
        .limit(1);

    if (!items || items.length === 0) {
        console.log('No [Product] items found to test.');
        return;
    }

    const item = items[0];
    console.log(`Testing on item: ${item.item_name} (ID: ${item.id})`);

    const { error } = await supabase
        .from('recipe_items')
        .update({ item_type: 'product' })
        .eq('id', item.id);

    if (error) {
        console.error('Update failed:', error);
    } else {
        console.log('Update successful! "product" is a valid item_type.');
        // Revert it back for now or leave it
        // await supabase.from('recipe_items').update({ item_type: 'ingredient' }).eq('id', item.id);
    }
}

main().catch(err => console.error(err));
