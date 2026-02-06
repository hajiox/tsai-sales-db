
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, ...values] = line.split('=');
        if (key && values.length > 0) {
            process.env[key.trim()] = values.join('=').trim();
        }
    });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Targets for FY2026 (Aug 2025 - Jul 2026)
// Data extracted from Excel Analysis
const targets = {
    // Row 3
    SHOKU: [4300000, 4000000, 4600000, 4300000, 3100000, 2800000, 2600000, 3700000, 4100000, 4200000, 4000000, 3500000],
    // Row 9
    STORE: [2500000, 1800000, 1800000, 1800000, 1800000, 1200000, 1200000, 1400000, 1500000, 2200000, 1800000, 1800000],
    // Row 15
    WEB: [11000000, 11000000, 12000000, 12000000, 14000000, 14000000, 14000000, 15000000, 15500000, 15500000, 15500000, 16000000],
    // Row 21
    WHOLESALE: [6000000, 5000000, 5000000, 5500000, 6000000, 5000000, 5000000, 5000000, 7000000, 6000000, 6000000, 7000000]
};

async function seed() {
    console.log('Seeding FY2026 Targets...');
    const entries = [];

    for (const [channel, amounts] of Object.entries(targets)) {
        for (let i = 0; i < 12; i++) {
            const month = i < 5 ? 8 + i : i - 4; // 8,9,10,11,12, 1,2,3,4,5,6,7
            const year = i < 5 ? 2025 : 2026;
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;

            entries.push({
                metric: 'target',
                channel_code: channel,
                month: dateStr,
                amount: amounts[i],
                updated_at: new Date().toISOString()
            });
        }
    }

    // Upsert
    console.log(`Preparing to upsert ${entries.length} entries...`);
    const { error } = await supabase
        .from('kpi_manual_entries_v1')
        .upsert(entries, { onConflict: 'metric,channel_code,month' });

    if (error) {
        console.error('Error seeding:', error);
    } else {
        console.log('Success!');
    }
}

seed();
