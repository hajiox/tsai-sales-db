-- Per-marketplace EC names and GPT-5.6 Terra generation audit.

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
    'ec_product_name_generate'
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
    (task_key IN ('ec_price_update', 'ec_product_name_update', 'ec_product_name_generate')
      AND channel IS NULL
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_product_name_generation
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_product_name_generate'
    AND status IN ('queued', 'running');

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS ec_product_names_by_site jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.recipes
SET ec_product_names_by_site = jsonb_build_object(
  'amazon', left(btrim(ec_product_name), 75),
  'rakuten', left(btrim(ec_product_name), 127),
  'yahoo', left(btrim(ec_product_name), 75),
  'mercari', left(btrim(ec_product_name), 130),
  'base', left(btrim(ec_product_name), 255),
  'qoo10', left(btrim(ec_product_name), 100),
  'tiktok', left(btrim(ec_product_name), 255)
)
WHERE NULLIF(btrim(COALESCE(ec_product_name, '')), '') IS NOT NULL
  AND ec_product_names_by_site = '{}'::jsonb;

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_ec_product_names_by_site_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_ec_product_names_by_site_check CHECK (
    jsonb_typeof(ec_product_names_by_site) = 'object'
    AND (ec_product_names_by_site - ARRAY['amazon','rakuten','yahoo','mercari','base','qoo10','tiktok']) = '{}'::jsonb
    AND (NOT ec_product_names_by_site ? 'amazon' OR (jsonb_typeof(ec_product_names_by_site->'amazon') = 'string' AND length(btrim(ec_product_names_by_site->>'amazon')) BETWEEN 1 AND 75))
    AND (NOT ec_product_names_by_site ? 'rakuten' OR (jsonb_typeof(ec_product_names_by_site->'rakuten') = 'string' AND length(btrim(ec_product_names_by_site->>'rakuten')) BETWEEN 1 AND 127))
    AND (NOT ec_product_names_by_site ? 'yahoo' OR (jsonb_typeof(ec_product_names_by_site->'yahoo') = 'string' AND length(btrim(ec_product_names_by_site->>'yahoo')) BETWEEN 1 AND 75))
    AND (NOT ec_product_names_by_site ? 'mercari' OR (jsonb_typeof(ec_product_names_by_site->'mercari') = 'string' AND length(btrim(ec_product_names_by_site->>'mercari')) BETWEEN 1 AND 130))
    AND (NOT ec_product_names_by_site ? 'base' OR (jsonb_typeof(ec_product_names_by_site->'base') = 'string' AND length(btrim(ec_product_names_by_site->>'base')) BETWEEN 1 AND 255))
    AND (NOT ec_product_names_by_site ? 'qoo10' OR (jsonb_typeof(ec_product_names_by_site->'qoo10') = 'string' AND length(btrim(ec_product_names_by_site->>'qoo10')) BETWEEN 1 AND 100))
    AND (NOT ec_product_names_by_site ? 'tiktok' OR (jsonb_typeof(ec_product_names_by_site->'tiktok') = 'string' AND length(btrim(ec_product_names_by_site->>'tiktok')) BETWEEN 1 AND 255))
  );

ALTER TABLE public.recipe_ec_product_name_revisions
  ADD COLUMN IF NOT EXISTS previous_product_names_by_site jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS new_product_names_by_site jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.recipe_ec_product_name_revisions
SET previous_product_names_by_site = CASE
      WHEN NULLIF(btrim(COALESCE(previous_product_name, '')), '') IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object(
        'amazon', left(btrim(previous_product_name), 75), 'rakuten', left(btrim(previous_product_name), 127),
        'yahoo', left(btrim(previous_product_name), 75), 'mercari', left(btrim(previous_product_name), 130),
        'base', left(btrim(previous_product_name), 255), 'qoo10', left(btrim(previous_product_name), 100),
        'tiktok', left(btrim(previous_product_name), 255)) END,
    new_product_names_by_site = jsonb_build_object(
      'amazon', left(btrim(new_product_name), 75), 'rakuten', left(btrim(new_product_name), 127),
      'yahoo', left(btrim(new_product_name), 75), 'mercari', left(btrim(new_product_name), 130),
      'base', left(btrim(new_product_name), 255), 'qoo10', left(btrim(new_product_name), 100),
      'tiktok', left(btrim(new_product_name), 255))
WHERE new_product_names_by_site = '{}'::jsonb;

ALTER TABLE public.recipe_ec_product_name_sync_state
  DROP CONSTRAINT IF EXISTS recipe_ec_product_name_sync_state_last_product_name_check;
ALTER TABLE public.recipe_ec_product_name_sync_state
  ADD CONSTRAINT recipe_ec_product_name_sync_state_last_product_name_check
  CHECK (length(btrim(last_product_name)) BETWEEN 1 AND 255);

CREATE TABLE IF NOT EXISTS public.recipe_ec_product_name_ai_generations (
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
CREATE INDEX IF NOT EXISTS idx_recipe_ec_product_name_ai_generations_recipe_created
  ON public.recipe_ec_product_name_ai_generations(recipe_id, created_at DESC);
ALTER TABLE public.recipe_ec_product_name_ai_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_ec_product_name_ai_generations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_recipe_ec_product_name_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_name text := left(btrim(COALESCE(NEW.ec_product_name, '')), 75);
  v_old_name text := NULLIF(left(btrim(COALESCE(OLD.ec_product_name, '')), 75), '');
BEGIN
  IF (OLD.ec_product_name IS DISTINCT FROM NEW.ec_product_name
      OR OLD.ec_product_names_by_site IS DISTINCT FROM NEW.ec_product_names_by_site)
     AND (v_new_name <> '' OR NEW.ec_product_names_by_site <> '{}'::jsonb) THEN
    UPDATE public.recipe_ec_product_name_revisions
    SET tsg_post_status = 'skipped',
        tsg_post_error = 'EC反映前に新しい商品名へ変更されたため報告対象外'
    WHERE recipe_id = NEW.id
      AND tsg_post_status IN ('pending', 'failed');

    INSERT INTO public.recipe_ec_product_name_revisions (
      recipe_id, previous_product_name, new_product_name,
      previous_product_names_by_site, new_product_names_by_site, recipe_snapshot
    ) VALUES (
      NEW.id, v_old_name, COALESCE(NULLIF(v_new_name, ''), left(NEW.ec_product_names_by_site->>'amazon', 75), left(NEW.name, 75)),
      COALESCE(OLD.ec_product_names_by_site, '{}'::jsonb), COALESCE(NEW.ec_product_names_by_site, '{}'::jsonb),
      jsonb_build_object(
        'recipeId', NEW.id::text,
        'recipeName', left(btrim(COALESCE(NEW.name, '')), 200),
        'ecProductName', v_new_name,
        'ecProductNamesBySite', COALESCE(NEW.ec_product_names_by_site, '{}'::jsonb),
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

DROP TRIGGER IF EXISTS trg_record_recipe_ec_product_name_revision ON public.recipes;
CREATE TRIGGER trg_record_recipe_ec_product_name_revision
  AFTER UPDATE OF ec_product_name, ec_product_names_by_site ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.record_recipe_ec_product_name_revision();

-- Protocol 2 is required because the immutable target name is now site-specific.
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
    AND (
      jobs.task_key <> 'ec_price_update'
      OR EXISTS (
        SELECT 1 FROM public.web_sales_codex_workers AS price_workers
        WHERE price_workers.id = p_worker_id
          AND price_workers.capabilities->>'ecPriceProtocolVersion' = '3'
      )
    )
    AND (
      jobs.task_key <> 'ec_product_name_update'
      OR EXISTS (
        SELECT 1 FROM public.web_sales_codex_workers AS name_workers
        WHERE name_workers.id = p_worker_id
          AND name_workers.capabilities->>'ecProductNameProtocolVersion' = '2'
      )
    )
    AND (
      jobs.task_key <> 'ec_product_name_generate'
      OR EXISTS (
        SELECT 1 FROM public.web_sales_codex_workers AS generation_workers
        WHERE generation_workers.id = p_worker_id
          AND generation_workers.capabilities->>'ecProductNameAiProtocolVersion' = '1'
          AND generation_workers.capabilities->>'ecProductNameAiModel' = 'gpt-5.6-terra'
      )
    )
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
