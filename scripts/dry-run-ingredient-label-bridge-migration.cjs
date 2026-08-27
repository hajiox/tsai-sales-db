const path = require("node:path");
const { Client } = require("pg");

const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260827230000_ingredient_label_ai_bridge.sql");

async function verify(client) {
  const checks = await client.query([
    "SELECT",
    "  pg_get_constraintdef(c.oid) AS task_constraint,",
    "  to_regclass('public.idx_web_sales_codex_jobs_one_active_ingredient_label_generation')::text AS active_index,",
    "  pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) AS claim_definition",
    "FROM pg_constraint AS c",
    "WHERE c.conname = 'web_sales_codex_jobs_task_key_check'",
    "LIMIT 1",
  ].join("\n"));
  const row = checks.rows[0];
  if (!row?.task_constraint?.includes("ingredient_label_generate")) throw new Error("task_key constraint is missing ingredient_label_generate");
  if (!row.active_index) throw new Error("active ingredient-label index is missing");
  if (!row.claim_definition?.includes("ingredientLabelAiProtocolVersion")) throw new Error("claim capability guard is missing");
  if (!row.claim_definition?.includes("ingredientLabelAiReasoningEffort")) throw new Error("claim reasoning guard is missing");
  return {
    taskConstraint: true,
    activeIndex: row.active_index,
    claimCapabilityGuard: true,
  };
}

async function main() {
  const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..", ".env.local");
  require("dotenv").config({ path: envPath, quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log(JSON.stringify(await verify(client)));
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
