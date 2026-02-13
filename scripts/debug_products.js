
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    // 1. Find a recipe that SHOULD contain Chashu Sauce
    console.log("Searching for 'チャーシュー' recipes...");
    const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name')
        .ilike('name', '%チャーシュー%')
        .eq('is_intermediate', false) // Not intermediate, so final products
        .limit(5);

    if (!recipes || recipes.length === 0) {
        console.log("No product recipes found for チャーシュー.");
        return;
    }

    // 2. Dump items for these recipes
    for (const r of recipes) {
        console.log(`\nRecipe: ${r.name} (ID: ${r.id})`);
        const { data: items } = await supabase
            .from('recipe_items')
            .select('*')
            .eq('recipe_id', r.id);

        items.forEach(i => {
            console.log(`  - [${i.item_type}] ${i.item_name} (Cost: ${i.cost})`);
        });
    }
}

main().catch(console.error);
