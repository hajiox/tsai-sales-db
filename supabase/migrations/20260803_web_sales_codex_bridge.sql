-- Durable queue for browser-based EC sales imports executed by the office Codex PC.

CREATE TABLE IF NOT EXISTS public.web_sales_codex_workers (
  id text PRIMARY KEY,
  name text NOT NULL,
  version text,
  status text NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online', 'busy', 'offline', 'error')),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_job_id uuid,
  last_error text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.web_sales_codex_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key text NOT NULL DEFAULT 'web_sales_import'
    CHECK (task_key IN ('connection_test', 'web_sales_import')),
  channel text
    CHECK (channel IS NULL OR channel IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok')),
  trigger_type text NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled_half_month', 'scheduled_previous_month', 'retry', 'test')),
  period_start date,
  period_end date,
  report_month date,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting_for_user', 'needs_review', 'completed', 'failed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  current_step text NOT NULL DEFAULT '実行待ち',
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  requested_by text,
  worker_id text REFERENCES public.web_sales_codex_workers(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  idempotency_key text UNIQUE,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_sales_codex_jobs_period_check CHECK (
    (task_key = 'connection_test' AND period_start IS NULL AND period_end IS NULL AND report_month IS NULL)
    OR
    (task_key = 'web_sales_import' AND channel IS NOT NULL AND period_start IS NOT NULL
      AND period_end IS NOT NULL AND period_end >= period_start
      AND report_month = date_trunc('month', report_month)::date)
  )
);

ALTER TABLE public.web_sales_codex_workers
  DROP CONSTRAINT IF EXISTS web_sales_codex_workers_current_job_id_fkey;
ALTER TABLE public.web_sales_codex_workers
  ADD CONSTRAINT web_sales_codex_workers_current_job_id_fkey
  FOREIGN KEY (current_job_id) REFERENCES public.web_sales_codex_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_queue
  ON public.web_sales_codex_jobs(status, scheduled_at, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_channel_period
  ON public.web_sales_codex_jobs(channel, report_month, created_at DESC);

CREATE TABLE IF NOT EXISTS public.web_sales_codex_job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.web_sales_codex_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  progress integer CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_sales_codex_job_events_job
  ON public.web_sales_codex_job_events(job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.web_sales_codex_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.web_sales_codex_jobs(id) ON DELETE CASCADE,
  artifact_type text NOT NULL DEFAULT 'source'
    CHECK (artifact_type IN ('source', 'output', 'log', 'screenshot')),
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  content_type text,
  byte_size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_sales_codex_artifacts_job
  ON public.web_sales_codex_artifacts(job_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('web-sales-codex', 'web-sales-codex', false, 26214400)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit;

ALTER TABLE public.web_sales_codex_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_sales_codex_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_sales_codex_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_sales_codex_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read web sales codex workers" ON public.web_sales_codex_workers;
CREATE POLICY "authenticated read web sales codex workers"
  ON public.web_sales_codex_workers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read web sales codex jobs" ON public.web_sales_codex_jobs;
CREATE POLICY "authenticated read web sales codex jobs"
  ON public.web_sales_codex_jobs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read web sales codex events" ON public.web_sales_codex_job_events;
CREATE POLICY "authenticated read web sales codex events"
  ON public.web_sales_codex_job_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read web sales codex artifacts" ON public.web_sales_codex_artifacts;
CREATE POLICY "authenticated read web sales codex artifacts"
  ON public.web_sales_codex_artifacts FOR SELECT TO authenticated USING (true);

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

  SELECT id INTO v_job_id
  FROM public.web_sales_codex_jobs
  WHERE status = 'queued'
    AND scheduled_at <= now()
  ORDER BY priority DESC, created_at
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

REVOKE ALL ON FUNCTION public.claim_web_sales_codex_job(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_web_sales_codex_job(text, integer)
  TO service_role;

COMMENT ON TABLE public.web_sales_codex_jobs IS 'TSA jobs executed by the allow-listed local Codex bridge';
COMMENT ON TABLE public.web_sales_codex_job_events IS 'Progress timeline emitted by the local Codex bridge';
COMMENT ON TABLE public.web_sales_codex_artifacts IS 'Immutable source and result files retained for each Codex job';
