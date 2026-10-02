CREATE TABLE IF NOT EXISTS public.web_sales_api_credentials (
  name text PRIMARY KEY,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.web_sales_api_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_sales_api_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.web_sales_api_credentials TO service_role;

CREATE TABLE IF NOT EXISTS public.web_sales_acquisition_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('sales','ec_profit','advertising')),
  channel text NOT NULL,
  route text NOT NULL CHECK (route IN ('api','bridge','manual')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_month date NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('queued','running','completed','needs_review','failed','skipped','waiting_for_user')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS web_sales_acquisition_runs_period_idx ON public.web_sales_acquisition_runs (report_month, kind, channel, started_at DESC);
ALTER TABLE public.web_sales_acquisition_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_sales_acquisition_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.web_sales_acquisition_runs TO service_role;
