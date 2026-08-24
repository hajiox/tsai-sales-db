-- Durable EC product-name mutations, per-site sync history, and TSG outbox.

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
    'ec_product_name_update'
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
    (task_key IN ('ec_price_update', 'ec_product_name_update')
      AND channel IS NULL
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_ec_product_name_history
  ON public.web_sales_codex_jobs(task_key, status, created_at DESC)
  WHERE task_key = 'ec_product_name_update';

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_product_name_per_recipe
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_product_name_update'
    AND status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS public.recipe_ec_product_name_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  previous_product_name text,
  new_product_name text NOT NULL CHECK (length(btrim(new_product_name)) BETWEEN 1 AND 75),
  recipe_snapshot jsonb NOT NULL,
  tsg_batch_id uuid,
  tsg_post_status text NOT NULL DEFAULT 'pending'
    CHECK (tsg_post_status IN ('pending', 'posting', 'posted', 'failed', 'skipped')),
  tsg_post_id text,
  tsg_board_id text,
  tsg_post_url text,
  tsg_post_error text,
  tsg_post_attempt_count integer NOT NULL DEFAULT 0,
  tsg_post_last_attempt_at timestamptz,
  tsg_posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ec_product_name_revisions_recipe_created
  ON public.recipe_ec_product_name_revisions(recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_ec_product_name_revisions_tsg_pending
  ON public.recipe_ec_product_name_revisions(tsg_post_status, created_at)
  WHERE tsg_post_status IN ('pending', 'posting', 'failed');
CREATE INDEX IF NOT EXISTS idx_recipe_ec_product_name_revisions_tsg_batch
  ON public.recipe_ec_product_name_revisions(tsg_batch_id, tsg_post_status, created_at)
  WHERE tsg_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recipe_ec_product_name_sync_state (
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok')),
  last_product_name text NOT NULL CHECK (length(btrim(last_product_name)) BETWEEN 1 AND 200),
  last_job_id uuid NOT NULL REFERENCES public.web_sales_codex_jobs(id) ON DELETE RESTRICT,
  recipe_snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, target)
);

ALTER TABLE public.recipe_ec_product_name_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ec_product_name_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_ec_product_name_revisions FROM anon, authenticated;
REVOKE ALL ON public.recipe_ec_product_name_sync_state FROM anon, authenticated;

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
  IF OLD.ec_product_name IS DISTINCT FROM NEW.ec_product_name AND v_new_name <> '' THEN
    UPDATE public.recipe_ec_product_name_revisions
    SET tsg_post_status = 'skipped',
        tsg_post_error = 'EC反映前に新しい商品名へ変更されたため報告対象外'
    WHERE recipe_id = NEW.id
      AND tsg_post_status IN ('pending', 'failed');

    INSERT INTO public.recipe_ec_product_name_revisions (
      recipe_id,
      previous_product_name,
      new_product_name,
      recipe_snapshot
    ) VALUES (
      NEW.id,
      v_old_name,
      v_new_name,
      jsonb_build_object(
        'recipeId', NEW.id::text,
        'recipeName', left(btrim(COALESCE(NEW.name, '')), 200),
        'ecProductName', v_new_name,
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
  AFTER UPDATE OF ec_product_name ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.record_recipe_ec_product_name_revision();

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
          AND name_workers.capabilities->>'ecProductNameProtocolVersion' = '1'
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

CREATE OR REPLACE FUNCTION public.complete_ec_product_name_codex_job(
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
    RAISE EXCEPTION 'invalid final EC product name status';
  END IF;

  SELECT (parameters->>'recipeId')::uuid INTO v_recipe_id
  FROM public.web_sales_codex_jobs
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND task_key = 'ec_product_name_update'
    AND status = 'running'
  FOR UPDATE;
  IF v_recipe_id IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_sync_rows, '[]'::jsonb)) AS row_data(
      recipe_id uuid,
      target text,
      last_product_name text,
      last_job_id uuid,
      recipe_snapshot jsonb,
      updated_at timestamptz
    )
    WHERE row_data.recipe_id IS DISTINCT FROM v_recipe_id
      OR row_data.last_job_id IS DISTINCT FROM p_job_id
  ) THEN
    RAISE EXCEPTION 'EC product name sync row does not belong to job';
  END IF;

  UPDATE public.web_sales_codex_jobs
  SET status = p_status,
      progress = CASE WHEN p_status = 'completed' THEN 100 ELSE LEAST(GREATEST(COALESCE(p_progress, 0), 0), 100) END,
      current_step = left(COALESCE(NULLIF(p_current_step, ''), 'EC商品名変更処理が終了しました'), 500),
      error_message = CASE WHEN p_error_message IS NULL THEN NULL ELSE left(p_error_message, 4000) END,
      result = COALESCE(p_result, result),
      heartbeat_at = p_completed_at,
      lease_expires_at = NULL,
      completed_at = p_completed_at,
      updated_at = p_completed_at
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND task_key = 'ec_product_name_update'
    AND status = 'running';
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.recipe_ec_product_name_sync_state (
    recipe_id, target, last_product_name, last_job_id, recipe_snapshot, updated_at
  )
  SELECT row_data.recipe_id, row_data.target, row_data.last_product_name,
         row_data.last_job_id, row_data.recipe_snapshot, row_data.updated_at
  FROM jsonb_to_recordset(COALESCE(p_sync_rows, '[]'::jsonb)) AS row_data(
    recipe_id uuid,
    target text,
    last_product_name text,
    last_job_id uuid,
    recipe_snapshot jsonb,
    updated_at timestamptz
  )
  ON CONFLICT (recipe_id, target) DO UPDATE
  SET last_product_name = EXCLUDED.last_product_name,
      last_job_id = EXCLUDED.last_job_id,
      recipe_snapshot = EXCLUDED.recipe_snapshot,
      updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ec_product_name_codex_job(
  uuid, text, text, integer, text, text, jsonb, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ec_product_name_codex_job(
  uuid, text, text, integer, text, text, jsonb, timestamptz, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_recipe_ec_product_name_batch_jobs(
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
    SELECT job.id, job.parameters,
           NULLIF(job.parameters->>'productNameRevisionId', '')::uuid AS revision_id
    FROM public.web_sales_codex_jobs AS job
    WHERE job.id = ANY(p_job_ids)
      AND job.task_key = 'ec_product_name_update'
      AND job.status = 'queued'
      AND job.parameters->>'dispatchMode' = 'reserved'
    FOR UPDATE
  ),
  tagged AS (
    UPDATE public.recipe_ec_product_name_revisions AS revision
    SET tsg_batch_id = p_batch_id
    FROM eligible
    WHERE eligible.revision_id IS NOT NULL AND revision.id = eligible.revision_id
    RETURNING revision.id
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

REVOKE ALL ON FUNCTION public.release_recipe_ec_product_name_batch_jobs(uuid[], uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_recipe_ec_product_name_batch_jobs(uuid[], uuid, timestamptz, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_recipe_product_name_tsg_batch_notifications(
  p_batch_id uuid DEFAULT NULL
)
RETURNS SETOF public.recipe_ec_product_name_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipe_ec_product_name_revisions
  SET tsg_post_status = 'failed',
      tsg_post_error = 'TSG一括投稿処理が中断されたため再試行します',
      tsg_post_last_attempt_at = now()
  WHERE tsg_batch_id IS NOT NULL
    AND tsg_post_status = 'posting'
    AND tsg_post_last_attempt_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH ready_batch AS (
    SELECT revision.tsg_batch_id, min(revision.created_at) AS first_created_at
    FROM public.recipe_ec_product_name_revisions AS revision
    WHERE revision.tsg_batch_id IS NOT NULL
      AND revision.tsg_post_status IN ('pending', 'failed')
      AND revision.tsg_post_attempt_count < 10
      AND (p_batch_id IS NULL OR revision.tsg_batch_id = p_batch_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.recipe_ec_product_name_revisions AS exhausted
        WHERE exhausted.tsg_batch_id = revision.tsg_batch_id
          AND exhausted.tsg_post_status IN ('pending', 'failed')
          AND exhausted.tsg_post_attempt_count >= 10
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.recipe_ec_product_name_revisions AS expected
        WHERE expected.tsg_batch_id = revision.tsg_batch_id
          AND NOT EXISTS (
            SELECT 1 FROM public.web_sales_codex_jobs AS completed_job
            WHERE completed_job.task_key = 'ec_product_name_update'
              AND completed_job.status = 'completed'
              AND completed_job.parameters->>'batchId' = revision.tsg_batch_id::text
              AND completed_job.parameters->>'productNameRevisionId' = expected.id::text
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.web_sales_codex_jobs AS active_job
        WHERE active_job.task_key = 'ec_product_name_update'
          AND active_job.status IN ('queued', 'running')
          AND active_job.parameters->>'batchId' = revision.tsg_batch_id::text
      )
    GROUP BY revision.tsg_batch_id
    ORDER BY min(revision.created_at)
    LIMIT 1
  ),
  candidates AS (
    SELECT revision.id
    FROM public.recipe_ec_product_name_revisions AS revision
    JOIN ready_batch ON ready_batch.tsg_batch_id = revision.tsg_batch_id
    WHERE revision.tsg_post_status IN ('pending', 'failed')
      AND revision.tsg_post_attempt_count < 10
    ORDER BY revision.created_at, revision.id
    FOR UPDATE OF revision SKIP LOCKED
  )
  UPDATE public.recipe_ec_product_name_revisions AS revision
  SET tsg_post_status = 'posting',
      tsg_post_attempt_count = revision.tsg_post_attempt_count + 1,
      tsg_post_last_attempt_at = now(),
      tsg_post_error = NULL
  FROM candidates
  WHERE revision.id = candidates.id
  RETURNING revision.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_recipe_product_name_tsg_batch_notifications(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recipe_product_name_tsg_batch_notifications(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_recipe_product_name_tsg_notifications(
  p_limit integer DEFAULT 20,
  p_recipe_id uuid DEFAULT NULL
)
RETURNS SETOF public.recipe_ec_product_name_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipe_ec_product_name_revisions
  SET tsg_post_status = 'failed',
      tsg_post_error = 'TSG投稿処理が中断されたため再試行します',
      tsg_post_last_attempt_at = now()
  WHERE tsg_batch_id IS NULL
    AND tsg_post_status = 'posting'
    AND tsg_post_last_attempt_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT revision.id
    FROM public.recipe_ec_product_name_revisions AS revision
    WHERE revision.tsg_batch_id IS NULL
      AND revision.tsg_post_status IN ('pending', 'failed')
      AND revision.tsg_post_attempt_count < 10
      AND (p_recipe_id IS NULL OR revision.recipe_id = p_recipe_id)
      AND EXISTS (
        SELECT 1 FROM public.web_sales_codex_jobs AS job
        WHERE job.task_key = 'ec_product_name_update'
          AND job.status = 'completed'
          AND job.parameters->>'productNameRevisionId' = revision.id::text
      )
    ORDER BY revision.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  )
  UPDATE public.recipe_ec_product_name_revisions AS revision
  SET tsg_post_status = 'posting',
      tsg_post_attempt_count = revision.tsg_post_attempt_count + 1,
      tsg_post_last_attempt_at = now(),
      tsg_post_error = NULL
  FROM candidates
  WHERE revision.id = candidates.id
  RETURNING revision.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_recipe_product_name_tsg_notifications(integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recipe_product_name_tsg_notifications(integer, uuid)
  TO service_role;
