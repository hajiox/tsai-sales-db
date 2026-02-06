
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// 1. Env Loading workaround
try {
    const envPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
            }
        });
    }
} catch (e) { }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Missing credentials");
    process.exit(1);
}

const supabase = createClient(url, key);

async function checkCounts() {
    const tables = ['products', 'web_sales_summary', 'wholesale_sales', 'oem_sales'];

    for (const t of tables) {
        const { count, error } = await supabase
            .from(t)
            .select('*', { count: 'exact', head: true });

        if (error) console.error(`${t} error:`, error.message);
        else console.log(`${t} count:`, count);
    }
}

checkCounts();
