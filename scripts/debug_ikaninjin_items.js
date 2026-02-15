
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Searching for recipe...');
    // Search for the recipe
    const { data: recipes, error: rError } = await supabase
        .from('recipes')
        .select('*')
        .ilike('name', '%イカ人参%')
        .limit(1);

    if (rError) {
        console.error('Recipe error:', rError);
        return;
    }

    if (!recipes || recipes.length === 0) {
        console.log('Recipe not found');
        return;
    }
    const recipe = recipes[0];
    console.log(`Recipe: ${recipe.name} (${recipe.id})`);

    // Get items
    const { data: items, error: iError } = await supabase
        .from('recipe_items')
        .select('*')
        .eq('recipe_id', recipe.id);

    if (iError) {
        console.error('Item error:', iError);
        return;
    }

    // Find items that might be caps
    const caps = items.filter(i => i.item_name.includes('キャップ') || i.item_name.includes('43RTS-D'));
    console.log(`Found ${caps.length} potential cap items.`);

    caps.forEach(cap => {
        console.log('--- Cap Item Details ---');
        console.log(`ID: ${cap.id}`);
        console.log(`Name: ${cap.item_name}`);
        console.log(`Type: ${cap.item_type}`);
        console.log(`Unit Qty: ${cap.unit_quantity} (raw: ${typeof cap.unit_quantity} ${cap.unit_quantity})`);
        console.log(`Unit Price: ${cap.unit_price} (raw: ${typeof cap.unit_price} ${cap.unit_price})`);
        console.log(`Usage Amount: ${cap.usage_amount} (raw: ${typeof cap.usage_amount} ${cap.usage_amount})`);
        console.log(`Cost: ${cap.cost} (raw: ${typeof cap.cost} ${cap.cost})`);

        // Check if item_name exists in material master
        checkMaterial(cap.item_name).then(m => {
            if (m) {
                console.log(`\nMaster Data for "${cap.item_name}":`);
                console.log(`  Name: ${m.name}`);
                console.log(`  Price: ${m.price}`);
                console.log(`  Unit Qty: ${m.unit_quantity}`);
                console.log(`  Should be Cost: ${Math.round(1 * (m.price || 0))}`);
            } else {
                console.log(`\nMaster Data NOT FOUND for "${cap.item_name}"`);
            }
        });
    });
}

async function checkMaterial(name) {
    const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('name', name)
        .single();
    if (error && error.code !== 'PGRST116') console.error('Material API error:', error);
    return data;
}

main();
