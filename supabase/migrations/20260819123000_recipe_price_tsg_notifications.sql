-- Durable TSG outbox state for recipe selling-price revisions.

ALTER TABLE public.recipe_ec_price_revisions
  ADD COLUMN IF NOT EXISTS tsg_post_status text,
  ADD COLUMN IF NOT EXISTS tsg_post_id text,
  ADD COLUMN IF NOT EXISTS tsg_board_id text,
  ADD COLUMN IF NOT EXISTS tsg_post_url text,
  ADD COLUMN IF NOT EXISTS tsg_post_error text,
  ADD COLUMN IF NOT EXISTS tsg_post_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tsg_post_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS tsg_posted_at timestamptz;

-- Historical revisions predate this integration and must not be announced retroactively.
UPDATE public.recipe_ec_price_revisions
SET tsg_post_status = 'skipped'
WHERE tsg_post_status IS NULL;

ALTER TABLE public.recipe_ec_price_revisions
  ALTER COLUMN tsg_post_status SET DEFAULT 'pending',
  ALTER COLUMN tsg_post_status SET NOT NULL;

ALTER TABLE public.recipe_ec_price_revisions
  DROP CONSTRAINT IF EXISTS recipe_ec_price_revisions_tsg_post_status_check;
ALTER TABLE public.recipe_ec_price_revisions
  ADD CONSTRAINT recipe_ec_price_revisions_tsg_post_status_check
  CHECK (tsg_post_status IN ('pending', 'posting', 'posted', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_recipe_ec_price_revisions_tsg_pending
  ON public.recipe_ec_price_revisions(tsg_post_status, created_at)
  WHERE tsg_post_status IN ('pending', 'posting', 'failed');

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
  'Claims pending recipe price revisions for idempotent TSG board delivery.';
