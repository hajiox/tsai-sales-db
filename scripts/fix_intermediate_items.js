
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
    console.log("Fixing intermediate items...");

    // 1. Update category to "中間部品" for all intermediate items
    const { error: error1 } = await supabase
        .from('recipes')
        .update({ category: '中間部品' })
        .eq('is_intermediate', true);

    if (error1) {
        console.error("Error updating category for intermediate=true:", error1);
    } else {
        console.log("Updated category to '中間部品' for items with intermediate=true");
    }

    // 2. Update is_intermediate to true for all items in "中間部品" category
    const { error: error2 } = await supabase
        .from('recipes')
        .update({ is_intermediate: true })
        .eq('category', '中間部品');

    if (error2) {
        console.error("Error updating is_intermediate for category='中間部品':", error2);
    } else {
        console.log("Updated is_intermediate to true for items in '中間部品' category");
    }

    console.log("Done.");
}

main();
