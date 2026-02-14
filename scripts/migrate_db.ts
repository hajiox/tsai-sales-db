
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
}

const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false } // Required for Supabase
});

async function main() {
    try {
        console.log("Connecting to database...");
        await client.connect();
        console.log("Connected.");

        // Read Migration File
        const migrationPath = path.resolve(__dirname, '../supabase/migrations/20240523_add_links.sql');
        if (!fs.existsSync(migrationPath)) {
            console.error(`Migration file not found at ${migrationPath}`);
            process.exit(1);
        }

        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log("Executing SQL...");
        console.log("---------------------------------------------------");
        console.log(sql);
        console.log("---------------------------------------------------");

        await client.query(sql);

        console.log("Migration executed successfully!");
    } catch (err) {
        console.error("Error executing migration:", err);
    } finally {
        await client.end();
    }
}

main();
