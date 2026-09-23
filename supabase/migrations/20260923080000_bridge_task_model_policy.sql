-- Change only model capability guards; preserve task protocols, roles and locks.
DO $task_models$
DECLARE
  definition text;
  original text;
  capability text;
  target_model text;
BEGIN
  SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) INTO definition;
  original := definition;
  FOR capability, target_model IN SELECT * FROM (VALUES
    ('ecProductNameAiModel','gpt-6-sol'), ('ecCatchcopyAiModel','gpt-6-sol'),
    ('ecProductContentAiModel','gpt-6-sol'), ('ingredientLabelAiModel','gpt-6-sol'),
    ('docScannerFaxSummaryModel','gpt-6-sol'), ('recipeSnsModel','gpt-6-sol')
  ) AS policy(capability, target_model) LOOP
    definition := replace(definition, format('%L = %L', capability, 'gpt-6-astra'), format('%L = %L', capability, target_model));
    definition := replace(definition, format('%L::text) = %L::text', capability, 'gpt-6-astra'), format('%L::text) = %L::text', capability, target_model));
    IF position(format('%L = %L', capability, target_model) IN definition) = 0
       AND position(format('%L::text) = %L::text', capability, target_model) IN definition) = 0 THEN
      RAISE EXCEPTION 'Missing model capability guard: %', capability;
    END IF;
  END LOOP;
  IF definition <> original THEN EXECUTE definition; END IF;

  SELECT pg_get_functiondef('public.enqueue_recipe_review_batch(text,jsonb)'::regprocedure) INTO definition;
  definition := replace(definition, '''model'',''gpt-6-astra'',''reasoningEffort'',''medium''', '''model'',''gpt-6-luna'',''reasoningEffort'',''high''');
  IF position('''model'',''gpt-6-luna'',''reasoningEffort'',''high''' IN definition) = 0 THEN
    RAISE EXCEPTION 'Review batch model contract was not found';
  END IF;
  EXECUTE definition;
END
$task_models$;

-- Pending jobs adopt the policy without resuming waits or rerunning results.
-- Running and terminal jobs are immutable here.
UPDATE public.web_sales_codex_jobs
SET parameters = parameters || jsonb_build_object(
  'model', CASE
    WHEN task_key IN ('web_sales_analysis','recipe_reviews_analyze') THEN 'gpt-6-astra'
    WHEN task_key IN ('ec_product_name_generate','ec_catchcopy_generate','ec_product_content_generate',
      'ingredient_label_generate','recipe_sns_generate','docscanner_fax_summary') THEN 'gpt-6-sol'
    ELSE 'gpt-6-luna' END,
  'reasoningEffort', CASE
    WHEN task_key IN ('web_sales_analysis','recipe_reviews_analyze','ec_product_name_generate',
      'ec_catchcopy_generate','ec_product_content_generate','ingredient_label_generate',
      'recipe_sns_generate','docscanner_fax_summary') THEN 'medium' ELSE 'high' END)
WHERE status IN ('queued','waiting_for_user')
  AND task_key IN ('web_sales_import','ad_cost_import','ec_profit_import','ec_price_update',
    'ec_product_register','ec_product_name_update','ec_catchcopy_update','ec_product_content_update',
    'recipe_sns_publish','recipe_reviews_collect','web_sales_analysis','recipe_reviews_analyze',
    'ec_product_name_generate','ec_catchcopy_generate','ec_product_content_generate',
    'ingredient_label_generate','recipe_sns_generate','docscanner_fax_summary');
