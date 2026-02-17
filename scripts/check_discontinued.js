
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
    const { count, error } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })
        .eq('category', '終売');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${count} recipes in "終売" category.`);
    }

    const { data: recipes } = await supabase.from('recipes').select('name').eq('category', '終売').limit(5);
    console.log('Sample recipes:', recipes);
}

main();
