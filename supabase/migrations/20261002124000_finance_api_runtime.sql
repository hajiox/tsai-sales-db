CREATE TABLE IF NOT EXISTS public.web_sales_api_runtime (
  id text PRIMARY KEY CHECK(id='office-pc'),
  status text NOT NULL CHECK(status IN ('idle','running','stopped')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  current_run_id uuid REFERENCES public.web_sales_acquisition_runs(id)
);
ALTER TABLE public.web_sales_api_runtime ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_sales_api_runtime FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.web_sales_api_runtime TO service_role;
