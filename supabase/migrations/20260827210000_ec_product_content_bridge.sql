-- EC product-point/description AI adjustment history and guarded Bridge routing.

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
    'ec_product_content_generate'
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
        'ec_product_content_generate'
      )
      AND channel IS NULL
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_product_content_update
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_product_content_update'
    AND status IN ('queued', 'running');

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_product_content_generation
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_product_content_generate'
    AND status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS public.recipe_ec_product_content_ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.web_sales_codex_jobs(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  model text NOT NULL,
  reasoning_effort text NOT NULL,
  rules_version text NOT NULL,
  source_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ec_product_content_ai_recipe_created
  ON public.recipe_ec_product_content_ai_generations(recipe_id, created_at DESC);

ALTER TABLE public.recipe_ec_product_content_ai_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_ec_product_content_ai_generations FROM anon, authenticated;

-- Route content jobs only to a Bridge that advertises the exact supported protocol/model.
CREATE OR REPLACE FUNCTION public.claim_web_sales_codex_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 900
)
RETURNS SETOF public.web_sales_codex_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  UPDATE public.web_sales_codex_jobs
  SET status = CASE WHEN attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
      current_step = CASE WHEN attempt_count < max_attempts THEN 'PC再接続後に再実行' ELSE 'PCとの接続が切れました' END,
      error_message = CASE WHEN attempt_count < max_attempts THEN error_message ELSE '実行中にPCとの接続が切れました' END,
      worker_id = CASE WHEN attempt_count < max_attempts THEN NULL ELSE worker_id END,
      lease_expires_at = NULL,
      heartbeat_at = NULL,
      completed_at = CASE WHEN attempt_count < max_attempts THEN NULL ELSE now() END,
      updated_at = now()
  WHERE status = 'running'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at < now();

  SELECT jobs.id INTO v_job_id
  FROM public.web_sales_codex_jobs AS jobs
  WHERE jobs.status = 'queued'
    AND jobs.scheduled_at <= now()
    AND jobs.task_key IN (
      SELECT jsonb_array_elements_text(COALESCE(workers.capabilities->'codexTaskKeys', '[]'::jsonb))
      FROM public.web_sales_codex_workers AS workers
      WHERE workers.id = p_worker_id
    )
    AND (jobs.task_key <> 'ec_price_update' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id AND worker.capabilities->>'ecPriceProtocolVersion' = '3'
    ))
    AND (jobs.task_key <> 'ec_product_name_update' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id AND worker.capabilities->>'ecProductNameProtocolVersion' = '2'
    ))
    AND (jobs.task_key <> 'ec_product_name_generate' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'ecProductNameAiProtocolVersion' = '1'
        AND worker.capabilities->>'ecProductNameAiModel' = 'gpt-5.6-sol'
    ))
    AND (jobs.task_key <> 'ec_catchcopy_update' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id AND worker.capabilities->>'ecCatchcopyProtocolVersion' = '1'
    ))
    AND (jobs.task_key <> 'ec_catchcopy_generate' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'ecCatchcopyAiProtocolVersion' = '1'
        AND worker.capabilities->>'ecCatchcopyAiModel' = 'gpt-5.6-sol'
    ))
    AND (jobs.task_key <> 'recipe_sns_generate' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'recipeSnsProtocolVersion' = '1'
        AND worker.capabilities->>'recipeSnsModel' = 'gpt-5.6-sol'
    ))
    AND (jobs.task_key <> 'ec_product_content_update' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'ecProductContentProtocolVersion' = '1'
    ))
    AND (jobs.task_key <> 'ec_product_content_generate' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'ecProductContentAiProtocolVersion' = '1'
        AND worker.capabilities->>'ecProductContentAiModel' = 'gpt-5.6-sol'
    ))
  ORDER BY jobs.priority DESC, jobs.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NULL THEN RETURN; END IF;

  UPDATE public.web_sales_codex_jobs
  SET status = 'running',
      progress = GREATEST(progress, 1),
      current_step = '事務所PCが処理を開始しました',
      worker_id = p_worker_id,
      attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()),
      heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 60), 3600)),
      updated_at = now()
  WHERE id = v_job_id;

  UPDATE public.web_sales_codex_workers
  SET status = 'busy', current_job_id = v_job_id, last_seen_at = now(), updated_at = now()
  WHERE id = p_worker_id;

  INSERT INTO public.web_sales_codex_job_events(job_id, event_type, message, progress)
  VALUES (v_job_id, 'claimed', '事務所PCがタスクを受け取りました', 1);

  RETURN QUERY SELECT * FROM public.web_sales_codex_jobs WHERE id = v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_web_sales_codex_job(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_web_sales_codex_job(text, integer) TO service_role;
