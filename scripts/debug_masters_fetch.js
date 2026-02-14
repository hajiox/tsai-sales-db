
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Checking Master Data Counts and Fetch...");

    const tStart = Date.now();

    // 1. Check Counts
    const { count: cRecipes, error: eRecipes } = await supabase.from('recipes').select('*', { count: 'exact', head: true });
    console.log(`Recipes Count: ${cRecipes} (Error: ${eRecipes?.message})`);

    const { count: cIngredients, error: eIngredients } = await supabase.from('ingredients').select('*', { count: 'exact', head: true });
    console.log(`Ingredients Count: ${cIngredients} (Error: ${eIngredients?.message})`);

    const { count: cMaterials, error: eMaterials } = await supabase.from('materials').select('*', { count: 'exact', head: true });
    console.log(`Materials Count: ${cMaterials} (Error: ${eMaterials?.message})`);

    // 2. Try Fetching All (Simulation of frontend logic)
    console.log("\nSimulating frontend fetch...");
    const tFetch = Date.now();

    // Using simple select without limit to see if it works or times out/errors
    const p1 = supabase.from('ingredients').select('id, name');
    const p2 = supabase.from('materials').select('id, name');
    const p3 = supabase.from('recipes').select('id, name, is_intermediate');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    console.log(`Fetch Ingredients: ${r1.data?.length} items. Error: ${r1.error?.message}`);
    console.log(`Fetch Materials:   ${r2.data?.length} items. Error: ${r2.error?.message}`);
    console.log(`Fetch Recipes:     ${r3.data?.length} items. Error: ${r3.error?.message}`);

    console.log(`Total Fetch Time: ${Date.now() - tFetch}ms`);
}

main().catch(console.error);
