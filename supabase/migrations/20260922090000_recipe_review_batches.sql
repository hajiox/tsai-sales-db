CREATE TABLE public.recipe_review_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requested_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 entries jsonb NOT NULL
);
ALTER TABLE public.recipe_review_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_review_batches FROM anon, authenticated;
GRANT ALL ON public.recipe_review_batches TO service_role;

CREATE FUNCTION public.enqueue_recipe_review_batch(p_requested_by text, p_targets jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch_id uuid := gen_random_uuid(); prior public.recipe_review_batches%ROWTYPE;
 target jsonb; job_id uuid; entries jsonb := '[]'::jsonb; recipe public.recipes%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('recipe-review-batch'));
 SELECT * INTO prior FROM recipe_review_batches ORDER BY created_at DESC LIMIT 1;
 IF prior.id IS NOT NULL AND EXISTS (
   SELECT 1 FROM jsonb_array_elements(prior.entries) e JOIN web_sales_codex_jobs j
   ON j.id::text=e->>'jobId' OR j.idempotency_key='reviews-analysis:'||(e->>'jobId')
   WHERE j.status IN ('queued','running')
 ) THEN RETURN prior.id; END IF;
 IF jsonb_typeof(p_targets)<>'array' OR jsonb_array_length(p_targets)>1000 THEN RAISE EXCEPTION 'Invalid targets'; END IF;
 FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
  SELECT * INTO recipe FROM recipes WHERE id=(target->>'recipeId')::uuid AND category='ネット専用';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid recipe'; END IF;
  job_id := NULL;
  IF target->>'reason' IS NULL THEN
   IF jsonb_array_length(target->'sources') NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Invalid sources'; END IF;
   SELECT id INTO job_id FROM web_sales_codex_jobs WHERE task_key='recipe_reviews_collect'
   AND parameters->>'recipeId'=recipe.id::text AND status IN ('queued','running') LIMIT 1;
   IF job_id IS NULL THEN
    INSERT INTO web_sales_codex_jobs(task_key,status,parameters,requested_by,trigger_type,max_attempts,idempotency_key)
    VALUES('recipe_reviews_collect','queued',jsonb_build_object('recipeId',recipe.id,'recipeName',recipe.name,'janCode',recipe.jan_code,
      'sources',target->'sources','protocol','1','model','gpt-6-astra','reasoningEffort','medium','batchId',batch_id),
      p_requested_by,'manual',1,'reviews-batch:'||batch_id||':'||recipe.id)
    ON CONFLICT DO NOTHING RETURNING id INTO job_id;
    IF job_id IS NULL THEN
     SELECT id INTO job_id FROM web_sales_codex_jobs WHERE task_key='recipe_reviews_collect'
       AND parameters->>'recipeId'=recipe.id::text AND status IN ('queued','running') LIMIT 1;
     IF job_id IS NULL THEN RAISE EXCEPTION 'Concurrent enqueue conflict'; END IF;
    END IF;
   END IF;
  END IF;
  entries := entries || jsonb_build_array(jsonb_build_object('recipeId',recipe.id,'name',recipe.name,'jobId',job_id,'reason',target->>'reason'));
 END LOOP;
 INSERT INTO recipe_review_batches(id,requested_by,entries) VALUES(batch_id,p_requested_by,entries);
 RETURN batch_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_recipe_review_batch(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_recipe_review_batch(text,jsonb) TO service_role;

-- Finish an existing analysis before recollecting the same product, so the
-- collection's follow-up analysis is not lost to the active-job unique index.
DO $$ DECLARE definition text; marker text := '  ORDER BY jobs.priority DESC, jobs.created_at'; BEGIN
 SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) INTO definition;
 IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Claim guard insertion point missing'; END IF;
 EXECUTE replace(definition,marker,$guard$    AND (jobs.task_key <> 'recipe_reviews_collect' OR NOT EXISTS (
   SELECT 1 FROM public.web_sales_codex_jobs analyzing
   WHERE analyzing.task_key='recipe_reviews_analyze'
    AND analyzing.parameters->>'recipeId'=jobs.parameters->>'recipeId'
    AND analyzing.status IN ('queued','running')))
$guard$ || marker);
END $$;

