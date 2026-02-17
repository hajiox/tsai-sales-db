
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

async function addTaxColumn() {
    try {
        console.log("Checking if tax_included column exists...");
        // This is a hacky way to run SQL if the service role has permissions, but Supabase JS client doesn't support 'query'
        // We'll try to insert a row with tax_included to see if it works, or fetch it.

        // Actually, let's just try to update a column that doesn't exist and catch error.
        const { error: ingError } = await supabase.from('ingredients').select('tax_included').limit(1);
        if (ingError && ingError.code === '42703') { // Undefined column
            console.log("Column 'tax_included' does not exist in ingredients. Please add it via SQL:");
            console.log("ALTER TABLE ingredients ADD COLUMN tax_included BOOLEAN DEFAULT TRUE;");
            console.log("ALTER TABLE materials ADD COLUMN tax_included BOOLEAN DEFAULT TRUE;");
        } else if (!ingError) {
            console.log("Column 'tax_included' already exists in ingredients.");
        }

        const { error: matError } = await supabase.from('materials').select('tax_included').limit(1);
        if (matError && matError.code === '42703') {
            console.log("Column 'tax_included' does not exist in materials.");
        } else if (!matError) {
            console.log("Column 'tax_included' already exists in materials.");
        }
    } catch (e) {
        console.error(e);
    }
}

addTaxColumn();
