
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

async function checkPrices() {
    const { data, error } = await supabase
        .from('ingredients')
        .select('name, price, unit_quantity')
        .limit(20);

    if (error) {
        console.error(error);
        return;
    }

    console.log('Ingredients:');
    data.forEach(i => {
        console.log(`${i.name}: ${i.price} yen / ${i.unit_quantity}g`);
    });

    const { data: mats, error: mError } = await supabase
        .from('materials')
        .select('name, price, unit_quantity')
        .limit(20);

    if (mError) {
        console.error(mError);
        return;
    }

    console.log('\nMaterials:');
    mats.forEach(m => {
        console.log(`${m.name}: ${m.price} yen / ${m.unit_quantity}`);
    });
}

checkPrices();
