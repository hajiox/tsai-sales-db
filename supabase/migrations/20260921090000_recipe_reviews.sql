-- Additive review storage. Only TSA server/Bridge service role may access.
CREATE TABLE public.recipe_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
 channel text NOT NULL CHECK(channel IN ('amazon','rakuten','yahoo','base')), product_key text NOT NULL, external_id text NOT NULL,
 url text NOT NULL, rating integer CHECK(rating BETWEEN 1 AND 5), title text NOT NULL, body text NOT NULL,
 posted_at date, collected_at timestamptz NOT NULL DEFAULT now(), source_job_id uuid NOT NULL REFERENCES public.web_sales_codex_jobs(id),
 UNIQUE(recipe_id,channel,product_key,external_id)
);
CREATE INDEX ON public.recipe_reviews(recipe_id,posted_at DESC,id);
CREATE TABLE public.recipe_review_sources (
 recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT, channel text NOT NULL CHECK(channel IN ('amazon','rakuten','yahoo','base')),
 product_key text NOT NULL, name text NOT NULL, url text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(recipe_id,channel,product_key)
);
CREATE TABLE public.recipe_review_collections (
 job_id uuid PRIMARY KEY REFERENCES public.web_sales_codex_jobs(id), recipe_id uuid NOT NULL REFERENCES public.recipes(id),
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.recipe_review_analyses (
 job_id uuid PRIMARY KEY REFERENCES public.web_sales_codex_jobs(id), recipe_id uuid NOT NULL REFERENCES public.recipes(id),
 source_hash text NOT NULL, review_ids jsonb NOT NULL, result jsonb NOT NULL, model text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['recipe_reviews','recipe_review_sources','recipe_review_collections','recipe_review_analyses'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP; END $$;
-- Extend current constraints without dropping unrelated task contracts.
DO $$ DECLARE n text; d text; BEGIN FOREACH n IN ARRAY ARRAY['web_sales_codex_jobs_task_key_check','web_sales_codex_jobs_period_check'] LOOP
 SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conrelid='public.web_sales_codex_jobs'::regclass AND conname=n;
 IF d IS NULL THEN RAISE EXCEPTION 'Missing constraint %',n; END IF;
 EXECUTE format('ALTER TABLE public.web_sales_codex_jobs DROP CONSTRAINT %I',n);
 EXECUTE format('ALTER TABLE public.web_sales_codex_jobs ADD CONSTRAINT %I CHECK ((%s) OR (task_key IN (''recipe_reviews_collect'',''recipe_reviews_analyze'') AND channel IS NULL AND period_start IS NULL AND period_end IS NULL AND report_month IS NULL))',n,substring(d from 8 for length(d)-8));
END LOOP; END $$;
CREATE UNIQUE INDEX recipe_reviews_active_job ON public.web_sales_codex_jobs(task_key,(parameters->>'recipeId')) WHERE task_key IN ('recipe_reviews_collect','recipe_reviews_analyze') AND status IN ('queued','running');
DO $$ DECLARE d text; marker text := '  ORDER BY jobs.priority DESC, jobs.created_at'; BEGIN
 SELECT pg_get_functiondef('public.claim_web_sales_codex_job(text,integer)'::regprocedure) INTO d;
 IF position(marker IN d)=0 THEN RAISE EXCEPTION 'Claim insertion point missing'; END IF;
 EXECUTE replace(d,marker,$guard$    AND (jobs.task_key NOT IN ('recipe_reviews_collect','recipe_reviews_analyze') OR EXISTS (
 SELECT 1 FROM public.web_sales_codex_workers w WHERE w.id=p_worker_id AND w.capabilities->>'recipeReviewsProtocol'='1'))
$guard$ || marker);
END $$;
CREATE FUNCTION public.save_recipe_review_collection(p_job uuid,p_worker text,p_result jsonb,p_rows jsonb,p_analysis jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.web_sales_codex_jobs%ROWTYPE; r jsonb; BEGIN
 SELECT * INTO j FROM web_sales_codex_jobs WHERE id=p_job FOR UPDATE;
 IF j.task_key<>'recipe_reviews_collect' OR j.status<>'running' OR j.worker_id<>p_worker OR j.lease_expires_at<now() THEN RAISE EXCEPTION 'Invalid review lease'; END IF;
 IF EXISTS(SELECT 1 FROM recipe_review_collections WHERE job_id=p_job) THEN RETURN; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
 INSERT INTO recipe_reviews(recipe_id,channel,product_key,external_id,url,rating,title,body,posted_at,source_job_id)
 VALUES((j.parameters->>'recipeId')::uuid,r->>'channel',r->>'product_key',r->>'external_id',r->>'url',(r->>'rating')::integer,r->>'title',r->>'body',(r->>'posted_at')::date,p_job)
 ON CONFLICT(recipe_id,channel,product_key,external_id) DO UPDATE SET url=EXCLUDED.url,rating=EXCLUDED.rating,title=EXCLUDED.title,body=EXCLUDED.body,posted_at=EXCLUDED.posted_at,collected_at=now(),source_job_id=p_job;
 END LOOP;
 INSERT INTO recipe_review_collections(job_id,recipe_id,result) VALUES(p_job,(j.parameters->>'recipeId')::uuid,p_result);
 IF EXISTS(SELECT 1 FROM recipe_reviews WHERE recipe_id=(j.parameters->>'recipeId')::uuid) THEN
 INSERT INTO web_sales_codex_jobs(task_key,status,parameters,requested_by,trigger_type,idempotency_key)
 VALUES('recipe_reviews_analyze','queued',p_analysis,j.requested_by,'manual','reviews-analysis:'||p_job::text)
 ON CONFLICT DO NOTHING;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_recipe_review_collection(uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_recipe_review_collection(uuid,text,jsonb,jsonb,jsonb) TO service_role;
