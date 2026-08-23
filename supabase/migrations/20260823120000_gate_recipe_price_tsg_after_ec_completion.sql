-- Post a saved recipe price change only after its EC/LP Bridge campaign completes.

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
  WHERE tsg_post_status = 'posting'
    AND tsg_post_last_attempt_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT revision.id
    FROM public.recipe_ec_price_revisions AS revision
    WHERE revision.tsg_post_status IN ('pending', 'failed')
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
  'Claims durable recipe price reports only after a later EC/LP Bridge job completed.';
