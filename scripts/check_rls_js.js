
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Use ANON key to simulate client-side fetch
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Checking Anon Access...");

    const t1 = Date.now();
    const { data: recipes, error: rError } = await supabase.from('recipes').select('id, name').limit(5);
    console.log(`Recipes: ${recipes?.length || 0} items. Error:`, rError?.message || 'None');

    const { data: ingredients, error: iError } = await supabase.from('ingredients').select('id, name').limit(5);
    console.log(`Ingredients: ${ingredients?.length || 0} items. Error:`, iError?.message || 'None');

    const { data: materials, error: mError } = await supabase.from('materials').select('id, name').limit(5);
    console.log(`Materials: ${materials?.length || 0} items. Error:`, mError?.message || 'None');

    console.log(`Time taken: ${Date.now() - t1}ms`);
}

main().catch(console.error);
