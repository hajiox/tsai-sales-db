const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260904130000_ec_product_registration_bridge.sql");

async function verify(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.recipe_ec_product_registrations')::text AS registrations_table,
      to_regclass('public.recipe_ec_product_registration_intents')::text AS intents_table,
      to_regprocedure('public.enqueue_ec_product_register_job(uuid,uuid,uuid,jsonb,text,text,timestamp with time zone)')::text AS enqueue_rpc,
      to_regprocedure('public.mark_ec_product_register_submission_started(uuid,text,text)')::text AS submit_rpc,
      to_regprocedure('public.complete_ec_product_register_job(uuid,text,text,integer,text,text,jsonb,timestamp with time zone)')::text AS complete_rpc,
      position('ecProductRegisterProtocolVersion' IN pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)) > 0 AS claim_guard,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.web_sales_codex_jobs'::regclass
          AND conname = 'web_sales_codex_jobs_task_key_check'
          AND pg_get_constraintdef(oid) LIKE '%ec_product_register%'
      ) AS task_key_allowed
  `);
  const result = rows[0];
  if (!result?.registrations_table || !result?.intents_table || !result?.enqueue_rpc || !result?.submit_rpc || !result?.complete_rpc || !result?.claim_guard || !result?.task_key_allowed) {
    throw new Error(`EC product registration migration verification failed: ${JSON.stringify(result)}`);
  }
  return result;
}

module.exports = { migrationPath, verify };

async function main() {
  const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..", ".env.local");
  require("dotenv").config({ path: envPath, quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(fs.readFileSync(migrationPath, "utf8"));
    const verification = await verify(client);
    console.log(`dry_run=${JSON.stringify(verification)}`);
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
