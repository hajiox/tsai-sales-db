
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

const data = {
    fy2025_actuals: [35810, 32912, 50300, 47083, 58329, 31761, 40564, 36986, 56216, 55852, 48327, 45270],
    fy2026_targets: [40000, 45000, 55000, 60000, 65000, 50000, 55000, 55000, 60000, 65000, 65000, 70000],
    fy2026_actuals: [33583, 36587, 51102, 67290, 47856, 42580] // Only Aug-Jan
};

async function seed() {
    console.log('Seeding Manufacturing KPI...');

    const entries = [];

    // FY2025 Actuals (Metric: manufacturing_actual)
    // FY2025 Aug = 2024-08-01
    for (let i = 0; i < 12; i++) {
        const month = i < 5 ? 8 + i : i - 4; // 8,9,10,11,12, 1,2,3,4,5,6,7
        const year = i < 5 ? 2024 : 2025;
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;

        entries.push({
            metric: 'manufacturing_actual',
            channel_code: 'FACTORY', // Dummy channel or specific? 'FACTORY' seems appropriate
            month: dateStr,
            amount: data.fy2025_actuals[i],
            updated_at: new Date().toISOString()
        });
    }

    // FY2026 Targets (Metric: manufacturing_target)
    // FY2026 Aug = 2025-08-01
    for (let i = 0; i < 12; i++) {
        const month = i < 5 ? 8 + i : i - 4;
        const year = i < 5 ? 2025 : 2026;
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;

        entries.push({
            metric: 'manufacturing_target',
            channel_code: 'FACTORY',
            month: dateStr,
            amount: data.fy2026_targets[i],
            updated_at: new Date().toISOString()
        });
    }

    // FY2026 Actuals (Metric: manufacturing_actual)
    // Overwrites if needed (though current list is partial)
    for (let i = 0; i < data.fy2026_actuals.length; i++) {
        const month = i < 5 ? 8 + i : i - 4;
        const year = i < 5 ? 2025 : 2026;
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;

        entries.push({
            metric: 'manufacturing_actual',
            channel_code: 'FACTORY',
            month: dateStr,
            amount: data.fy2026_actuals[i],
            updated_at: new Date().toISOString()
        });
    }

    // Insert/Upsert
    const { error } = await supabase
        .from('kpi_manual_entries_v1')
        .upsert(entries, { onConflict: 'metric,channel_code,month' });

    if (error) {
        console.error('Error seeding:', error);
    } else {
        console.log(`Successfully seeded ${entries.length} entries.`);
    }
}

seed();
