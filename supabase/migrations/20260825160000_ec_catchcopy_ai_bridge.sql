-- Rakuten/Yahoo catchcopies, GPT-5.6 Sol generation, and guarded Bridge updates.

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
    'ec_catchcopy_generate'
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
        'ec_catchcopy_generate'
      )
      AND channel IS NULL
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_catchcopy_per_recipe
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_catchcopy_update'
    AND status IN ('queued', 'running');

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_catchcopy_generation
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_catchcopy_generate'
    AND status IN ('queued', 'running');

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS ec_catchcopies_by_site jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.recipes
SET ec_catchcopies_by_site = jsonb_build_object(
  'rakuten', left(regexp_replace(btrim(catchcopy), '\s+', ' ', 'g'), 87),
  'yahoo', left(regexp_replace(btrim(catchcopy), '\s+', ' ', 'g'), 30)
)
WHERE NULLIF(btrim(COALESCE(catchcopy, '')), '') IS NOT NULL
  AND ec_catchcopies_by_site = '{}'::jsonb;

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_ec_catchcopies_by_site_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_ec_catchcopies_by_site_check CHECK (
    jsonb_typeof(ec_catchcopies_by_site) = 'object'
    AND (ec_catchcopies_by_site - ARRAY['rakuten','yahoo']) = '{}'::jsonb
    AND (NOT ec_catchcopies_by_site ? 'rakuten'
      OR (jsonb_typeof(ec_catchcopies_by_site->'rakuten') = 'string'
        AND length(btrim(ec_catchcopies_by_site->>'rakuten')) BETWEEN 1 AND 87))
    AND (NOT ec_catchcopies_by_site ? 'yahoo'
      OR (jsonb_typeof(ec_catchcopies_by_site->'yahoo') = 'string'
        AND length(btrim(ec_catchcopies_by_site->>'yahoo')) BETWEEN 1 AND 30))
  );

CREATE TABLE IF NOT EXISTS public.recipe_ec_catchcopy_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  previous_catchcopies jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_catchcopies jsonb NOT NULL,
  recipe_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipe_ec_catchcopy_revisions_recipe_created
  ON public.recipe_ec_catchcopy_revisions(recipe_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.recipe_ec_catchcopy_sync_state (
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('rakuten', 'yahoo')),
  last_catchcopy text NOT NULL CHECK (length(btrim(last_catchcopy)) BETWEEN 1 AND 87),
  last_job_id uuid NOT NULL REFERENCES public.web_sales_codex_jobs(id) ON DELETE RESTRICT,
  recipe_snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, target)
);

