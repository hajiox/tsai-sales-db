const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260827210000_ec_product_content_bridge.sql",
);

async function verify(client) {
  const taskConstraint = await client.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname = 'web_sales_codex_jobs_task_key_check'
  `);
  const periodConstraint = await client.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname = 'web_sales_codex_jobs_period_check'
  `);
  const table = await client.query(`
    SELECT to_regclass('public.recipe_ec_product_content_ai_generations')::text AS name
  `);
  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_web_sales_codex_jobs_one_active_ec_product_content_update',
        'idx_web_sales_codex_jobs_one_active_ec_product_content_generation',
        'idx_recipe_ec_product_content_ai_recipe_created'
      )
    ORDER BY indexname
  `);
  const claimFunction = await client.query(`
    SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text, integer)'::regprocedure) AS definition
  `);

  const taskDefinition = String(taskConstraint.rows[0]?.definition || "");
  const periodDefinition = String(periodConstraint.rows[0]?.definition || "");
  const functionDefinition = String(claimFunction.rows[0]?.definition || "");
  for (const taskKey of ["ec_product_content_update", "ec_product_content_generate"]) {
    if (!taskDefinition.includes(taskKey)) throw new Error(`task constraint is missing ${taskKey}`);
    if (!periodDefinition.includes(taskKey)) throw new Error(`period constraint is missing ${taskKey}`);
  }
  if (table.rows[0]?.name !== "recipe_ec_product_content_ai_generations") {
    throw new Error("AI generation history table was not created");
  }
  if (indexes.rowCount !== 3) throw new Error("EC product content indexes are incomplete");
  for (const capability of ["ecProductContentProtocolVersion", "ecProductContentAiProtocolVersion", "ecProductContentAiModel"]) {
    if (!functionDefinition.includes(capability)) throw new Error(`claim function is missing ${capability}`);
  }
  return {
    table: table.rows[0].name,
    indexes: indexes.rows.map((row) => row.indexname),
    guardedTasks: ["ec_product_content_update", "ec_product_content_generate"],
  };
}

async function main() {
  const envPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, "..", ".env.local");
  require("dotenv").config({ path: envPath, quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(fs.readFileSync(migrationPath, "utf8"));
    const verification = await verify(client);
    await client.query("ROLLBACK");
    console.log(`dryRun=${JSON.stringify(verification)}`);
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

module.exports = { migrationPath, verify };
