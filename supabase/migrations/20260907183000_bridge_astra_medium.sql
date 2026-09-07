-- Preserve the current claim function's protocol, role, authorization and locking
-- guards while migrating its explicitly named CLI model contracts.
DO $bridge_astra_medium$
DECLARE
  v_definition text;
  v_original text;
  v_key text;
  v_old_effort text;
  v_model_guards integer;
  v_astra_guards integer;
BEGIN
  SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
    INTO v_definition;
  v_original := v_definition;
  SELECT count(*) INTO v_model_guards
    FROM regexp_matches(v_definition, '''gpt-(5\.6-(sol|luna)|6-astra)''', 'g');
  IF v_model_guards < 1 THEN
    RAISE EXCEPTION 'Expected explicit CLI model claim guards were not found';
  END IF;

  v_definition := replace(v_definition, '''gpt-5.6-sol''', '''gpt-6-astra''');
  v_definition := replace(v_definition, '''gpt-5.6-luna''', '''gpt-6-astra''');

  FOR v_key, v_old_effort IN
    SELECT * FROM (VALUES
      ('ingredientLabelAiReasoningEffort', 'ultra'),
      ('docScannerFaxSummaryReasoningEffort', 'low')
    ) AS changes(capability, old_effort)
  LOOP
    -- PL/pgSQL and SQL function bodies may use compact or deparsed syntax.
    v_definition := replace(v_definition,
      format('%L = %L', v_key, v_old_effort),
      format('%L = %L', v_key, 'medium'));
    v_definition := replace(v_definition,
      format('%L::text) = %L::text', v_key, v_old_effort),
      format('%L::text) = %L::text', v_key, 'medium'));
    IF position(format('%L = %L', v_key, 'medium') IN v_definition) = 0
       AND position(format('%L::text) = %L::text', v_key, 'medium') IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Astra medium claim guard missing: %', v_key;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_astra_guards
    FROM regexp_matches(v_definition, '''gpt-6-astra''', 'g');
  IF v_astra_guards <> v_model_guards THEN
    RAISE EXCEPTION 'Astra claim model guard count changed';
  END IF;
  IF v_definition <> v_original THEN
    EXECUTE v_definition;
  END IF;
END
$bridge_astra_medium$;

-- The operator explicitly requested migration of pending CLI executions.
-- Running jobs, immutable business inputs and completed audit records stay intact.
UPDATE public.web_sales_codex_jobs
SET parameters = jsonb_set(jsonb_set(parameters, '{model}', '"gpt-6-astra"'::jsonb),
                          '{reasoningEffort}', '"medium"'::jsonb)
WHERE status = 'queued'
  AND task_key IN ('web_sales_analysis', 'ec_product_name_generate',
      'ec_catchcopy_generate', 'ec_product_content_generate',
      'ingredient_label_generate', 'docscanner_fax_summary',
      'recipe_sns_generate', 'recipe_sns_publish')
  AND parameters->>'model' IN ('gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-6-astra')
  AND (parameters->>'model' <> 'gpt-6-astra'
       OR parameters->>'reasoningEffort' IS DISTINCT FROM 'medium');

COMMENT ON FUNCTION public.claim_web_sales_codex_job(text, integer) IS
  'Claims jobs with the existing task protocols and Astra medium CLI contracts.';
