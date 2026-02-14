
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

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
    ssl: { rejectUnauthorized: false } // Required for Supabase often
});

async function main() {
    try {
        console.log("Connecting to database...");
        await client.connect();
        console.log("Connected.");
        console.log("Reading migration file...");
        const migrationPath = path.resolve(__dirname, '../supabase/migrations/20240523_add_links.sql');

        if (!fs.existsSync(migrationPath)) {
            console.error(`Migration file found at ${migrationPath} does not exist.`);
            process.exit(1);
        }

        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Remove comments if needed or keep them? Postgres allows comments usually.
        // It's safer to execute one big query unless pg library splits? No, pg usually executes multi-statement block if supported by pooling or standard.
        // Let's try.

        console.log("Executing SQL...");
        await client.query(sql);

        console.log("Migration executed successfully!");
    } catch (err) {
        console.error("Error executing migration:", err);
    } finally {
        await client.end();
    }
}

main();
