
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
                process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
            }
        });
    }
} catch (e) { }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url!, key!);

async function main() {
    console.log("Checking public table...");
    const { count, error } = await supabase
        .from('kpi_manual_entries_v1')
        .select('*', { count: 'exact', head: true });

    console.log("Public Table:", error ? error.message : `Exists, count=${count}`);

    console.log("Checking KPI schema table...");
    const { count: c2, error: e2 } = await supabase
        .schema('kpi')
        .from('kpi_manual_entries_v1')
        .select('*', { count: 'exact', head: true });

    console.log("KPI Table:", e2 ? e2.message : `Exists, count=${c2}`);
}

main();
