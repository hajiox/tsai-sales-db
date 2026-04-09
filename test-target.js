const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('kpi_manual_entries_v1')
    .select('*')
    .eq('metric', 'target')
    .eq('month', '2026-03-01');
  
  if (error) console.error(error);
  else console.log(data);
}
main();
