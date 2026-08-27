const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const envPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", ".env.local");
require("dotenv").config({ path: envPath, quiet: true });

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260827190000_add_recipe_ec_scoped_images.sql",
);

const verificationSql = `
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.recipe_web_images'::regclass
        AND conname = 'recipe_web_images_image_role_check'
        AND pg_get_constraintdef(oid) LIKE '%non_amazon%'
        AND pg_get_constraintdef(oid) LIKE '%base_only%'
    ) AS scoped_roles,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.recipe_web_images'::regclass
        AND conname = 'recipe_web_images_source_type_check'
        AND pg_get_constraintdef(oid) LIKE '%mercari%'
    ) AS mercari_source,
    (
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'public.recipe_web_images'::regclass
    ) AS rls_enabled,
    NOT has_table_privilege('anon', 'public.recipe_web_images', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.recipe_web_images', 'SELECT')
      AS client_select_revoked
`;

async function verify(client) {
  const result = await client.query(verificationSql);
  const failed = Object.entries(result.rows[0])
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(`Recipe EC scoped image migration checks failed: ${failed.join(", ")}`);
  }
  return result.rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(fs.readFileSync(migrationPath, "utf8"));
    const checks = await verify(client);
    console.log(`dry_run=${JSON.stringify(checks)}`);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = { migrationPath, verificationSql, verify };