CREATE TABLE IF NOT EXISTS public.recipe_ec_catchcopy_ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.web_sales_codex_jobs(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  model text NOT NULL,
  reasoning_effort text NOT NULL,
  rules_version text NOT NULL,
  source_snapshot jsonb NOT NULL,
  suggestions jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipe_ec_catchcopy_ai_generations_recipe_created
  ON public.recipe_ec_catchcopy_ai_generations(recipe_id, created_at DESC);

ALTER TABLE public.recipe_ec_catchcopy_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ec_catchcopy_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ec_catchcopy_ai_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_ec_catchcopy_revisions FROM anon, authenticated;
REVOKE ALL ON public.recipe_ec_catchcopy_sync_state FROM anon, authenticated;
REVOKE ALL ON public.recipe_ec_catchcopy_ai_generations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_recipe_ec_catchcopy_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_map jsonb := COALESCE(OLD.ec_catchcopies_by_site, '{}'::jsonb);
  v_new_map jsonb := COALESCE(NEW.ec_catchcopies_by_site, '{}'::jsonb);
BEGIN
  IF (OLD.catchcopy IS DISTINCT FROM NEW.catchcopy
      OR OLD.ec_catchcopies_by_site IS DISTINCT FROM NEW.ec_catchcopies_by_site)
     AND v_new_map <> '{}'::jsonb THEN
    INSERT INTO public.recipe_ec_catchcopy_revisions (
      recipe_id, previous_catchcopies, new_catchcopies, recipe_snapshot
    ) VALUES (
      NEW.id,
      v_old_map,
      v_new_map,
      jsonb_build_object(
        'recipeId', NEW.id::text,
        'recipeName', left(btrim(COALESCE(NEW.name, '')), 200),
        'fallbackCatchcopy', left(regexp_replace(btrim(COALESCE(NEW.catchcopy, '')), '\s+', ' ', 'g'), 87),
        'ecCatchcopiesBySite', v_new_map,
        'linkedProductId', CASE WHEN NEW.linked_product_id IS NULL THEN NULL ELSE left(NEW.linked_product_id::text, 100) END,
        'janCode', CASE WHEN NULLIF(btrim(COALESCE(NEW.jan_code, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.jan_code), 32) END,
        'seriesCode', CASE WHEN NEW.series_code IS NULL THEN NULL ELSE left(btrim(NEW.series_code::text), 100) END,
        'productCode', CASE WHEN NEW.product_code IS NULL THEN NULL ELSE left(btrim(NEW.product_code::text), 100) END,
        'fillingQuantity', CASE WHEN NEW.filling_quantity IS NULL THEN NULL ELSE left(btrim(NEW.filling_quantity::text), 50) END,
        'fillingQuantityUnit', CASE WHEN NULLIF(btrim(COALESCE(NEW.filling_quantity_unit, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.filling_quantity_unit), 30) END,
        'storageMethod', CASE WHEN NULLIF(btrim(COALESCE(NEW.storage_method, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.storage_method), 100) END
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_recipe_ec_catchcopy_revision ON public.recipes;
CREATE TRIGGER trg_record_recipe_ec_catchcopy_revision
  AFTER UPDATE OF catchcopy, ec_catchcopies_by_site ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.record_recipe_ec_catchcopy_revision();

CREATE OR REPLACE FUNCTION public.complete_ec_catchcopy_codex_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_progress integer,
  p_current_step text,
  p_error_message text,
  p_result jsonb,
  p_completed_at timestamptz,
  p_sync_rows jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id uuid;
BEGIN
  IF p_status NOT IN ('waiting_for_user', 'needs_review', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid final EC catchcopy status';
  END IF;

  SELECT (parameters->>'recipeId')::uuid INTO v_recipe_id
  FROM public.web_sales_codex_jobs
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND task_key = 'ec_catchcopy_update'
    AND status = 'running'
  FOR UPDATE;
  IF v_recipe_id IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_sync_rows, '[]'::jsonb)) AS row_data(
      recipe_id uuid,
      target text,
      last_catchcopy text,
      last_job_id uuid,
      recipe_snapshot jsonb,
      updated_at timestamptz
    )
    WHERE row_data.recipe_id IS DISTINCT FROM v_recipe_id
      OR row_data.last_job_id IS DISTINCT FROM p_job_id
      OR row_data.target NOT IN ('rakuten', 'yahoo')
      OR length(btrim(row_data.last_catchcopy)) NOT BETWEEN 1 AND
        CASE row_data.target WHEN 'yahoo' THEN 30 ELSE 87 END
  ) THEN
    RAISE EXCEPTION 'EC catchcopy sync row does not belong to job';
  END IF;

  UPDATE public.web_sales_codex_jobs
  SET status = p_status,
      progress = CASE WHEN p_status = 'completed' THEN 100 ELSE LEAST(GREATEST(COALESCE(p_progress, 0), 0), 100) END,
      current_step = left(COALESCE(NULLIF(p_current_step, ''), 'ECキャッチコピー変更処理が終了しました'), 500),
      error_message = CASE WHEN p_error_message IS NULL THEN NULL ELSE left(p_error_message, 4000) END,
      result = COALESCE(p_result, result),
      heartbeat_at = p_completed_at,
      lease_expires_at = NULL,
      completed_at = p_completed_at,
      updated_at = p_completed_at
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND task_key = 'ec_catchcopy_update'
    AND status = 'running';
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.recipe_ec_catchcopy_sync_state (
    recipe_id, target, last_catchcopy, last_job_id, recipe_snapshot, updated_at
  )
  SELECT row_data.recipe_id, row_data.target, row_data.last_catchcopy,
         row_data.last_job_id, row_data.recipe_snapshot, row_data.updated_at
  FROM jsonb_to_recordset(COALESCE(p_sync_rows, '[]'::jsonb)) AS row_data(
    recipe_id uuid,
    target text,
    last_catchcopy text,
    last_job_id uuid,
    recipe_snapshot jsonb,
    updated_at timestamptz
  )
  ON CONFLICT (recipe_id, target) DO UPDATE
  SET last_catchcopy = EXCLUDED.last_catchcopy,
      last_job_id = EXCLUDED.last_job_id,
      recipe_snapshot = EXCLUDED.recipe_snapshot,
      updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ec_catchcopy_codex_job(
  uuid, text, text, integer, text, text, jsonb, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ec_catchcopy_codex_job(
  uuid, text, text, integer, text, text, jsonb, timestamptz, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_recipe_ec_catchcopy_batch_jobs(
  p_job_ids uuid[],
  p_batch_id uuid,
  p_released_at timestamptz,
  p_authorized_by text
)
RETURNS TABLE(job_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_batch_id IS NULL OR COALESCE(cardinality(p_job_ids), 0) = 0
    OR NULLIF(trim(COALESCE(p_authorized_by, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Batch release parameters are invalid';
  END IF;

  RETURN QUERY
  WITH eligible AS MATERIALIZED (
    SELECT job.id
    FROM public.web_sales_codex_jobs AS job
    WHERE job.id = ANY(p_job_ids)
      AND job.task_key = 'ec_catchcopy_update'
      AND job.status = 'queued'
      AND job.parameters->>'dispatchMode' = 'reserved'
    FOR UPDATE
  ),
  released AS (
    UPDATE public.web_sales_codex_jobs AS job
    SET parameters = job.parameters || jsonb_build_object(
          'dispatchMode', 'batch',
          'batchId', p_batch_id::text,
          'batchSize', cardinality(p_job_ids),
          'releasedAt', p_released_at,
          'operatorAuthorization',
            COALESCE(job.parameters->'operatorAuthorization', '{}'::jsonb)
            || jsonb_build_object(
              'executionAuthorized', true,
              'source', 'tsa_batch_execution_confirmation',
              'authorizedAt', p_released_at,
              'authorizedBy', p_authorized_by
            )
        ),
        scheduled_at = p_released_at,
        current_step = '一括実行待ち',
        updated_at = p_released_at
    FROM eligible
    WHERE job.id = eligible.id
    RETURNING job.id
  )
  SELECT released.id FROM released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_recipe_ec_catchcopy_batch_jobs(uuid[], uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_recipe_ec_catchcopy_batch_jobs(uuid[], uuid, timestamptz, text)
  TO service_role;

-- Route catchcopy jobs only to a Bridge that advertises the matching protocol and Sol model.
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
