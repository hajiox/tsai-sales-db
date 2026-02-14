
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    const targetName = '【商品】極太麺焼きそば＆ソース4食';
    console.log(`Checking recipe: ${targetName}`);

    // Fetch Recipe
    const { data: recipe, error: rError } = await supabase
        .from('recipes')
        .select('*')
        .like('name', `%極太麺焼きそば＆ソース4食%`)
        .single();

    if (rError || !recipe) {
        console.error("Recipe not found or error:", rError);
        return;
    }

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
