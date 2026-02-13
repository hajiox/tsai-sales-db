
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zrerpexdsaxqztqqrwwv.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTM2MDM5OCwiZXhwIjoyMDY0OTM2Mzk4fQ.t_EEN1j29ofXe20utLIV2GTzpEfu0dK8IZ9ZrrNU39Q";
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
