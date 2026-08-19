const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env.production.local"),
  quiet: true,
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const before = await client.query(`
      SELECT
        to_regclass('public.recipe_ec_price_revisions') IS NOT NULL AS revisions_table,
        to_regclass('public.recipe_ec_price_sync_state') IS NOT NULL AS sync_state_table,
        to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS migrations_table,
        EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'web_sales_codex_jobs_task_key_check'
            AND pg_get_constraintdef(oid) LIKE '%ec_price_update%'
        ) AS price_task_constraint
    `);
    let migrationRecorded = false;
    if (before.rows[0].migrations_table) {
      const migration = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '20260819093000'
        ) AS recorded
      `);
      migrationRecorded = migration.rows[0].recorded;
    }
    before.rows[0].migration_recorded = migrationRecorded;
    console.log(`before=${JSON.stringify(before.rows[0])}`);
    await client.query("BEGIN");
    await client.query(fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260819093000_add_ec_price_update_jobs.sql"),
      "utf8",
    ));
    await client.query(fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260819110000_fix_ec_price_revision_tax_inclusive_priority.sql"),
      "utf8",
    ));
    await client.query(fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260819123000_recipe_price_tsg_notifications.sql"),
      "utf8",
    ));
    const checks = await client.query(`
      SELECT
        to_regclass('public.recipe_ec_price_revisions') IS NOT NULL AS revisions_table,
        to_regclass('public.recipe_ec_price_sync_state') IS NOT NULL AS sync_state_table,
        to_regprocedure('public.claim_web_sales_codex_job(text,integer)') IS NOT NULL AS claim_rpc,
        to_regprocedure('public.complete_ec_price_codex_job(uuid,text,text,integer,text,text,jsonb,timestamp with time zone,jsonb)') IS NOT NULL AS complete_rpc,
        has_function_privilege(
          'service_role',
          'public.complete_ec_price_codex_job(uuid,text,text,integer,text,text,jsonb,timestamp with time zone,jsonb)',
          'EXECUTE'
        ) AS service_role_execute,
        to_regprocedure('public.claim_recipe_price_tsg_notifications(integer,uuid)') IS NOT NULL
          AS tsg_claim_rpc,
        has_function_privilege(
          'service_role',
          'public.claim_recipe_price_tsg_notifications(integer,uuid)',
          'EXECUTE'
        ) AS tsg_claim_service_role_execute,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'recipe_ec_price_revisions'
            AND column_name = 'tsg_post_status'
        ) AS tsg_outbox_columns,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'recipe_ec_price_sync_state'
            AND column_name = 'recipe_snapshot'
        ) AS snapshot_column,
        position(
          'floor(floor('
          in replace(lower(pg_get_functiondef('public.record_recipe_ec_price_revision()'::regprocedure)), ' ', '')
        ) = 0 AS fractional_tax_excluded_supported
    `);
    const probeRecipe = await client.query(`
      SELECT id, selling_price
      FROM public.recipes
      WHERE selling_price > 0
      ORDER BY id
      LIMIT 1
      FOR UPDATE
    `);
    if (probeRecipe.rowCount !== 1) throw new Error("price history probe recipe was not found");
    const probe = probeRecipe.rows[0];
    const previousPriceExTax = Number(probe.selling_price);
    const nextPriceExTax = previousPriceExTax + 1;
    await client.query(
      "UPDATE public.recipes SET selling_price = $2 WHERE id = $1",
      [probe.id, nextPriceExTax],
    );
    const probeRevision = await client.query(`
      SELECT previous_price_ex_tax, new_price_ex_tax,
             previous_price_incl_tax, new_price_incl_tax,
             tsg_post_status
      FROM public.recipe_ec_price_revisions
      WHERE recipe_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [probe.id]);
    const revision = probeRevision.rows[0];
    checks.rows[0].history_trigger_records_previous_price = Boolean(
      revision
      && Number(revision.previous_price_ex_tax) === previousPriceExTax
      && Number(revision.new_price_ex_tax) === nextPriceExTax
      && Number(revision.previous_price_incl_tax) === Math.floor(previousPriceExTax * 1.08)
      && Number(revision.new_price_incl_tax) === Math.floor(nextPriceExTax * 1.08)
      && revision.tsg_post_status === 'pending'
    );
    console.log(`dry_run=${JSON.stringify(checks.rows[0])}`);
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
