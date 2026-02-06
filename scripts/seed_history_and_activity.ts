
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

// Data from Excel Analysis

// Sales Activity (Acquisition) - FY2026 (Aug 2025 - Jul 2026)
// Targets: Row 32: 30,30,30,30,30,40,40,40,50,50,60,60
// Actuals: Row 33: 19,20,12,19,23,4 (Aug-Jan)
const activity = {
    targets: [30, 30, 30, 30, 30, 40, 40, 40, 50, 50, 60, 60],
    actuals: [19, 20, 12, 19, 23, 4]
};

// Historical Actuals (FY2025: Aug 2024 - Jul 2025)
// Data extracted from rows:
// Shoku (Row 2): 4177050, 3805000, 4422950, 4029050, 3026900, 2610550, 2094050, 3500300, 3986350, 4083190, 3819180, 3386340
// Store (Row 8): 2608140, 1763674, 1663488, 1613378, 2281959, 724005, 417964, 1136753, 1427380, 2031346, 1245518, 1442913
// Web (Row 14): 8154748, 8563368, 10334422, 10711811, 10838165, 8660921, 8986986, 11713330, 10414186, 10121663, 10421260, 12384889
// Wholesale (Row 20): 5358755, 4127284, 4865076, 4483231, 4368122, 2795510, 2170500, 3500300, 6393226, 3799349, 2926525, 4050523

const history = {
    SHOKU: [4177050, 3805000, 4422950, 4029050, 3026900, 2610550, 2094050, 3500300, 3986350, 4083190, 3819180, 3386340],
    STORE: [2608140, 1763674, 1663488, 1613378, 2281959, 724005, 417964, 1136753, 1427380, 2031346, 1245518, 1442913],
    WEB: [8154748, 8563368, 10334422, 10711811, 10838165, 8660921, 8986986, 11713330, 10414186, 10121663, 10421260, 12384889],
    WHOLESALE: [5358755, 4127284, 4865076, 4483231, 4368122, 2795510, 2170500, 3500300, 6393226, 3799349, 2926525, 4050523]
};

async function seed() {
    console.log('Seeding History & Activity...');
    const entries = [];

    // 1. Sales Activity (Acquisition) - FY2026 (YYYY-08-01 start)
    // FY2026 starts Aug 2025.
    for (let i = 0; i < 12; i++) {
        const month = i < 5 ? 8 + i : i - 4; // 8,9,10,11,12, 1,2,3,4,5,6,7
        const year = i < 5 ? 2025 : 2026;
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;

        // Target
        entries.push({
            metric: 'acquisition_target',
            channel_code: 'SALES_TEAM',
            month: dateStr,
            amount: activity.targets[i],
            updated_at: new Date().toISOString()
        });

        // Actual (if exists)
        if (i < activity.actuals.length) {
            entries.push({
                metric: 'acquisition_actual',
                channel_code: 'SALES_TEAM',
                month: dateStr,
                amount: activity.actuals[i],
                updated_at: new Date().toISOString()
            });
        }
    }

    // 2. Historical Actuals - FY2025 (YYYY-08-01 start)
    // FY2025 starts Aug 2024.
    for (const [channel, amounts] of Object.entries(history)) {
        for (let i = 0; i < 12; i++) {
            const month = i < 5 ? 8 + i : i - 4;
            const year = i < 5 ? 2024 : 2025;
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;

            entries.push({
                metric: 'historical_actual',
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
