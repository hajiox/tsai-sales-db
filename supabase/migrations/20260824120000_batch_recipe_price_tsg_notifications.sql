-- Group reserved EC price campaigns into one durable TSG completion report.

ALTER TABLE public.recipe_ec_price_revisions
  ADD COLUMN IF NOT EXISTS tsg_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_recipe_ec_price_revisions_tsg_batch
  ON public.recipe_ec_price_revisions(tsg_batch_id, tsg_post_status, created_at)
  WHERE tsg_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.release_recipe_ec_price_batch_jobs(
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
  IF p_batch_id IS NULL
    OR COALESCE(cardinality(p_job_ids), 0) = 0
    OR NULLIF(trim(COALESCE(p_authorized_by, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Batch release parameters are invalid';
  END IF;

  RETURN QUERY
  WITH eligible AS MATERIALIZED (
    SELECT job.id,
           job.parameters,
           NULLIF(job.parameters->>'priceRevisionId', '')::uuid AS price_revision_id
    FROM public.web_sales_codex_jobs AS job
    WHERE job.id = ANY(p_job_ids)
      AND job.task_key = 'ec_price_update'
      AND job.status = 'queued'
      AND job.parameters->>'dispatchMode' = 'reserved'
    FOR UPDATE
  ),
  tagged AS (
    UPDATE public.recipe_ec_price_revisions AS revision
    SET tsg_batch_id = p_batch_id
    FROM eligible
    WHERE eligible.price_revision_id IS NOT NULL
      AND revision.id = eligible.price_revision_id
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
  SELECT released.id
  FROM released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_recipe_ec_price_batch_jobs(uuid[], uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_recipe_ec_price_batch_jobs(uuid[], uuid, timestamptz, text)
  TO service_role;

COMMENT ON FUNCTION public.release_recipe_ec_price_batch_jobs(uuid[], uuid, timestamptz, text) IS
  'Atomically releases reserved EC price jobs and assigns their price revisions to one TSG batch report.';

CREATE OR REPLACE FUNCTION public.claim_recipe_price_tsg_batch_notifications(
  p_batch_id uuid DEFAULT NULL
)
RETURNS SETOF public.recipe_ec_price_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipe_ec_price_revisions
  SET tsg_post_status = 'failed',
      tsg_post_error = 'TSG一括投稿処理が中断されたため再試行します',
      tsg_post_last_attempt_at = now()
  WHERE tsg_batch_id IS NOT NULL
    AND tsg_post_status = 'posting'
    AND tsg_post_last_attempt_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH ready_batch AS (
    SELECT revision.tsg_batch_id,
           min(revision.created_at) AS first_created_at
    FROM public.recipe_ec_price_revisions AS revision
    WHERE revision.tsg_batch_id IS NOT NULL
      AND revision.tsg_post_status IN ('pending', 'failed')
      AND revision.tsg_post_attempt_count < 10
      AND (p_batch_id IS NULL OR revision.tsg_batch_id = p_batch_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.recipe_ec_price_revisions AS exhausted
        WHERE exhausted.tsg_batch_id = revision.tsg_batch_id
          AND exhausted.tsg_post_status IN ('pending', 'failed')
          AND exhausted.tsg_post_attempt_count >= 10
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.recipe_ec_price_revisions AS expected
        WHERE expected.tsg_batch_id = revision.tsg_batch_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.web_sales_codex_jobs AS completed_job
            WHERE completed_job.task_key = 'ec_price_update'
              AND completed_job.status = 'completed'
              AND completed_job.parameters->>'batchId' = revision.tsg_batch_id::text
              AND completed_job.parameters->>'priceRevisionId' = expected.id::text
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.web_sales_codex_jobs AS active_job
        WHERE active_job.task_key = 'ec_price_update'
          AND active_job.status IN ('queued', 'running')
          AND active_job.parameters->>'batchId' = revision.tsg_batch_id::text
      )
    GROUP BY revision.tsg_batch_id
    ORDER BY min(revision.created_at)
    LIMIT 1
  ),
  candidates AS (
    SELECT revision.id
    FROM public.recipe_ec_price_revisions AS revision
    JOIN ready_batch ON ready_batch.tsg_batch_id = revision.tsg_batch_id
    WHERE revision.tsg_post_status IN ('pending', 'failed')
      AND revision.tsg_post_attempt_count < 10
    ORDER BY revision.created_at, revision.id
    FOR UPDATE OF revision SKIP LOCKED
  )
  UPDATE public.recipe_ec_price_revisions AS revision
  SET tsg_post_status = 'posting',
      tsg_post_attempt_count = revision.tsg_post_attempt_count + 1,
      tsg_post_last_attempt_at = now(),
      tsg_post_error = NULL
  FROM candidates
  WHERE revision.id = candidates.id
  RETURNING revision.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_recipe_price_tsg_batch_notifications(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recipe_price_tsg_batch_notifications(uuid)
  TO service_role;

COMMENT ON FUNCTION public.claim_recipe_price_tsg_batch_notifications(uuid) IS
  'Claims all revisions in one fully completed EC price batch for one idempotent TSG post.';

CREATE OR REPLACE FUNCTION public.claim_recipe_price_tsg_notifications(
  p_limit integer DEFAULT 20,
  p_recipe_id uuid DEFAULT NULL
)
RETURNS SETOF public.recipe_ec_price_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipe_ec_price_revisions
  SET tsg_post_status = 'failed',
      tsg_post_error = 'TSG投稿処理が中断されたため再試行します',
      tsg_post_last_attempt_at = now()
  WHERE tsg_batch_id IS NULL
    AND tsg_post_status = 'posting'
    AND tsg_post_last_attempt_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT revision.id
    FROM public.recipe_ec_price_revisions AS revision
    WHERE revision.tsg_batch_id IS NULL
      AND revision.tsg_post_status IN ('pending', 'failed')
      AND revision.tsg_post_attempt_count < 10
      AND (p_recipe_id IS NULL OR revision.recipe_id = p_recipe_id)
      AND EXISTS (
        SELECT 1
        FROM public.web_sales_codex_jobs AS job
        WHERE job.task_key = 'ec_price_update'
          AND job.status = 'completed'
          AND job.parameters->>'recipeId' = revision.recipe_id::text
          AND job.created_at >= revision.created_at
      )
    ORDER BY revision.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  )
  UPDATE public.recipe_ec_price_revisions AS revision
  SET tsg_post_status = 'posting',
      tsg_post_attempt_count = revision.tsg_post_attempt_count + 1,
      tsg_post_last_attempt_at = now(),
      tsg_post_error = NULL
  FROM candidates
  WHERE revision.id = candidates.id
  RETURNING revision.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_recipe_price_tsg_notifications(integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recipe_price_tsg_notifications(integer, uuid)
  TO service_role;

COMMENT ON FUNCTION public.claim_recipe_price_tsg_notifications(integer, uuid) IS
  'Claims non-batch recipe price reports after a later EC/LP Bridge job completed.';
