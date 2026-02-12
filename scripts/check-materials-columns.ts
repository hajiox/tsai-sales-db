// scripts/check-materials-columns.ts
import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

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
