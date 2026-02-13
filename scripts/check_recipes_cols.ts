
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching recipes:', error);
    } else {
        console.log('Recipe columns:');
        Object.keys(data[0] || {}).forEach(k => console.log(`  - ${k}`));
    }
}
check();
