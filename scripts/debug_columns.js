
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Checking specific column access...");

    // Test specific columns used in the page
    const { data: iData, error: iError } = await supabase.from('ingredients').select('id, name, price_excl_tax').limit(1);
    console.log(`Ingredients fetch: ${iData ? 'Success' : 'Failed'}. Error: ${iError?.message}`);
    if (iData && iData.length > 0) console.log('Sample Ingredient:', iData[0]);

    const { data: mData, error: mError } = await supabase.from('materials').select('id, name, price_excl_tax').limit(1);
    console.log(`Materials fetch:   ${mData ? 'Success' : 'Failed'}. Error: ${mError?.message}`);
    if (mData && mData.length > 0) console.log('Sample Material:', mData[0]);

    const { data: rData, error: rError } = await supabase.from('recipes').select('id, name, is_intermediate, unit_cost').limit(1);
    console.log(`Recipes fetch:     ${rData ? 'Success' : 'Failed'}. Error: ${rError?.message}`);
    if (rData && rData.length > 0) console.log('Sample Recipe:', rData[0]);
}

main().catch(console.error);
