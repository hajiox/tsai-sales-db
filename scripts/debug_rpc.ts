
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load Env Robustly
try {
    const envPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        // Split by line, handle both \r\n and \n
        const lines = envFile.split(/\r?\n/);
        lines.forEach(line => {
            // Ignore comments and empty lines
            if (!line || line.startsWith('#')) return;

            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                // Remove surrounding quotes if any
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

console.log("URL:", url ? "Found" : "Missing");
console.log("Key:", key ? "Found" : "Missing");

if (!url || !key) {
    console.error("Credentials missing. Please check .env.local");
    process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
    console.log("Calling get_web_sales_monthly RPC...");
    const { data, error } = await supabase.rpc('get_web_sales_monthly', {
        start_date: '2024-08-01',
        end_date: '2025-08-01'
    });

    if (error) {
        console.error("RPC Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Success:", data);
    }
}

main();
