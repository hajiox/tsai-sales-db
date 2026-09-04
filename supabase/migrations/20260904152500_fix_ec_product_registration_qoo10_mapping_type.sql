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
  IF p_result->>'operation' NOT IN ('created', 'updated', 'already_exists')
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
    WHERE mapping.product_id = v_linked_product_id::text AND mapping.qoo10_title = v_product_name
  ) THEN
    INSERT INTO public.qoo10_product_mapping(qoo10_title, product_id)
    VALUES (v_product_name, v_linked_product_id::text);
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ec_product_register_job(uuid, text, text, integer, text, text, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ec_product_register_job(uuid, text, text, integer, text, text, jsonb, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.complete_ec_product_register_job(uuid, text, text, integer, text, text, jsonb, timestamptz) IS
  'Completes one verified Qoo10 registration and writes the legacy text product mapping without UUID comparison errors.';
