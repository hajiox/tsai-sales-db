
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Service Role Key is needed? Maybe fine if anon key.
// But we want to read everything. Let's use service key if available.
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const targetName = '【商品】極太麺焼きそば＆ソース4食';
    console.log(`Checking recipe: ${targetName}`);

    // Fetch Recipe
    const { data: recipes, error: rError } = await supabase
        .from('recipes')
        .select('*')
        .like('name', `%極太麺焼きそば＆ソース4食%`);

    if (rError || !recipes || recipes.length == 0) {
        console.error("Recipe not found or error:", rError);
        return;
    }

    // Check multiple hits
    console.log(`Found ${recipes.length} recipes.`);

    const recipe = recipes[0];
    console.log(`Recipe ID: ${recipe.id}`);
    console.log(`Recipe Name: ${recipe.name}`);
    console.log(`Category: ${recipe.category}`);
    console.log(`Selling Price: ${recipe.selling_price}`);
    console.log(`Total Cost: ${recipe.total_cost}`);
    console.log(`Source File: ${recipe.source_file}`);

    // Fetch Items
    const { data: items, error: iError } = await supabase
        .from('recipe_items')
        .select('*')
        .eq('recipe_id', recipe.id);

    if (iError) {
        console.error("Error fetching items:", iError);
        return;
    }

    console.log(`\nItems (${items.length}):`);
    items.forEach((item, idx) => {
        console.log(`${idx + 1}. [${item.item_type}] ${item.item_name}`);
        console.log(`   Usage Amount: ${item.usage_amount}`);
        console.log(`   Unit Quantity: ${item.unit_quantity}`);
        console.log(`   Cost: ${item.cost}`);
        console.log(`   Unit Price: ${item.unit_price}`);
    });
}

main().catch(console.error);
