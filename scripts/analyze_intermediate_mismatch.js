
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    // Check intermediate items
    const { data: intermediates, error: iError } = await supabase
        .from('recipes')
        .select('id, name, category, is_intermediate')
        .eq('is_intermediate', true);

    if (iError) {
        console.error('Error fetching intermediates:', iError);
        return;
    }

    console.log(`Found ${intermediates.length} items with is_intermediate=true`);
    const categoryCounts = {};
    intermediates.forEach(r => {
        categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    });
    console.log('Category distribution for is_intermediate=true:', categoryCounts);

    // Check items in "中間部品" category
    const { data: catIntermediates, error: cError } = await supabase
        .from('recipes')
        .select('id, name, category, is_intermediate')
        .eq('category', '中間部品');

    if (cError) {
        console.error('Error fetching category=中間部品:', cError);
        return;
    }

    console.log(`Found ${catIntermediates.length} items with category='中間部品'`);
    const isInterCounts = {};
    catIntermediates.forEach(r => {
        isInterCounts[r.is_intermediate] = (isInterCounts[r.is_intermediate] || 0) + 1;
    });
    console.log('is_intermediate distribution for category="中間部品":', isInterCounts);
}

main();
