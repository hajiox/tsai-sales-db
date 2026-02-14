
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Checking Recipes columns...");
    const { data, error } = await supabase.from('recipes').select('*').limit(1);

    if (error) {
        console.error("Error:", error.message);
    } else if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]));
    } else {
        console.log("No data found.");
    }
}

main().catch(console.error);
