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
  "20260827130000_add_recipe_web_image_copy_lineage.sql",
);

const verificationSql = `
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'recipe_web_images'
        AND column_name = 'copied_from_image_id'
        AND data_type = 'uuid'
        AND is_nullable = 'YES'
    ) AS lineage_column,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.recipe_web_images'::regclass
        AND confrelid = 'public.recipe_web_images'::regclass
        AND contype = 'f'
        AND confdeltype = 'n'
    ) AS self_fk_set_null,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'recipe_web_images_portrait_copy_unique_idx'
        AND indexdef LIKE '%UNIQUE INDEX%'
        AND indexdef LIKE '%image_role = ''portrait''%'
        AND indexdef LIKE '%copied_from_image_id IS NOT NULL%'
    ) AS unique_portrait_copy,
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
    throw new Error(`Recipe Web image copy migration checks failed: ${failed.join(", ")}`);
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
