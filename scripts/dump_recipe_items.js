
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Dumping items for 'チャーシュー飯'...");

    // Find recipe ID
    const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name')
        .ilike('name', '%チャーシュー飯%');

    if (!recipes || recipes.length === 0) {
        console.log("Recipe not found");
        return;
    }

    const recipe = recipes[0];
    console.log(`Found Recipe: ${recipe.name}`);

    const { data: items } = await supabase
        .from('recipe_items')
        .select('*')
        .eq('recipe_id', recipe.id);

    if (items) {
        items.forEach(i => {
            console.log(`TYPE: [${i.item_type}] NAME: "${i.item_name}"`);
        });
    }
}

main().catch(console.error);
