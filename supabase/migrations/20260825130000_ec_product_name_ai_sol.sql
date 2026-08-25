-- Route EC product-name generation jobs only to the Sol-capable Bridge.

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
          AND generation_workers.capabilities->>'ecProductNameAiModel' = 'gpt-5.6-sol'
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
