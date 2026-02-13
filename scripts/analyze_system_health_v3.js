
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
    console.log('--- SYSTEM HEALTH CHECK: DATA INTEGRITY ANALYSIS V3 ---');

    console.log('Fetching masters...');
    const { data: recipes } = await supabase.from('recipes').select('id, name, is_intermediate');

    // Create maps for lookup
    const intermediateMap = new Map();
    const productMap = new Map();

    recipes.forEach(r => {
        if (r.is_intermediate) {
            intermediateMap.set(r.name, r.id);
        } else {
            productMap.set(r.name, r.id);
        }
    });

    console.log(`Intermediates: ${intermediateMap.size}, Products: ${productMap.size}`);

    // Fetch all items that CLAIM to be intermediate or product (based on our fuzzy guess or item_type)
    console.log('Fetching recipe items...');
    // We check ALL items to see if they match an intermediate recipe name
    const { data: items } = await supabase.from('recipe_items').select('id, item_name, item_type');

    let brokenLinkCount = 0;
    let brokenLinks = [];

    // Helper to normalize strings for comparison
    const normalize = (s) => s.replace(/【.*?】|\[.*?\]/g, '').replace(/\s+/g, '').replace(/[（()）]/g, '').replace(/の/g, '').trim();

    const intermediateNamesNorm = new Set([...intermediateMap.keys()].map(n => normalize(n)));

    for (const item of items) {
        // If item name "looks like" it should point to an existing intermediate recipe
        // e.g. contains 'たれ' or 'スープ'
        // AND it doesn't match exactly.

        const name = item.item_name;
        const normName = normalize(name);

        // Is it supposed to be an intermediate?
        // Let's check if the normalized name matches any normalized intermediate recipe name
        if (intermediateNamesNorm.has(normName)) {
            // It matches an intermediate recipe conceptually.
            // But does it match STRICTLY?
            if (!intermediateMap.has(name)) {
                brokenLinkCount++;
                brokenLinks.push({
                    item_name: name,
                    potential_match: [...intermediateMap.keys()].find(k => normalize(k) === normName)
                });
            }
        }
    }

    let output = `--- BROKEN LINK ANALYSIS ---\n`;
    output += `Total items checked: ${items.length}\n`;
    output += `Items strictly matching intermediate names: ${items.filter(i => intermediateMap.has(i.item_name)).length}\n`;
    output += `Items matching intermediate names ONLY via loose fuzzy logic: ${brokenLinkCount}\n`;

    output += `\nSample of Fuzzy Matches (These are what breaks without fuzzy logic):\n`;
    [...new Set(brokenLinks.map(JSON.stringify))].slice(0, 20).forEach(s => {
        const o = JSON.parse(s);
        output += ` - Item: "${o.item_name}"  =>  Recipe: "${o.potential_match}"\n`;
    });

    fs.writeFileSync('analysis_v3.txt', output);
}

main().catch(console.error);
