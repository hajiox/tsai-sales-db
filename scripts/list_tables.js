
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

async function listTables() {
    // Fetch from information_schema.tables using rpc if available, 
    // but if not, let's try some common names.
    const commonTables = ['ingredients', 'materials', 'recipes', 'recipe_items', 'ingredient_categories', 'settings', 'config', 'app_settings', 'system_config'];

    for (const table of commonTables) {
        const { error } = await supabase.from(table).select('*').limit(1);
        if (!error) {
            console.log(`Table exists: ${table}`);
        } else if (error.code !== '42P01') { // Not undefined table
            console.log(`Table ${table} might exist but returned error: ${error.message}`);
        }
    }
}

listTables();
