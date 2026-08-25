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
  "20260825190000_recipe_sns_generation.sql",
);

const verificationSql = `
  WITH task_constraint AS (
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.web_sales_codex_jobs'::regclass
      AND conname = 'web_sales_codex_jobs_task_key_check'
  ), period_constraint AS (
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.web_sales_codex_jobs'::regclass
      AND conname = 'web_sales_codex_jobs_period_check'
  ), active_index AS (
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_web_sales_codex_jobs_one_active_recipe_sns_generation'
  ), claim_function AS (
    SELECT pg_get_functiondef(
      'public.claim_web_sales_codex_job(text,integer)'::regprocedure
    ) AS definition
  )
  SELECT
    to_regclass('public.recipe_sns_generations') IS NOT NULL AS generation_table,
    (
      SELECT array_agg(column_name::text ORDER BY ordinal_position) = ARRAY[
        'id', 'job_id', 'recipe_id', 'status', 'source_image_id',
        'source_image_url', 'source_image_role', 'variation_key', 'image_variants',
        'source_snapshot', 'posts', 'model', 'reasoning_effort', 'rules_version',
        'created_by', 'error_message', 'created_at', 'completed_at'
      ]::text[]
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recipe_sns_generations'
    ) AS expected_columns,
    (
      SELECT is_nullable = 'YES'
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recipe_sns_generations'
        AND column_name = 'source_image_id'
    ) AS source_image_nullable,
    (
      SELECT is_nullable = 'YES'
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recipe_sns_generations'
        AND column_name = 'posts'
    ) AS posts_nullable,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'u'
        AND conkey = ARRAY[
          (SELECT attnum FROM pg_attribute
           WHERE attrelid = 'public.recipe_sns_generations'::regclass AND attname = 'job_id')
        ]::smallint[]
    ) AS job_id_unique,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'f'
        AND confrelid = 'public.web_sales_codex_jobs'::regclass
    ) AS job_fk,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'f'
        AND confrelid = 'public.recipes'::regclass
    ) AS recipe_fk,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'f'
        AND confrelid = 'public.recipe_web_images'::regclass
    ) AS source_image_fk,
    position('pending' in pg_get_constraintdef((
      SELECT oid FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
      LIMIT 1
    ))) > 0
      AND position('completed' in pg_get_constraintdef((
      SELECT oid FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
      LIMIT 1
    ))) > 0
      AND position('failed' in pg_get_constraintdef((
      SELECT oid FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
      LIMIT 1
    ))) > 0 AS status_values,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.recipe_sns_generations'::regclass
        AND contype = 'c'
        AND position('source_image_role' in pg_get_constraintdef(oid)) > 0
        AND position('portrait' in pg_get_constraintdef(oid)) > 0
        AND position('gallery' in pg_get_constraintdef(oid)) > 0
    ) AS source_image_roles,
    (
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'public.recipe_sns_generations'::regclass
    ) AS rls_enabled,
    NOT has_table_privilege('anon', 'public.recipe_sns_generations', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.recipe_sns_generations', 'SELECT')
      AS client_select_revoked,
    (SELECT bool_and(position(task_key in definition) > 0)
     FROM task_constraint
     CROSS JOIN unnest(ARRAY[
       'connection_test', 'web_sales_import', 'ad_cost_import', 'ec_profit_import',
       'web_sales_analysis', 'ec_price_update', 'ec_product_name_update',
       'ec_product_name_generate', 'ec_catchcopy_update', 'ec_catchcopy_generate',
       'recipe_sns_generate'
     ]) AS task_key) AS task_keys_preserved,
    position('recipe_sns_generate' in (SELECT definition FROM period_constraint)) > 0
      AND position('period_start IS NULL' in (SELECT definition FROM period_constraint)) > 0
      AS periodless_task,
    position('UNIQUE INDEX' in (SELECT indexdef FROM active_index)) > 0
      AND position('(parameters ->> ''recipeId''::text)' in (SELECT indexdef FROM active_index)) > 0
      AND position('recipe_sns_generate' in (SELECT indexdef FROM active_index)) > 0
      AND position('queued' in (SELECT indexdef FROM active_index)) > 0
      AND position('running' in (SELECT indexdef FROM active_index)) > 0
      AS one_active_job_index,
    to_regclass('public.idx_recipe_sns_generations_recipe_created') IS NOT NULL
      AND to_regclass('public.idx_recipe_sns_generations_status_created') IS NOT NULL
      AS generation_indexes,
    position($$capabilities->>'ecPriceProtocolVersion' = '3'$$
      in (SELECT definition FROM claim_function)) > 0 AS ec_price_v3_preserved,
    position($$capabilities->>'ecProductNameProtocolVersion' = '2'$$
      in (SELECT definition FROM claim_function)) > 0 AS product_name_v2_preserved,
    position($$capabilities->>'ecProductNameAiProtocolVersion' = '1'$$
      in (SELECT definition FROM claim_function)) > 0
      AND position($$capabilities->>'ecProductNameAiModel' = 'gpt-5.6-sol'$$
      in (SELECT definition FROM claim_function)) > 0 AS product_name_ai_preserved,
    position($$capabilities->>'ecCatchcopyProtocolVersion' = '1'$$
      in (SELECT definition FROM claim_function)) > 0 AS catchcopy_v1_preserved,
    position($$capabilities->>'ecCatchcopyAiProtocolVersion' = '1'$$
      in (SELECT definition FROM claim_function)) > 0
      AND position($$capabilities->>'ecCatchcopyAiModel' = 'gpt-5.6-sol'$$
      in (SELECT definition FROM claim_function)) > 0 AS catchcopy_ai_preserved,
    position($$capabilities->>'recipeSnsProtocolVersion' = '1'$$
      in (SELECT definition FROM claim_function)) > 0 AS recipe_sns_v1_required,
    position($$capabilities->>'recipeSnsModel' = 'gpt-5.6-sol'$$
      in (SELECT definition FROM claim_function)) > 0 AS recipe_sns_model_required
`;

async function verify(client) {
  const result = await client.query(verificationSql);
  const failed = Object.entries(result.rows[0])
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(`Recipe SNS migration checks failed: ${failed.join(", ")}`);
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
