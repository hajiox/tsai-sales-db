-- Durable recipe SNS publication queue, schedule, audit trail, and guarded Bridge routing.

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
    'recipe_sns_publish',
    'ec_product_content_update',
    'ec_product_content_generate',
    'ingredient_label_generate',
    'docscanner_fax_summary'
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
        'recipe_sns_publish',
        'ec_product_content_update',
        'ec_product_content_generate',
        'ingredient_label_generate',
        'docscanner_fax_summary'
      )
      AND channel IS NULL
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
  );

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_trigger_type_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_trigger_type_check
  CHECK (trigger_type IN (
    'manual',
    'scheduled_half_month',
    'scheduled_previous_month',
    'scheduled_social',
    'retry',
    'test'
  ));

CREATE TABLE IF NOT EXISTS public.recipe_sns_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.web_sales_codex_jobs(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL REFERENCES public.recipe_sns_generations(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN (
    'scheduled', 'queued', 'running', 'completed', 'partial',
    'waiting_for_user', 'needs_review', 'failed', 'cancelled'
  )),
  targets text[] NOT NULL CHECK (
    cardinality(targets) BETWEEN 1 AND 4
    AND targets <@ ARRAY['x', 'instagram', 'instagram_story', 'threads']::text[]
  ),
  scheduled_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  platform_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  created_by text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_sns_publications_recipe_created
  ON public.recipe_sns_publications(recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_sns_publications_status_scheduled
  ON public.recipe_sns_publications(status, scheduled_at);

ALTER TABLE public.recipe_sns_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_sns_publications FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_recipe_sns_publication(
  p_publication_id uuid,
  p_recipe_id uuid,
  p_generation_id uuid,
  p_targets text[],
  p_scheduled_at timestamptz,
  p_payload jsonb,
  p_idempotency_key text,
  p_requested_by text,
  p_job_parameters jsonb
)
RETURNS TABLE(publication_id uuid, job_id uuid, reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.recipe_sns_publications%ROWTYPE;
  v_job_id uuid;
  v_now timestamptz := now();
  v_is_scheduled boolean := p_scheduled_at > v_now + interval '30 seconds';
BEGIN
  IF p_targets IS NULL
    OR cardinality(p_targets) NOT BETWEEN 1 AND 4
    OR NOT (p_targets <@ ARRAY['x', 'instagram', 'instagram_story', 'threads']::text[])
    OR cardinality(p_targets) <> (SELECT count(DISTINCT target) FROM unnest(p_targets) AS target)
  THEN
    RAISE EXCEPTION 'SNS publication targets are invalid';
  END IF;
  IF p_scheduled_at IS NULL OR p_payload IS NULL OR length(trim(p_idempotency_key)) < 32 THEN
    RAISE EXCEPTION 'SNS publication request is incomplete';
  END IF;

  -- Serialize identical button submissions before checking the unique key.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  SELECT publications.* INTO v_existing
  FROM public.recipe_sns_publications AS publications
  WHERE publications.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.job_id, true;
    RETURN;
  END IF;

  IF NOT v_is_scheduled AND EXISTS (
    SELECT 1
    FROM public.recipe_sns_publications AS active_publication
    WHERE active_publication.generation_id = p_generation_id
      AND active_publication.status IN ('queued', 'running')
      AND active_publication.scheduled_at <= v_now + interval '30 seconds'
      AND active_publication.targets && p_targets
  ) THEN
    RAISE EXCEPTION '同じ生成履歴の対象SNSはすでに投稿待ちまたは実行中です';
  END IF;

  INSERT INTO public.web_sales_codex_jobs (
    task_key, channel, trigger_type, period_start, period_end, report_month,
    status, progress, current_step, requested_by, parameters, priority,
    max_attempts, scheduled_at
  ) VALUES (
    'recipe_sns_publish', NULL,
    CASE WHEN v_is_scheduled THEN 'scheduled_social' ELSE 'manual' END,
    NULL, NULL, NULL,
    'queued', 0,
    CASE WHEN v_is_scheduled THEN 'SNS予約時刻を待っています' ELSE 'SNS投稿待ち' END,
    p_requested_by, p_job_parameters, 45, 1, p_scheduled_at
  )
  RETURNING id INTO v_job_id;

  INSERT INTO public.recipe_sns_publications (
    id, job_id, recipe_id, generation_id, status, targets, scheduled_at,
    payload, idempotency_key, created_by
  ) VALUES (
    p_publication_id, v_job_id, p_recipe_id, p_generation_id,
    CASE WHEN v_is_scheduled THEN 'scheduled' ELSE 'queued' END,
    p_targets, p_scheduled_at, p_payload, p_idempotency_key, p_requested_by
  );

  INSERT INTO public.web_sales_codex_job_events(job_id, event_type, message, progress, payload)
  VALUES (
    v_job_id,
    CASE WHEN v_is_scheduled THEN 'sns_publish_scheduled' ELSE 'sns_publish_queued' END,
    CASE WHEN v_is_scheduled THEN 'SNS投稿予約を登録しました' ELSE 'SNS投稿を登録しました' END,
    0,
    jsonb_build_object('publicationId', p_publication_id, 'targets', p_targets, 'scheduledAt', p_scheduled_at)
  );

  RETURN QUERY SELECT p_publication_id, v_job_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_recipe_sns_publication(
  p_publication_id uuid,
  p_recipe_id uuid,
  p_cancelled_by text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT publication.job_id INTO v_job_id
  FROM public.recipe_sns_publications AS publication
  WHERE publication.id = p_publication_id
    AND publication.recipe_id = p_recipe_id
    AND publication.status IN ('scheduled', 'queued')
  FOR UPDATE;
  IF v_job_id IS NULL THEN RETURN false; END IF;

  UPDATE public.web_sales_codex_jobs
  SET status = 'cancelled',
      progress = 100,
      current_step = 'SNS投稿予約を取り消しました',
      completed_at = now(),
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = v_job_id AND status = 'queued';
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.recipe_sns_publications
  SET status = 'cancelled', completed_at = now(), updated_at = now()
  WHERE id = p_publication_id;

  INSERT INTO public.web_sales_codex_job_events(job_id, event_type, message, progress, payload)
  VALUES (v_job_id, 'sns_publish_cancelled', 'SNS投稿予約を取り消しました', 100,
    jsonb_build_object('cancelledBy', p_cancelled_by));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_recipe_sns_publish_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_progress integer,
  p_current_step text,
  p_error_message text,
  p_result jsonb,
  p_completed_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_success_count integer := 0;
  v_publication_status text;
BEGIN
  IF p_status NOT IN ('completed', 'waiting_for_user', 'needs_review', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid SNS publication completion status';
  END IF;
  SELECT count(*) INTO v_success_count
  FROM jsonb_array_elements(COALESCE(p_result->'platforms', '[]'::jsonb)) AS platform
  WHERE platform->>'status' IN ('published', 'already_published');

  v_publication_status := CASE
    WHEN p_status = 'completed' THEN 'completed'
    WHEN p_status = 'needs_review' AND v_success_count > 0 THEN 'partial'
    WHEN p_status = 'waiting_for_user' THEN 'waiting_for_user'
    WHEN p_status = 'needs_review' THEN 'needs_review'
    WHEN p_status = 'cancelled' THEN 'cancelled'
    ELSE 'failed'
  END;

  UPDATE public.web_sales_codex_jobs
  SET status = p_status,
      progress = LEAST(GREATEST(p_progress, 0), 100),
      current_step = left(COALESCE(p_current_step, ''), 500),
      error_message = NULLIF(left(COALESCE(p_error_message, ''), 4000), ''),
      result = p_result,
      heartbeat_at = p_completed_at,
      lease_expires_at = NULL,
      completed_at = p_completed_at,
      updated_at = p_completed_at
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND task_key = 'recipe_sns_publish'
    AND status = 'running';
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.recipe_sns_publications
  SET status = v_publication_status,
      platform_results = COALESCE(p_result->'platforms', '[]'::jsonb),
      error_message = NULLIF(left(COALESCE(p_error_message, ''), 4000), ''),
      started_at = COALESCE(
        started_at,
        (SELECT jobs.started_at FROM public.web_sales_codex_jobs AS jobs WHERE jobs.id = p_job_id),
        p_completed_at
      ),
      completed_at = p_completed_at,
      updated_at = p_completed_at
  WHERE job_id = p_job_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_recipe_sns_publication(uuid, uuid, uuid, text[], timestamptz, jsonb, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_recipe_sns_publication(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_recipe_sns_publish_job(uuid, text, text, integer, text, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_recipe_sns_publication(uuid, uuid, uuid, text[], timestamptz, jsonb, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_recipe_sns_publication(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_recipe_sns_publish_job(uuid, text, text, integer, text, text, jsonb, timestamptz) TO service_role;

DO $recipe_sns_publish_claim$
DECLARE
  v_definition text;
  v_order_by text := '  ORDER BY jobs.priority DESC, jobs.created_at';
  v_guard text := $guard$    AND (jobs.task_key <> 'recipe_sns_publish' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'recipeSnsPublishProtocolVersion' = '1'
        AND worker.capabilities->>'chrome' = 'true'
        AND worker.capabilities->>'executionMode' = 'interactive'
    ))
$guard$;
BEGIN
  SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure)
    INTO v_definition;
  IF position('recipeSnsPublishProtocolVersion' IN v_definition) > 0 THEN RETURN; END IF;
  IF position(v_order_by IN v_definition) = 0 THEN
    RAISE EXCEPTION 'claim_web_sales_codex_job insertion point was not found';
  END IF;
  EXECUTE replace(v_definition, v_order_by, v_guard || v_order_by);
END
$recipe_sns_publish_claim$;

COMMENT ON TABLE public.recipe_sns_publications IS
  'Immutable SNS publication requests, schedules, and per-platform external posting results.';
COMMENT ON FUNCTION public.claim_web_sales_codex_job(text, integer) IS
  'Claims jobs only when the worker advertises each task-specific protocol, model, reasoning, and browser contract.';
