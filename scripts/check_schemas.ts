
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// Manually load .env.local
try {
    const envPath = path.resolve(__dirname, '../.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            process.env[key] = value;
        }
    });
} catch (e) {
    console.log('Could not load .env.local', e);
}

// Inline db connection to avoid import issues
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
});

async function main() {
    const tables = ['wholesale_sales', 'oem_sales', 'brand_store_sales', 'food_store_sales', 'web_sales_summary'];

    try {
        for (const table of tables) {
            console.log(`\n--- ${table} ---`);
            const res = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
        ORDER BY ordinal_position;
      `);
            res.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));
        }
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

main();
