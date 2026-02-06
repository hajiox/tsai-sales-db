
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load Env Robustly
try {
    const envPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        const lines = envFile.split(/\r?\n/);
        lines.forEach(line => {
            if (!line || line.startsWith('#')) return;
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                process.env[key] = value;
            }
        });
    }
} catch (e) { }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url!, key!);

async function main() {
    console.log("Listing tables...");

    // We can't list tables easily via client without permissions?
    // Try selecting from possible locations

    const locs = [
        { schema: 'public', table: 'kpi_manual_entries_v1' },
        { schema: 'kpi', table: 'kpi_manual_entries_v1' }
    ];

    for (const l of locs) {
        const { count, error } = await supabase.schema(l.schema).from(l.table).select('*', { count: 'exact', head: true });
        console.log(`${l.schema}.${l.table}:`, error ? error.message : `Exists, count=${count}`);
    }
}

main();
