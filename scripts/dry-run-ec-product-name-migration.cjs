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
    await client.query(fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260825120000_ec_product_names_by_site_ai.sql"),
      "utf8",
    ));
    await client.query(fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260825130000_ec_product_name_ai_sol.sql"),
      "utf8",
    ));
    const checks = await client.query(`
      SELECT
        to_regclass('public.recipe_ec_product_name_revisions') IS NOT NULL AS revisions_table,
        to_regclass('public.recipe_ec_product_name_sync_state') IS NOT NULL AS sync_state_table,
        to_regclass('public.recipe_ec_product_name_ai_generations') IS NOT NULL AS ai_generation_table,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'ec_product_names_by_site'
        ) AS site_names_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'recipe_ec_product_name_ai_generations' AND column_name = 'job_id'
        ) AS ai_generation_job_column,
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
            AND pg_get_constraintdef(oid) LIKE '%ec_product_name_generate%'
        ) AS task_constraint,
        position(
          $$capabilities->>'ecProductNameProtocolVersion' = '2'$$
          in pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
        ) > 0 AS protocol_v2_required,
        position(
          $$capabilities->>'ecProductNameAiProtocolVersion' = '1'$$
          in pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
        ) > 0 AS ai_protocol_v1_required,
        position(
          $$capabilities->>'ecProductNameAiModel' = 'gpt-5.6-sol'$$
          in pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
        ) > 0 AS sol_model_required
    `);

    const probeRecipe = await client.query(`
      SELECT id, ec_product_name, ec_product_names_by_site
      FROM public.recipes
      WHERE NULLIF(btrim(COALESCE(ec_product_name, '')), '') IS NOT NULL
      ORDER BY id
      LIMIT 1
      FOR UPDATE
    `);
    if (probeRecipe.rowCount !== 1) throw new Error("product name history probe recipe was not found");
    const probe = probeRecipe.rows[0];
    const originalName = String(probe.ec_product_name).trim();
    const nextName = `${originalName.slice(0, 68)} 検証用`.slice(0, 75);
    await client.query(
      "UPDATE public.recipes SET ec_product_name = $2, ec_product_names_by_site = jsonb_set(ec_product_names_by_site, '{amazon}', to_jsonb($2::text), true) WHERE id = $1",
      [probe.id, nextName],
    );
    const revisionResult = await client.query(`
      SELECT previous_product_name, new_product_name, new_product_names_by_site, recipe_snapshot, tsg_post_status
      FROM public.recipe_ec_product_name_revisions
      WHERE recipe_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [probe.id]);
    const revision = revisionResult.rows[0];
    checks.rows[0].history_trigger_records_names = Boolean(
      revision
      && revision.previous_product_name === originalName.slice(0, 75)
      && revision.new_product_name === nextName
      && revision.new_product_names_by_site?.amazon === nextName
      && revision.recipe_snapshot?.ecProductName === nextName
      && revision.recipe_snapshot?.ecProductNamesBySite?.amazon === nextName
      && revision.tsg_post_status === "pending"
    );

    const failed = Object.entries(checks.rows[0])
      .filter(([, value]) => value !== true)
      .map(([key]) => key);
    console.log(`dry_run=${JSON.stringify(checks.rows[0])}`);
    if (failed.length > 0) throw new Error(`EC product name migration checks failed: ${failed.join(", ")}`);
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
