-- Direct Codex-app imports are terminal audit records, never executable jobs.
CREATE TABLE public.recipe_review_app_imports (
 request_id uuid PRIMARY KEY, root_job_id uuid NOT NULL REFERENCES public.web_sales_codex_jobs(id),
 job_id uuid NOT NULL UNIQUE REFERENCES public.web_sales_codex_jobs(id),
 kind text NOT NULL CHECK (kind IN ('collection','analysis')), payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.recipe_review_app_imports(root_job_id,kind,created_at DESC);
ALTER TABLE public.recipe_review_app_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_review_app_imports FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recipe_review_app_imports TO service_role;

CREATE FUNCTION public.save_recipe_review_app_import(p_root uuid,p_request uuid,p_kind text,p_expected uuid,p_parameters jsonb,p_payload jsonb,p_hash text,p_revision jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE root web_sales_codex_jobs%ROWTYPE; existing recipe_review_app_imports%ROWTYPE;
 latest uuid; audit uuid:=gen_random_uuid(); recipe uuid; r jsonb; has_reviews boolean; done boolean;
BEGIN
 -- Same lock order for collection, analysis, and retries, including shared request IDs.
 PERFORM pg_advisory_xact_lock(hashtext('review-app-request:'||p_request::text));
 SELECT * INTO existing FROM recipe_review_app_imports WHERE request_id=p_request;
 IF FOUND THEN
  IF existing.root_job_id<>p_root OR existing.kind<>p_kind OR existing.payload_hash<>p_hash THEN RAISE EXCEPTION 'direct_request_conflict'; END IF;
  RETURN existing.job_id;
 END IF;
 SELECT * INTO root FROM web_sales_codex_jobs WHERE id=p_root FOR UPDATE;
 IF NOT FOUND OR root.task_key<>'recipe_reviews_collect' OR root.parameters IS DISTINCT FROM p_parameters OR root.parameters->>'executor'='codex_app' THEN RAISE EXCEPTION 'direct_target_changed'; END IF;
 recipe := (root.parameters->>'recipeId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtext('review-app-recipe:'||recipe::text));
 IF NOT EXISTS(SELECT 1 FROM recipes WHERE id=recipe AND category='ネット専用') THEN RAISE EXCEPTION 'direct_target_changed'; END IF;
 IF EXISTS(SELECT 1 FROM web_sales_codex_jobs WHERE task_key IN ('recipe_reviews_collect','recipe_reviews_analyze') AND parameters->>'recipeId'=recipe::text AND status IN ('queued','running')) THEN RAISE EXCEPTION 'direct_active_job'; END IF;
 SELECT job_id INTO latest FROM recipe_review_app_imports WHERE root_job_id=p_root AND kind='collection' ORDER BY created_at DESC LIMIT 1;
 IF latest IS NULL THEN SELECT job_id INTO latest FROM recipe_review_collections WHERE job_id=p_root; END IF;
 IF latest IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'direct_collection_changed'; END IF;
 IF jsonb_typeof(p_revision) IS DISTINCT FROM 'array' OR jsonb_array_length(p_revision)<>(SELECT count(*) FROM recipe_reviews WHERE recipe_id=recipe)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_revision) v LEFT JOIN recipe_reviews rr ON rr.id=(v->>'id')::uuid AND rr.recipe_id=recipe WHERE rr.id IS NULL OR rr.collected_at IS DISTINCT FROM (v->>'collected_at')::timestamptz)
 THEN RAISE EXCEPTION 'direct_reviews_changed'; END IF;
 IF p_kind NOT IN ('collection','analysis') OR length(p_hash)<>64 THEN RAISE EXCEPTION 'direct_invalid_payload'; END IF;
 IF p_kind='analysis' AND (latest IS NULL OR NOT EXISTS(SELECT 1 FROM recipe_review_app_imports WHERE job_id=latest AND kind='collection')) THEN RAISE EXCEPTION 'direct_collection_required'; END IF;
 done := p_kind='analysis' OR p_payload->'result'->>'status'='completed';
 INSERT INTO web_sales_codex_jobs(id,task_key,status,parameters,requested_by,trigger_type,idempotency_key,progress,current_step,completed_at)
 VALUES(audit,CASE WHEN p_kind='collection' THEN 'recipe_reviews_collect' ELSE 'recipe_reviews_analyze' END,
 CASE WHEN done THEN 'completed' ELSE 'needs_review' END,
 root.parameters||jsonb_build_object('executor','codex_app','directRootJobId',p_root,'model',p_payload->>'model'),
 'codex-app-review-api','manual',CASE WHEN p_kind='analysis' THEN 'reviews-analysis:'||latest::text ELSE 'reviews-app:'||p_request::text END,100,
 CASE WHEN p_kind='collection' THEN 'Codexアプリからレビューを保存' ELSE 'Codexアプリから分析を保存' END,clock_timestamp());
 IF p_kind='collection' THEN
  FOR r IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(root.parameters->'sources') s WHERE s->>'channel'=r->>'channel' AND s->>'productKey'=r->>'product_key') THEN RAISE EXCEPTION 'direct_source_mismatch'; END IF;
   INSERT INTO recipe_reviews(recipe_id,channel,product_key,external_id,url,rating,title,body,posted_at,source_job_id)
   VALUES(recipe,r->>'channel',r->>'product_key',r->>'external_id',r->>'url',(r->>'rating')::integer,r->>'title',r->>'body',(r->>'posted_at')::date,audit)
   ON CONFLICT(recipe_id,channel,product_key,external_id) DO UPDATE SET url=EXCLUDED.url,rating=EXCLUDED.rating,title=EXCLUDED.title,body=EXCLUDED.body,posted_at=EXCLUDED.posted_at,collected_at=clock_timestamp(),source_job_id=audit;
  END LOOP;
  INSERT INTO recipe_review_collections(job_id,recipe_id,result) VALUES(audit,recipe,p_payload->'result');
  SELECT EXISTS(SELECT 1 FROM recipe_reviews WHERE recipe_id=recipe) INTO has_reviews;
  IF has_reviews THEN
   UPDATE web_sales_codex_jobs SET parameters=parameters||jsonb_build_object('directAnalysisPending',true) WHERE id=audit;
  END IF;
 ELSE
  INSERT INTO recipe_review_analyses(job_id,recipe_id,source_hash,review_ids,result,model)
  VALUES(audit,recipe,p_payload->>'sourceHash',p_payload->'reviewIds',p_payload->'result',p_payload->>'model');
  UPDATE web_sales_codex_jobs SET parameters=parameters||jsonb_build_object('directAnalysisPending',false) WHERE id=latest;
 END IF;
 INSERT INTO recipe_review_app_imports(request_id,root_job_id,job_id,kind,payload_hash) VALUES(p_request,p_root,audit,p_kind,p_hash);
 RETURN audit;
END $$;

NOTIFY pgrst, 'reload schema';
REVOKE ALL ON FUNCTION public.save_recipe_review_app_import(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_recipe_review_app_import(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb) TO service_role;

-- A manual requeue of an audit row must never launch a worker.
DO $$ DECLARE d text; marker text:='  ORDER BY jobs.priority DESC, jobs.created_at'; BEGIN
 SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) INTO d;
 IF position(marker IN d)=0 THEN RAISE EXCEPTION 'Claim insertion point missing'; END IF;
 EXECUTE replace(d,marker,E'    AND jobs.parameters->>''executor'' IS DISTINCT FROM ''codex_app''\n'||marker);
END $$;
