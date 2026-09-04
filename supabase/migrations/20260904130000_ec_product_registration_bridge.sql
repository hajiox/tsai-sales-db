-- Qoo10 product registration Bridge with durable intent and immutable identity.

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_task_key_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_task_key_check
  CHECK (task_key IN (
    'connection_test', 'web_sales_import', 'ad_cost_import', 'ec_profit_import',
    'web_sales_analysis', 'ec_price_update', 'ec_product_register',
    'ec_product_name_update', 'ec_product_name_generate',
    'ec_catchcopy_update', 'ec_catchcopy_generate',
    'recipe_sns_generate', 'recipe_sns_publish',
    'ec_product_content_update', 'ec_product_content_generate',
    'ingredient_label_generate', 'docscanner_fax_summary'
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
    (task_key = 'ec_product_register'
      AND channel = 'qoo10'
      AND period_start IS NULL AND period_end IS NULL AND report_month IS NULL)
    OR
    (task_key IN (
        'ec_price_update', 'ec_product_name_update', 'ec_product_name_generate',
        'ec_catchcopy_update', 'ec_catchcopy_generate',
        'recipe_sns_generate', 'recipe_sns_publish',
        'ec_product_content_update', 'ec_product_content_generate',
        'ingredient_label_generate', 'docscanner_fax_summary'
      )
      AND channel IS NULL
      AND period_start IS NULL AND period_end IS NULL AND report_month IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_sales_codex_jobs_one_active_ec_product_register
  ON public.web_sales_codex_jobs ((parameters->>'recipeId'))
  WHERE task_key = 'ec_product_register' AND status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS public.recipe_ec_product_registration_intents (
  id uuid PRIMARY KEY,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  target text NOT NULL CHECK (target = 'qoo10'),
  seller_code text NOT NULL,
  jan_code text NOT NULL,
  product_name text NOT NULL,
  target_price integer NOT NULL CHECK (target_price > 0),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('authorized', 'submission_started', 'needs_review', 'completed')),
  job_id uuid NOT NULL UNIQUE REFERENCES public.web_sales_codex_jobs(id) ON DELETE RESTRICT,
  product_identifier text,
  public_url text,
  submit_started_at timestamptz,
  completed_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target, seller_code),
  UNIQUE (target, jan_code),
  UNIQUE (recipe_id, target)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_ec_product_registration_intents_identifier
  ON public.recipe_ec_product_registration_intents(target, product_identifier)
  WHERE product_identifier IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recipe_ec_product_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL UNIQUE REFERENCES public.recipe_ec_product_registration_intents(id) ON DELETE RESTRICT,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  linked_product_id uuid,
  target text NOT NULL CHECK (target = 'qoo10'),
  product_identifier text NOT NULL,
  product_name text NOT NULL,
  seller_code text NOT NULL,
  jan_code text NOT NULL,
  target_price integer NOT NULL CHECK (target_price > 0),
  public_url text,
  source_job_id uuid NOT NULL UNIQUE REFERENCES public.web_sales_codex_jobs(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL,
  recipe_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, target),
  UNIQUE (target, product_identifier),
  UNIQUE (target, seller_code),
  UNIQUE (target, jan_code)
);

ALTER TABLE public.recipe_ec_product_registration_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ec_product_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_ec_product_registration_intents FROM anon, authenticated;
REVOKE ALL ON public.recipe_ec_product_registrations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_ec_product_register_job(
  p_intent_id uuid, p_job_id uuid, p_recipe_id uuid, p_parameters jsonb,
  p_payload_hash text, p_requested_by text, p_scheduled_at timestamptz
)
RETURNS TABLE(intent_id uuid, job_id uuid, reused boolean, already_registered boolean, review_required boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing public.recipe_ec_product_registration_intents%ROWTYPE;
  v_job_status text;
  v_seller_code text := trim(COALESCE(p_parameters->>'sellerCode', ''));
  v_jan_code text := trim(COALESCE(p_parameters->>'janCode', ''));
  v_product_name text := trim(COALESCE(p_parameters->>'productName', ''));
  v_target_price integer := COALESCE((p_parameters->>'targetPrice')::integer, 0);
BEGIN
  IF p_recipe_id IS NULL OR p_intent_id IS NULL OR p_job_id IS NULL
    OR p_parameters->>'target' <> 'qoo10'
    OR p_parameters->>'intentId' <> p_intent_id::text
    OR p_parameters->>'payloadHash' <> p_payload_hash
    OR p_payload_hash !~ '^[0-9a-f]{64}$'
    OR v_seller_code = '' OR v_jan_code !~ '^\d{13}$'
    OR v_product_name = '' OR v_target_price <= 0
    OR trim(COALESCE(p_requested_by, '')) = '' OR p_scheduled_at IS NULL
  THEN
    RAISE EXCEPTION 'EC product registration request is incomplete';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qoo10:' || v_seller_code, 0));
  SELECT intents.* INTO v_existing
  FROM public.recipe_ec_product_registration_intents AS intents
  WHERE intents.target = 'qoo10'
    AND (intents.recipe_id = p_recipe_id OR intents.seller_code = v_seller_code OR intents.jan_code = v_jan_code)
  ORDER BY intents.created_at LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'An EC product registration intent already exists with different immutable data';
    END IF;
    SELECT jobs.status INTO v_job_status FROM public.web_sales_codex_jobs AS jobs WHERE jobs.id = v_existing.job_id;
    IF v_existing.status = 'authorized' AND v_existing.submit_started_at IS NULL
      AND v_job_status IN ('waiting_for_user', 'failed')
    THEN
      UPDATE public.web_sales_codex_jobs
      SET status = 'queued', progress = 0, current_step = '事務所PCの商品登録再開待ち',
          error_message = NULL, worker_id = NULL, started_at = NULL, heartbeat_at = NULL,
          lease_expires_at = NULL, completed_at = NULL, updated_at = now(), scheduled_at = p_scheduled_at
      WHERE id = v_existing.job_id;
      INSERT INTO public.web_sales_codex_job_events(job_id, event_type, message, progress, payload)
      VALUES (v_existing.job_id, 'ec_product_register_requeued', '未送信の商品登録を手動で再実行しました', 0,
        jsonb_build_object('intentId', v_existing.id));
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.job_id, true,
      v_existing.status = 'completed', v_existing.status IN ('submission_started', 'needs_review');
    RETURN;
  END IF;

  INSERT INTO public.web_sales_codex_jobs (
    id, task_key, channel, trigger_type, period_start, period_end, report_month,
    status, progress, current_step, parameters, requested_by, priority, max_attempts, scheduled_at
  ) VALUES (
    p_job_id, 'ec_product_register', 'qoo10', 'manual', NULL, NULL, NULL,
    'queued', 0, '事務所PCの商品登録開始待ち', p_parameters, p_requested_by, 55, 1, p_scheduled_at
  );
  INSERT INTO public.recipe_ec_product_registration_intents (
    id, recipe_id, target, seller_code, jan_code, product_name, target_price,
    payload_hash, payload, status, job_id, created_by
  ) VALUES (
    p_intent_id, p_recipe_id, 'qoo10', v_seller_code, v_jan_code, v_product_name, v_target_price,
    p_payload_hash, p_parameters, 'authorized', p_job_id, p_requested_by
  );
  INSERT INTO public.web_sales_codex_job_events(job_id, event_type, message, progress, payload)
  VALUES (p_job_id, 'ec_product_register_queued', 'Qoo10商品登録を実行待ちに登録しました', 0,
    jsonb_build_object('intentId', p_intent_id, 'recipeId', p_recipe_id, 'sellerCode', v_seller_code));
  RETURN QUERY SELECT p_intent_id, p_job_id, false, false, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_ec_product_register_submission_started(
  p_job_id uuid, p_worker_id text, p_payload_hash text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.recipe_ec_product_registration_intents AS intent
  SET status = 'submission_started', submit_started_at = now(), updated_at = now()
  FROM public.web_sales_codex_jobs AS job
  WHERE intent.job_id = p_job_id AND intent.payload_hash = p_payload_hash
    AND intent.status = 'authorized' AND intent.submit_started_at IS NULL
    AND job.id = p_job_id AND job.worker_id = p_worker_id
    AND job.task_key = 'ec_product_register' AND job.status = 'running';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ec_product_register_job(
  p_job_id uuid, p_worker_id text, p_status text, p_progress integer,
  p_current_step text, p_error_message text, p_result jsonb, p_completed_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.web_sales_codex_jobs%ROWTYPE;
  v_intent public.recipe_ec_product_registration_intents%ROWTYPE;
  v_linked_product_id uuid;
  v_product_identifier text;
  v_product_name text;
  v_target_price integer;
BEGIN
  IF p_status NOT IN ('completed', 'waiting_for_user', 'needs_review', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid EC product registration completion status';
  END IF;
  SELECT jobs.* INTO v_job FROM public.web_sales_codex_jobs AS jobs
  WHERE jobs.id = p_job_id AND jobs.worker_id = p_worker_id
    AND jobs.task_key = 'ec_product_register' AND jobs.status = 'running' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT intents.* INTO v_intent FROM public.recipe_ec_product_registration_intents AS intents
  WHERE intents.job_id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_intent.payload_hash <> v_job.parameters->>'payloadHash' THEN
    RAISE EXCEPTION 'EC product registration intent does not match the job';
  END IF;

  UPDATE public.web_sales_codex_jobs
  SET status = p_status, progress = LEAST(GREATEST(p_progress, 0), 100),
      current_step = left(COALESCE(p_current_step, ''), 500),
      error_message = NULLIF(left(COALESCE(p_error_message, ''), 4000), ''),
      result = p_result, heartbeat_at = p_completed_at, lease_expires_at = NULL,
      completed_at = p_completed_at, updated_at = p_completed_at
  WHERE id = p_job_id;

  IF p_status <> 'completed' THEN
    UPDATE public.recipe_ec_product_registration_intents
    SET status = CASE WHEN submit_started_at IS NULL THEN 'authorized' ELSE 'needs_review' END,
        updated_at = p_completed_at
    WHERE id = v_intent.id;
    RETURN true;
  END IF;

  v_linked_product_id := NULLIF(v_job.parameters->'recipeSnapshot'->>'linkedProductId', '')::uuid;
  v_product_identifier := trim(COALESCE(p_result->>'product_identifier', ''));
  v_product_name := trim(COALESCE(p_result->>'final_product_name', ''));
  v_target_price := COALESCE((p_result->>'final_price')::integer, 0);
  IF p_result->>'operation' NOT IN ('created', 'already_exists')
    OR v_product_identifier = '' OR v_product_name <> v_intent.product_name
    OR trim(COALESCE(p_result->>'final_seller_code', '')) <> v_intent.seller_code
    OR trim(COALESCE(p_result->>'final_jan_code', '')) <> v_intent.jan_code
    OR v_target_price <> v_intent.target_price
  THEN
    RAISE EXCEPTION 'Completed EC product registration result is incomplete or mismatched';
  END IF;

  INSERT INTO public.recipe_ec_product_registrations (
    intent_id, recipe_id, linked_product_id, target, product_identifier, product_name,
    seller_code, jan_code, target_price, public_url, source_job_id, payload_hash,
    recipe_snapshot, result
  ) VALUES (
    v_intent.id, v_intent.recipe_id, v_linked_product_id, 'qoo10', v_product_identifier, v_product_name,
    v_intent.seller_code, v_intent.jan_code, v_target_price, NULLIF(p_result->>'public_url', ''),
    p_job_id, v_intent.payload_hash, v_job.parameters->'recipeSnapshot', p_result
  );
  UPDATE public.recipe_ec_product_registration_intents
  SET status = 'completed', product_identifier = v_product_identifier,
      public_url = NULLIF(p_result->>'public_url', ''), completed_at = p_completed_at, updated_at = p_completed_at
  WHERE id = v_intent.id;

  IF v_linked_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.qoo10_product_mapping AS mapping
    WHERE mapping.product_id = v_linked_product_id AND mapping.qoo10_title = v_product_name
  ) THEN
    INSERT INTO public.qoo10_product_mapping(qoo10_title, product_id) VALUES (v_product_name, v_linked_product_id);
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_ec_product_register_job(uuid, uuid, uuid, jsonb, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_ec_product_register_submission_started(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_ec_product_register_job(uuid, text, text, integer, text, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_ec_product_register_job(uuid, uuid, uuid, jsonb, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_ec_product_register_submission_started(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ec_product_register_job(uuid, text, text, integer, text, text, jsonb, timestamptz) TO service_role;

DO $ec_product_register_claim$
DECLARE
  v_definition text;
  v_order_by text := '  ORDER BY jobs.priority DESC, jobs.created_at';
  v_guard text := $guard$    AND (jobs.task_key <> 'ec_product_register' OR EXISTS (
      SELECT 1 FROM public.web_sales_codex_workers AS worker
      WHERE worker.id = p_worker_id
        AND worker.capabilities->>'ecProductRegisterProtocolVersion' = '1'
        AND worker.capabilities->>'chrome' = 'true'
        AND worker.capabilities->>'executionMode' = 'interactive'
    ))
$guard$;
BEGIN
  SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) INTO v_definition;
  IF position('ecProductRegisterProtocolVersion' IN v_definition) > 0 THEN RETURN; END IF;
  IF position(v_order_by IN v_definition) = 0 THEN RAISE EXCEPTION 'claim_web_sales_codex_job insertion point was not found'; END IF;
  EXECUTE replace(v_definition, v_order_by, v_guard || v_order_by);
END
$ec_product_register_claim$;

COMMENT ON TABLE public.recipe_ec_product_registration_intents IS
  'Immutable, idempotent authorization intents for one Qoo10 product registration.';
COMMENT ON TABLE public.recipe_ec_product_registrations IS
  'Verified seller-side product registrations created by TSA Codex Bridge.';
