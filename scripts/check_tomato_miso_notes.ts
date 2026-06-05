
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('recipes')
        .select('name, manufacturing_notes')
        .ilike('name', '%トマト味噌%')
        .limit(1)
        .single();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Recipe: ${data.name}`);
        console.log('Notes Length:', data.manufacturing_notes ? data.manufacturing_notes.length : 0);
        console.log('Notes Preview:', data.manufacturing_notes);
    }
}
check();
