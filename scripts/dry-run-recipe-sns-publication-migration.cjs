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
  "20260830134500_recipe_sns_publication_bridge.sql",
);

const verificationSql = `
  WITH claim_function AS (
    SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) AS definition
  ), job_constraints AS (
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.web_sales_codex_jobs'::regclass
  ), publication_indexes AS (
    SELECT string_agg(pg_get_indexdef(indexrelid), E'\n') AS definitions
    FROM pg_index
    WHERE indrelid = 'public.recipe_sns_publications'::regclass
  )
  SELECT
    to_regclass('public.recipe_sns_publications') IS NOT NULL AS publication_table_exists,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.recipe_sns_publications'::regclass) AS publication_rls_enabled,
    NOT has_table_privilege('anon', 'public.recipe_sns_publications', 'SELECT') AS anon_select_revoked,
    NOT has_table_privilege('authenticated', 'public.recipe_sns_publications', 'SELECT') AS authenticated_select_revoked,
    (SELECT count(*) = 16 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recipe_sns_publications') AS publication_columns_complete,
    (SELECT definitions ILIKE '%UNIQUE%job_id%' AND definitions ILIKE '%UNIQUE%idempotency_key%'
      FROM publication_indexes) AS publication_idempotency_unique,
    to_regprocedure('public.enqueue_recipe_sns_publication(uuid,uuid,uuid,text[],timestamptz,jsonb,text,text,jsonb)') IS NOT NULL AS enqueue_rpc_exists,
    to_regprocedure('public.cancel_recipe_sns_publication(uuid,uuid,text)') IS NOT NULL AS cancel_rpc_exists,
    to_regprocedure('public.complete_recipe_sns_publish_job(uuid,text,text,integer,text,text,jsonb,timestamptz)') IS NOT NULL AS complete_rpc_exists,
    (SELECT bool_or(definition LIKE '%recipe_sns_publish%') FROM job_constraints WHERE conname = 'web_sales_codex_jobs_task_key_check') AS task_constraint_updated,
    (SELECT bool_or(definition LIKE '%recipe_sns_publish%') FROM job_constraints WHERE conname = 'web_sales_codex_jobs_period_check') AS period_constraint_updated,
    (SELECT bool_or(definition LIKE '%scheduled_social%') FROM job_constraints WHERE conname = 'web_sales_codex_jobs_trigger_type_check') AS trigger_constraint_updated,
    position($$capabilities ->> 'recipeSnsPublishProtocolVersion'::text) = '1'::text$$ in (SELECT definition FROM claim_function)) > 0
      OR position($$capabilities->>'recipeSnsPublishProtocolVersion' = '1'$$ in (SELECT definition FROM claim_function)) > 0 AS publish_protocol_guarded,
    position($$capabilities ->> 'executionMode'::text) = 'interactive'::text$$ in (SELECT definition FROM claim_function)) > 0
      OR position($$capabilities->>'executionMode' = 'interactive'$$ in (SELECT definition FROM claim_function)) > 0 AS interactive_worker_guarded,
    position('recipeSnsProtocolVersion' in (SELECT definition FROM claim_function)) > 0 AS generation_guard_preserved,
    position('ecPriceProtocolVersion' in (SELECT definition FROM claim_function)) > 0 AS ec_price_guard_preserved,
    position('ingredientLabelAiProtocolVersion' in (SELECT definition FROM claim_function)) > 0 AS ingredient_guard_preserved,
    position('pg_advisory_xact_lock' in pg_get_functiondef(
      'public.enqueue_recipe_sns_publication(uuid,uuid,uuid,text[],timestamptz,jsonb,text,text,jsonb)'::regprocedure
    )) > 0 AS duplicate_submission_serialized,
    position('active_publication.targets && p_targets' in pg_get_functiondef(
      'public.enqueue_recipe_sns_publication(uuid,uuid,uuid,text[],timestamptz,jsonb,text,text,jsonb)'::regprocedure
    )) > 0 AS overlapping_immediate_post_blocked,
    position('max_attempts' in pg_get_functiondef(
      'public.enqueue_recipe_sns_publication(uuid,uuid,uuid,text[],timestamptz,jsonb,text,text,jsonb)'::regprocedure
    )) > 0 AS retry_policy_locked
`;

async function verify(client) {
  const result = await client.query(verificationSql);
  const failed = Object.entries(result.rows[0])
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failed.length > 0) throw new Error(`Recipe SNS publication migration checks failed: ${failed.join(", ")}`);
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
