
import { getKpiSummary } from '../app/kpi/actions';
import fs from 'fs';
import path from 'path';

// Helper to load env for standalone execution
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
} catch (e) {
    console.log('Error loading .env.local', e);
}

// Mocking Next.js cache/revalidate if needed, 
// but getKpiSummary mainly uses 'pool' which should work if env is set.

async function main() {
    try {
        const fy = 2026; // Current FY
        console.log(`Fetching KPI Summary for FY${fy}...`);

        const summary = await getKpiSummary(fy);

        console.log(`\n=== KPI Summary FY${summary.fiscalYear} ===`);
        console.log(`Months: ${summary.months[0]} - ${summary.months[11]}`);

        console.log('\n--- Channels ---');
        for (const [channel, rows] of Object.entries(summary.channels)) {
            const total = rows.reduce((sum: any, r: any) => sum + r.actual, 0);
            console.log(`${channel}: Total Actual = ${total.toLocaleString()} JPY`);
            console.log(`  First Month (${rows[0].month}): Actual=${rows[0].actual}, Target=${rows[0].target}`);
        }

        console.log('\n--- Total ---');
        const totalActual = summary.total.reduce((sum, r) => sum + r.actual, 0);
        const totalLastYear = summary.total.reduce((sum, r) => sum + r.lastYear, 0);
        console.log(`Total FY Actual: ${totalActual.toLocaleString()} JPY`);
        console.log(`Total Last Year: ${totalLastYear.toLocaleString()} JPY`);

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        // Force exit as pool might keep open
        process.exit(0);
    }
}

main();
