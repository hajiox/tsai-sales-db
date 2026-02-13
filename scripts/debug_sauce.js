
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching for any item with 'たれ'...");

    const { data: items } = await supabase
        .from('recipe_items')
        .select('item_name, item_type')
        .ilike('item_name', '%たれ%')
        .limit(50);

    if (items) {
        // Unique names
        const names = [...new Set(items.map(i => i.item_name))];
        console.log(`Found ${names.length} unique names with 'たれ':`);
        names.forEach(n => console.log(` - "${n}"`));
    }
}

main().catch(console.error);
