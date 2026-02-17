
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env.local
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

async function checkSchema() {
    // There is no direct "describe" but we can try to fetch one row and see keys
    const { data: ing } = await supabase.from('ingredients').select('*').limit(1);
    console.log('Ingredients columns:', Object.keys(ing[0] || {}));

    const { data: mat } = await supabase.from('materials').select('*').limit(1);
    console.log('Materials columns:', Object.keys(mat[0] || {}));

    const { data: recipe } = await supabase.from('recipes').select('*').limit(1);
    console.log('Recipes columns:', Object.keys(recipe[0] || {}));
}

checkSchema();
