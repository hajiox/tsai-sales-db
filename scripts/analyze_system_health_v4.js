
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAllItems() {
    let allItems = [];
    let from = 0;
    let step = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('recipe_items')
            .select('id, item_name, item_type')
            .range(from, from + step - 1);

        if (error || !data || data.length === 0) break;
        allItems = allItems.concat(data);
        if (data.length < step) break;
        from += step;
    }
    return allItems;
}

async function main() {
    console.log('--- SYSTEM HEALTH CHECK: DATA INTEGRITY ANALYSIS V4 (FULL SCAN) ---');

    console.log('Fetching masters...');
    // Fetch all recipes (assuming < 1000 for now, or just increase limit)
    const { data: recipes } = await supabase.from('recipes').select('id, name, is_intermediate').limit(5000);

    const intermediateMap = new Map();
    recipes.forEach(r => {
        if (r.is_intermediate) {
            intermediateMap.set(r.name, r.id);
        }
    });

    console.log(`Intermediates: ${intermediateMap.size}`);

    console.log('Fetching all recipe items...');
    const items = await getAllItems();
    console.log(`Total items: ${items.length}`);

    let matchCount = 0;
    let fuzzyMatchCount = 0;
    let noMatchIntermediates = []; // Items that look like intermediates but match nothing

    // Helper to normalize strings for comparison
    const normalize = (s) => s.replace(/【.*?】|\[.*?\]/g, '').replace(/\s+/g, '').replace(/[（()）]/g, '').replace(/の/g, '').trim();

    const intermediateNamesNorm = new Set([...intermediateMap.keys()].map(n => normalize(n)));

    // Reverse map for lookup normalized -> original
    const normToOriginal = new Map();
    [...intermediateMap.keys()].forEach(k => normToOriginal.set(normalize(k), k));

    for (const item of items) {
        const name = item.item_name;
        const normName = normalize(name);

        // Check if strict match
        if (intermediateMap.has(name)) {
            matchCount++;
            continue;
        }

        // Check fuzzy match
        if (intermediateNamesNorm.has(normName)) {
            fuzzyMatchCount++;
            // Log significant mismatches
            if (fuzzyMatchCount <= 20) {
                console.log(`Fuzzy Linked: "${name}" -> "${normToOriginal.get(normName)}"`);
            }
        } else {
            // Check if it suspicously looks like an intermediate
            if ((name.includes('たれ') || name.includes('スープ') || name.includes('【P】')) && !name.includes('送料')) {
                noMatchIntermediates.push(name);
            }
        }
    }

    let output = `--- BROKEN LINK ANALYSIS V4 ---\n`;
    output += `Total Items: ${items.length}\n`;
    output += `Strict Links to Intermediates: ${matchCount}\n`;
    output += `Fuzzy Links (Recoverable via normalization): ${fuzzyMatchCount}\n`;
    output += `Potential Broken Links (Looks like intermediate but no match): ${noMatchIntermediates.length}\n`;

    output += `\n--- SAMPLE BROKEN LINKS ---\n`;
    [...new Set(noMatchIntermediates)].slice(0, 20).forEach(n => output += ` - "${n}"\n`);

    fs.writeFileSync('analysis_v4.txt', output);
}

main().catch(console.error);
