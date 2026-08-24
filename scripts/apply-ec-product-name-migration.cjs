const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const envPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", ".env.production.local");
require("dotenv").config({ path: envPath, quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260824150000_ec_product_name_update_jobs.sql"),
      "utf8",
    ));
    const verification = await client.query(`
      SELECT
        to_regclass('public.recipe_ec_product_name_revisions') IS NOT NULL AS revisions_table,
        to_regclass('public.recipe_ec_product_name_sync_state') IS NOT NULL AS sync_state_table,
        to_regprocedure('public.complete_ec_product_name_codex_job(uuid,text,text,integer,text,text,jsonb,timestamp with time zone,jsonb)') IS NOT NULL AS complete_rpc,
        to_regprocedure('public.release_recipe_ec_product_name_batch_jobs(uuid[],uuid,timestamp with time zone,text)') IS NOT NULL AS batch_release_rpc,
        to_regprocedure('public.claim_recipe_product_name_tsg_notifications(integer,uuid)') IS NOT NULL AS single_tsg_rpc,
        to_regprocedure('public.claim_recipe_product_name_tsg_batch_notifications(uuid)') IS NOT NULL AS batch_tsg_rpc,
        has_function_privilege(
          'service_role',
          'public.complete_ec_product_name_codex_job(uuid,text,text,integer,text,text,jsonb,timestamp with time zone,jsonb)',
          'EXECUTE'
        ) AS service_role_execute,
        EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'web_sales_codex_jobs_task_key_check'
            AND pg_get_constraintdef(oid) LIKE '%ec_product_name_update%'
        ) AS task_constraint,
        position(
          $$capabilities->>'ecProductNameProtocolVersion' = '1'$$
          in pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
        ) > 0 AS protocol_v1_required
    `);
    const failed = Object.entries(verification.rows[0])
      .filter(([, value]) => value !== true)
      .map(([key]) => key);
    if (failed.length > 0) throw new Error(`EC product name migration verification failed: ${failed.join(", ")}`);
    await client.query("COMMIT");
    console.log(`applied=${JSON.stringify(verification.rows[0])}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
