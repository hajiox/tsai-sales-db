
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const min = 520;
    const max = 540;

    console.log(`Searching materials with price between ${min} and ${max}...`);

    const { data: materials, error } = await supabase
        .from('materials')
        .select('*')
        .gte('price', min)
        .lte('price', max);

    if (materials) {
        console.log(`Found ${materials.length} matching materials:`);
        materials.forEach(m => {
            console.log(`- ${m.name} (Price: ${m.price})`);
        });
    } else {
        console.log('Error or no materials:', error);
    }
}

main();
