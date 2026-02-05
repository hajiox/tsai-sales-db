
import { pool } from '../lib/db';

async function main() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'web_sales%'");
        console.log("Tables:", res.rows);

        // Check web_sales_summary columns
        const res2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'web_sales_summary'");
        console.log("Columns:", res2.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

main();
