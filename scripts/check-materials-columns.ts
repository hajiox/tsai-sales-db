// scripts/check-materials-columns.ts
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
}

async function main() {
    const client = new Client({ connectionString });
    await client.connect();

    // カラム名
    const cols = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='materials' ORDER BY ordinal_position`
    );
    console.log("=== Materials table columns ===");
    cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

    // サンプルデータ
    const sample = await client.query(`SELECT * FROM materials LIMIT 3`);
    console.log("\n=== Sample rows ===");
    sample.rows.forEach(r => console.log(JSON.stringify(r)));

    // 全件数
    const count = await client.query(`SELECT COUNT(*) FROM materials`);
    console.log(`\nTotal: ${count.rows[0].count}`);

    await client.end();
}

main().catch(console.error);
