
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('Checking intermediate usage data...');

    // 1. Get intermediate recipes
    const { data: intermediates, error: rError } = await supabase
        .from('recipes')
        .select('id, name')
        .eq('is_intermediate', true)
        .limit(10); // Check a few

    if (rError) {
        console.error('Error getting intermediates:', rError);
        return;
    }

    console.log(`Found ${intermediates.length} intermediates.`);

    // 2. For each, try to find it in recipe_items
    for (const intermediate of intermediates) {
        console.log(`\nChecking usages for: "${intermediate.name}"`);

        // Exact match
        const { count: exactCount, error: eError } = await supabase
            .from('recipe_items')
            .select('*', { count: 'exact', head: true })
            .eq('item_name', intermediate.name);

        console.log(`  Exact matches in recipe_items: ${exactCount}`);

        // Fuzzy match (without 【P】 or different parens)
        if (exactCount === 0) {
            // clean name for fuzzy search
            const cleanName = intermediate.name
                .replace('【P】', '')
                .replace('【p】', '')
                .trim();

            console.log(`  Searching for cleaned name: "${cleanName}"`);

            const { data: fuzzyItems, error: fError } = await supabase
                .from('recipe_items')
                .select('item_name, recipe_id')
                .ilike('item_name', `%${cleanName}%`) // Partial match
                .limit(5);

            if (fuzzyItems && fuzzyItems.length > 0) {
                console.log(`  Found potential variations:`);
                fuzzyItems.forEach(i => console.log(`    - "${i.item_name}"`));
            } else {
                console.log('  No fuzzy matches found either.');
            }
        }
    }
}

main().catch(err => console.error(err));
