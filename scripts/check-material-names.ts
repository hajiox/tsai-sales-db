// scripts/check-material-names.ts
import pg from "pg";
import * as fs from "fs";
const { Client } = pg;

const connectionString = "postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

async function main() {
    const client = new Client({ connectionString });
    await client.connect();

    const result = await client.query(
        `SELECT DISTINCT item_name, COUNT(*) as cnt, AVG(cost) as avg_cost
     FROM recipe_items WHERE item_type = 'material'
     GROUP BY item_name ORDER BY item_name`
    );

    const lines = result.rows.map(r =>
        `${r.item_name} (${r.cnt}件, avg ¥${Math.round(r.avg_cost)})`
    );

    fs.writeFileSync("material_items_list.txt", lines.join("\n"), "utf8");
    console.log(`Saved ${result.rows.length} unique material items to material_items_list.txt`);

    await client.end();
}

main().catch(console.error);
