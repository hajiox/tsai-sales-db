
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching recipe_items for 'チャーシューたれ'...");

    const { data: items } = await supabase
        .from('recipe_items')
        .select('item_name, item_type, recipe_id')
        .ilike('item_name', '%チャーシューたれ%');

    if (!items || items.length === 0) {
        console.log("No items found with 'チャーシューたれ'.");
    } else {
        console.log(`Found ${items.length} items:`);
        items.forEach(i => console.log(` - name: "${i.item_name}", type: ${i.item_type}`));
    }

    console.log("\nSearching recipes (is_intermediate=true) for 'チャーシューたれ'...");

    const { data: recipes } = await supabase
        .from('recipes')
        .select('name')
        .ilike('name', '%チャーシューたれ%')
        .eq('is_intermediate', true);

    if (recipes) {
        recipes.forEach(r => console.log(` - Recipe: "${r.name}"`));
    }
}

main().catch(console.error);
