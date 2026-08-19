// scripts/execute-sql.mjs
// テーブル作成SQLを直接実行

import pg from "pg";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
}

async function main() {
    console.log("Connecting to database...");

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("Connected!");

        const sql = fs.readFileSync("sql/create_recipe_tables.sql", "utf-8");

        console.log("Executing SQL...");
        await client.query(sql);

        console.log("Tables created successfully!");

        // 確認
        const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'recipe%' OR table_name LIKE 'ingredient%'
    `);

        console.log("\nCreated tables:");
        result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await client.end();
    }
}

main();
