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
  "20260826123000_recipe_sns_image_modes_v2.sql",
);

const verificationSql = `
  WITH claim_function AS (
    SELECT pg_get_functiondef(
      'public.claim_web_sales_codex_job(text,integer)'::regprocedure
    ) AS definition
  )
  SELECT
    position($$capabilities->>'recipeSnsProtocolVersion' = '2'$$
      in (SELECT definition FROM claim_function)) > 0 AS recipe_sns_v2_required,
    position($$capabilities->>'recipeSnsProtocolVersion' = '1'$$
      in (SELECT definition FROM claim_function)) = 0 AS recipe_sns_v1_removed,
    position($$capabilities->>'recipeSnsModel' = 'gpt-5.6-sol'$$
      in (SELECT definition FROM claim_function)) > 0 AS recipe_sns_model_preserved,
    position($$capabilities->>'ecPriceProtocolVersion' = '3'$$
      in (SELECT definition FROM claim_function)) > 0 AS ec_price_v3_preserved,
    position($$capabilities->>'ecProductNameProtocolVersion' = '2'$$
      in (SELECT definition FROM claim_function)) > 0 AS product_name_v2_preserved,
    position($$capabilities->>'ecCatchcopyProtocolVersion' = '1'$$
      in (SELECT definition FROM claim_function)) > 0 AS catchcopy_v1_preserved
`;

async function verify(client) {
  const result = await client.query(verificationSql);
  const failed = Object.entries(result.rows[0])
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failed.length > 0) throw new Error(`Recipe SNS image-mode migration checks failed: ${failed.join(", ")}`);
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
