-- Route conservative ingredient-label drafts through the isolated TSA Codex Bridge.

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_task_key_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_task_key_check
  CHECK (task_key IN (
    'connection_test',
    'web_sales_import',
    'ad_cost_import',
    'ec_profit_import',
    'web_sales_analysis',
    'ec_price_update',
    'ec_product_name_update',
    'ec_product_name_generate',
    'ec_catchcopy_update',
    'ec_catchcopy_generate',
    'recipe_sns_generate',
    'ec_product_content_update',
    'ec_product_content_generate',
    'ingredient_label_generate'
  ));

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_period_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_period_check CHECK (
    (task_key = 'connection_test'
      AND period_start IS NULL AND period_end IS NULL AND report_month IS NULL)
    OR
    (task_key IN ('web_sales_import', 'ad_cost_import', 'ec_profit_import')
      AND channel IS NOT NULL
      AND period_start IS NOT NULL
      AND period_end IS NOT NULL
      AND period_end >= period_start
      AND report_month = date_trunc('month', report_month)::date)
    OR
    (task_key = 'web_sales_analysis'
      AND channel IS NULL
      AND period_start IS NOT NULL
      AND period_end IS NOT NULL
      AND period_end >= period_start
      AND report_month = date_trunc('month', report_month)::date)
    OR
    (task_key IN (
        'ec_price_update',
        'ec_product_name_update',
        'ec_product_name_generate',
        'ec_catchcopy_update',
        'ec_catchcopy_generate',
        'recipe_sns_generate',
        'ec_product_content_update',
        'ec_product_content_generate',
        'ingredient_label_generate'
      )
      AND channel IS NULL
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ingredient_label_generation
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ingredient_label_generate'
    AND status IN ('queued', 'running');

DO $ingredient_label_claim$
DECLARE
  v_definition text;
  v_order_by text := '  ORDER BY jobs.priority DESC, jobs.created_at';
  v_guard text := $guard$    AND (jobs.task_key <> 'ingredient_label_generate' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'ingredientLabelAiProtocolVersion' = '1'
        AND worker.capabilities->>'ingredientLabelAiModel' = 'gpt-5.6-sol'
        AND worker.capabilities->>'ingredientLabelAiReasoningEffort' = 'ultra'
    ))
$guard$;
BEGIN
  SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
    INTO v_definition;
  IF position('ingredientLabelAiProtocolVersion' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_order_by IN v_definition) = 0 THEN
    RAISE EXCEPTION 'claim_web_sales_codex_job insertion point was not found';
  END IF;
  EXECUTE replace(v_definition, v_order_by, v_guard || v_order_by);
END
$ingredient_label_claim$;

COMMENT ON INDEX public.idx_web_sales_codex_jobs_one_active_ingredient_label_generation IS
  'Prevents duplicate active ingredient-label generation for one recipe.';
COMMENT ON FUNCTION public.claim_web_sales_codex_job(text, integer) IS
  'Claims jobs only when the worker advertises the task-specific protocol, model, and reasoning contract.';
