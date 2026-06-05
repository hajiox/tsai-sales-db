// scripts/check-db-schema-file.ts
import pg from "pg";
import * as fs from "fs";
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

    const tablesToCheck = ['ingredients', 'materials', 'recipes'];
    let output = "";

    for (const table of tablesToCheck) {
        output += `\n=== Table: ${table} ===\n`;
        // Check if table exists
        const tableExists = await client.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
            [table]
        );

        if (tableExists.rows.length === 0) {
            output += "  Table does not exist\n";
            continue;
        }

        // Get columns
        const cols = await client.query(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
            [table]
        );
        cols.rows.forEach(r => output += `  ${r.column_name} (${r.data_type})\n`);
    }

    fs.writeFileSync("db_schema_check.txt", output, "utf8");
    console.log("Schema check written to db_schema_check.txt");

    await client.end();
}

main().catch(console.error);
