
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('--- SYSTEM HEALTH CHECK: DATA INTEGRITY ANALYSIS ---');

    console.log('Fetching masters...');
    const { data: ingredients } = await supabase.from('ingredients').select('name');
    const { data: materials } = await supabase.from('materials').select('name');
    const { data: recipes } = await supabase.from('recipes').select('name, is_intermediate');

    const ingredientNames = new Set(ingredients?.map(i => i.name) || []);
    const materialNames = new Set(materials?.map(m => m.name) || []);
    const recipeNames = new Set(recipes?.map(r => r.name) || []);

    // Normalize Helper
    const normalize = (s) => s.replace(/【.*?】/g, '').replace(/[\[\]]/g, '').replace(/\s+/g, '').replace(/[（()）]/g, '').trim();

    const recipeNamesNorm = new Set([...recipeNames].map(n => normalize(n)));
    const ingredientNamesNorm = new Set([...ingredientNames].map(n => normalize(n)));

    console.log('Fetching all recipe items...');
    const { data: items, error } = await supabase.from('recipe_items').select('id, item_name, item_type, recipe_id');

    if (error || !items) {
        console.error('Error fetching items:', error);
        return;
    }

    console.log(`Total Recipe Items Rows: ${items.length}`);

    let linkedCount = 0;
    let unlinkedCount = 0;
    let intermediateCandidates = [];
    const unlinkedTypes = {};

    for (const item of items) {
        const name = item.item_name;
        const type = item.item_type;
        const normName = normalize(name);

        let isLinked = false;

        // Check against masters
        if (ingredientNames.has(name) || materialNames.has(name) || recipeNames.has(name)) {
            isLinked = true;
        } else if (recipeNamesNorm.has(normName) || ingredientNamesNorm.has(normName)) {
            isLinked = true; // Match via normalization
        }

        if (isLinked) {
            linkedCount++;
        } else {
            unlinkedCount++;
            if (!unlinkedTypes[type]) unlinkedTypes[type] = 0;
            unlinkedTypes[type]++;

            // Check if it LOOKS like an intermediate (contains specific keywords)
            if (name.includes('たれ') || name.includes('スープ') || name.includes('チャーシュー') || name.includes('油') || name.includes('ソース')) {
                intermediateCandidates.push(name);
            }
        }
    }

    // Capture Output into a buffer
    let output = '';
    const log = (msg) => { output += msg + '\n'; console.log(msg); };

    log(`\n--- RESULTS ---`);
    log(`Total: ${items.length}`);
    log(`Linked Items (Exact or Norm Match): ${linkedCount} (${((linkedCount / items.length) * 100).toFixed(1)}%)`);
    log(`Unlinked Items (String Only):       ${unlinkedCount} (${((unlinkedCount / items.length) * 100).toFixed(1)}%)`);

    log(`\n--- UNLINKED BY DECLARED TYPE ---`);
    for (const [type, count] of Object.entries(unlinkedTypes)) {
        log(`${type}: ${count}`);
    }

    log(`\n--- POTENTIAL BROKEN INTERMEDIATES (Top 20 Samples) ---`);
    const uniqueCandidates = [...new Set(intermediateCandidates)].slice(0, 20);
    uniqueCandidates.forEach(c => log(` - ${c}`));

    log(`\n--- SUMMARY ---`);
    log(`The system currently relies on string matching. ${unlinkedCount} rows are "floating" strings that do not strictly match any master record.`);
    log(`Even with fuzzy matching logic, reliability is compromised.`);

    fs.writeFileSync('analysis_result_v2.txt', output);
}

main().catch(console.error);
