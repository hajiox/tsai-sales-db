-- Allow isolated Codex Bridge jobs that update saved recipe prices on selected EC sites.

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
    'ec_price_update'
  ));

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_period_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_period_check CHECK (
    (task_key = 'connection_test'
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
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
    (task_key = 'ec_price_update'
      AND channel IS NULL
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_ec_price_history
  ON public.web_sales_codex_jobs(task_key, status, created_at DESC)
  WHERE task_key = 'ec_price_update';

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_price_per_recipe
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_price_update'
    AND status IN ('queued', 'running');

COMMENT ON INDEX public.idx_web_sales_codex_jobs_ec_price_history IS
  'Fast lookup for recent isolated EC price update jobs.';
COMMENT ON INDEX public.idx_web_sales_codex_jobs_one_active_ec_price_per_recipe IS
  'Prevents duplicate concurrent EC price mutations for the same recipe.';

CREATE TABLE IF NOT EXISTS public.recipe_ec_price_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  previous_price_ex_tax numeric NOT NULL,
  new_price_ex_tax numeric NOT NULL,
  previous_price_incl_tax integer NOT NULL CHECK (previous_price_incl_tax > 0),
  new_price_incl_tax integer NOT NULL CHECK (new_price_incl_tax > 0),
  recipe_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ec_price_revisions_recipe_created
  ON public.recipe_ec_price_revisions(recipe_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.recipe_ec_price_sync_state (
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok')),
  last_standard_price_incl_tax integer NOT NULL CHECK (last_standard_price_incl_tax > 0),
  last_site_price integer NOT NULL CHECK (last_site_price > 0),
  last_job_id uuid NOT NULL REFERENCES public.web_sales_codex_jobs(id) ON DELETE RESTRICT,
  recipe_snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, target)
);

ALTER TABLE public.recipe_ec_price_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ec_price_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_ec_price_revisions FROM anon, authenticated;
REVOKE ALL ON public.recipe_ec_price_sync_state FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_recipe_ec_price_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.selling_price IS DISTINCT FROM NEW.selling_price
    AND COALESCE(OLD.selling_price, 0) > 0
    AND COALESCE(NEW.selling_price, 0) > 0 THEN
    INSERT INTO public.recipe_ec_price_revisions (
      recipe_id,
      previous_price_ex_tax,
      new_price_ex_tax,
      previous_price_incl_tax,
      new_price_incl_tax,
      recipe_snapshot
    ) VALUES (
      NEW.id,
      OLD.selling_price,
      NEW.selling_price,
      floor(floor(OLD.selling_price) * 1.08)::integer,
      floor(floor(NEW.selling_price) * 1.08)::integer,
      jsonb_build_object(
        'recipeId', NEW.id::text,
        'recipeName', left(btrim(COALESCE(NEW.name, '')), 200),
        'ecProductName', CASE WHEN NULLIF(btrim(COALESCE(NEW.ec_product_name, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.ec_product_name), 200) END,
        'linkedProductId', CASE WHEN NEW.linked_product_id IS NULL THEN NULL ELSE left(NEW.linked_product_id::text, 100) END,
        'janCode', CASE WHEN NULLIF(btrim(COALESCE(NEW.jan_code, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.jan_code), 32) END,
        'seriesCode', CASE WHEN NEW.series_code IS NULL THEN NULL ELSE left(btrim(NEW.series_code::text), 100) END,
        'productCode', CASE WHEN NEW.product_code IS NULL THEN NULL ELSE left(btrim(NEW.product_code::text), 100) END,
        'fillingQuantity', CASE WHEN NEW.filling_quantity IS NULL THEN NULL ELSE left(btrim(NEW.filling_quantity::text), 50) END,
        'fillingQuantityUnit', CASE WHEN NULLIF(btrim(COALESCE(NEW.filling_quantity_unit, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.filling_quantity_unit), 30) END,
        'storageMethod', CASE WHEN NULLIF(btrim(COALESCE(NEW.storage_method, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.storage_method), 100) END,
        'newPriceExTax', floor(NEW.selling_price)::integer,
        'newPriceInclTax', floor(floor(NEW.selling_price) * 1.08)::integer
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_recipe_ec_price_revision ON public.recipes;
CREATE TRIGGER trg_record_recipe_ec_price_revision
  AFTER UPDATE OF selling_price ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.record_recipe_ec_price_revision();

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
        SELECT 1
        FROM public.web_sales_codex_workers AS price_workers
        WHERE price_workers.id = p_worker_id
          AND price_workers.capabilities->>'ecPriceProtocolVersion' = '2'
      )
    )
  ORDER BY jobs.priority DESC, jobs.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

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

  RETURN QUERY
  SELECT * FROM public.web_sales_codex_jobs WHERE id = v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ec_price_codex_job(
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
    RAISE EXCEPTION 'invalid final EC price status';
  END IF;

  SELECT (parameters->>'recipeId')::uuid
  INTO v_recipe_id
  FROM public.web_sales_codex_jobs
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND task_key = 'ec_price_update'
    AND status = 'running'
  FOR UPDATE;

  IF v_recipe_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_sync_rows, '[]'::jsonb)) AS row_data(
      recipe_id uuid,
      target text,
      last_standard_price_incl_tax integer,
      last_site_price integer,
      last_job_id uuid,
      recipe_snapshot jsonb,
      updated_at timestamptz
    )
    WHERE row_data.recipe_id IS DISTINCT FROM v_recipe_id
      OR row_data.last_job_id IS DISTINCT FROM p_job_id
  ) THEN
    RAISE EXCEPTION 'EC price sync row does not belong to job';
  END IF;

  UPDATE public.web_sales_codex_jobs
  SET status = p_status,
      progress = CASE WHEN p_status = 'completed' THEN 100 ELSE LEAST(GREATEST(COALESCE(p_progress, 0), 0), 100) END,
      current_step = left(COALESCE(NULLIF(p_current_step, ''), '価格変更処理が終了しました'), 500),
      error_message = CASE WHEN p_error_message IS NULL THEN NULL ELSE left(p_error_message, 4000) END,
      result = COALESCE(p_result, result),
      heartbeat_at = p_completed_at,
      lease_expires_at = NULL,
      completed_at = p_completed_at,
      updated_at = p_completed_at
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND task_key = 'ec_price_update'
    AND status = 'running';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.recipe_ec_price_sync_state (
    recipe_id,
    target,
    last_standard_price_incl_tax,
    last_site_price,
    last_job_id,
    recipe_snapshot,
    updated_at
  )
  SELECT
    row_data.recipe_id,
    row_data.target,
    row_data.last_standard_price_incl_tax,
    row_data.last_site_price,
    row_data.last_job_id,
    row_data.recipe_snapshot,
    row_data.updated_at
  FROM jsonb_to_recordset(COALESCE(p_sync_rows, '[]'::jsonb)) AS row_data(
    recipe_id uuid,
    target text,
    last_standard_price_incl_tax integer,
    last_site_price integer,
    last_job_id uuid,
    recipe_snapshot jsonb,
    updated_at timestamptz
  )
  ON CONFLICT (recipe_id, target) DO UPDATE
  SET last_standard_price_incl_tax = EXCLUDED.last_standard_price_incl_tax,
      last_site_price = EXCLUDED.last_site_price,
      last_job_id = EXCLUDED.last_job_id,
      recipe_snapshot = EXCLUDED.recipe_snapshot,
      updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ec_price_codex_job(
  uuid, text, text, integer, text, text, jsonb, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ec_price_codex_job(
  uuid, text, text, integer, text, text, jsonb, timestamptz, jsonb
) TO service_role;
