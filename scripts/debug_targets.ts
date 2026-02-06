
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
} catch (e) {
    console.error("Env load error:", e);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Credentials missing");
    process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
    console.log("Fetching targets...");
    const { data, error } = await supabase
        .schema('kpi')
        .from('kpi_manual_entries_v1')
        .select('channel_code, month, amount')
        .eq('metric', 'target')
        .gte('month', '2023-08-01')
        .lt('month', '2026-08-01');

    if (error) {
        console.error("Fetch Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Success:", data);
    }
}

main();
