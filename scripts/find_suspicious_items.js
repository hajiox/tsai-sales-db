
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('Searching for suspicious ingredients...');

    // Find all items marked as 'ingredient' but having suspicious names
    const { data: items, error: iError } = await supabase
        .from('recipe_items')
        .select('id, recipe_id, item_name, item_type')
        .eq('item_type', 'ingredient')
        .or('item_name.ilike.%送料%,item_name.ilike.%ダンボール%,item_name.ilike.%梱包%,item_name.ilike.%【商品】%');

    if (iError) {
        console.error('Error finding items:', iError);
        return;
    }

    console.log(`Found ${items.length} suspicious items:`);

    // Group by recipe to adjust context if needed, but for now just list unique names
    const uniqueNames = [...new Set(items.map(i => i.item_name))];
    console.log('Unique suspicious item names:');
    uniqueNames.forEach(name => console.log(`- ${name}`));

    // Also check if we can update them in bulk later.
}

main().catch(err => console.error(err));
