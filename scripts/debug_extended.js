
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('--- EXTENDED DEBUGGING ---');

    // 1. First, just LIST all items in recipe_items that might be related to 'チャーシュー'
    console.log("Listing items containing 'チャーシュー'...");
    const { data: rawItems } = await supabase
        .from('recipe_items')
        .select('item_name, item_type, recipe_id')
        .ilike('item_name', '%チャーシュー%')
        .limit(20);

    if (rawItems) {
        rawItems.forEach(i => console.log(` - [${i.item_type}] ${i.item_name} (in recipe: ${i.recipe_id})`));
    }

    // 2. Check the exact name of the intermediate recipe
    console.log("\nChecking intermediate recipe name exactness...");
    const { data: recipes } = await supabase
        .from('recipes')
        .select('name')
        .ilike('name', '%チャーシューたれ%')
        .eq('is_intermediate', true);

    if (recipes) {
        recipes.forEach(r => console.log(` - Recipe Name: "${r.name}"`));
    }
}

main().catch(console.error);
