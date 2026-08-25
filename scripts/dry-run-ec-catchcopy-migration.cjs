const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const envPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", ".env.local");
require("dotenv").config({ path: envPath, quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260825160000_ec_catchcopy_ai_bridge.sql"),
      "utf8",
    ));
    const checks = await client.query(`
      SELECT
        to_regclass('public.recipe_ec_catchcopy_revisions') IS NOT NULL AS revisions_table,
        to_regclass('public.recipe_ec_catchcopy_sync_state') IS NOT NULL AS sync_state_table,
        to_regclass('public.recipe_ec_catchcopy_ai_generations') IS NOT NULL AS ai_generation_table,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'ec_catchcopies_by_site'
        ) AS site_catchcopies_column,
        to_regprocedure('public.complete_ec_catchcopy_codex_job(uuid,text,text,integer,text,text,jsonb,timestamp with time zone,jsonb)') IS NOT NULL AS complete_rpc,
        to_regprocedure('public.release_recipe_ec_catchcopy_batch_jobs(uuid[],uuid,timestamp with time zone,text)') IS NOT NULL AS batch_release_rpc,
        has_function_privilege(
          'service_role',
          'public.complete_ec_catchcopy_codex_job(uuid,text,text,integer,text,text,jsonb,timestamp with time zone,jsonb)',
          'EXECUTE'
        ) AS service_role_execute,
        position(
          $$capabilities->>'ecCatchcopyProtocolVersion' = '1'$$
          in pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
        ) > 0 AS protocol_v1_required,
        position(
          $$capabilities->>'ecCatchcopyAiModel' = 'gpt-5.6-sol'$$
          in pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
        ) > 0 AS sol_model_required
    `);
    const failed = Object.entries(checks.rows[0]).filter(([, value]) => value !== true).map(([key]) => key);
    console.log(`dry_run=${JSON.stringify(checks.rows[0])}`);
    if (failed.length > 0) throw new Error(`EC catchcopy migration checks failed: ${failed.join(", ")}`);
    await client.query("ROLLBACK");
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
