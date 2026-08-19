-- Versioned Codex analysis reports for WEB sales and EC expenses.

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_task_key_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_task_key_check
  CHECK (task_key IN (
    'connection_test',
    'web_sales_import',
    'ad_cost_import',
    'ec_profit_import',
    'web_sales_analysis'
  ));

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_period_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_period_check CHECK (
    (task_key = 'connection_test'
      AND period_start IS NULL
      AND period_end IS NULL
      AND report_month IS NULL)
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
  );

CREATE TABLE IF NOT EXISTS public.web_sales_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE
    REFERENCES public.web_sales_codex_jobs(id) ON DELETE RESTRICT,
  report_month date NOT NULL
    CHECK (report_month = date_trunc('month', report_month)::date),
  version integer NOT NULL CHECK (version > 0),
  model text NOT NULL DEFAULT 'gpt-5.6-sol',
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'needs_review')),
  executive_summary text NOT NULL,
  sales_analysis text NOT NULL,
  expense_analysis text NOT NULL,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_month, version)
);

ALTER TABLE public.web_sales_ai_analyses
  ALTER COLUMN model SET DEFAULT 'gpt-5.6-sol';

CREATE INDEX IF NOT EXISTS idx_web_sales_ai_analyses_month_version
  ON public.web_sales_ai_analyses(report_month, version DESC);

ALTER TABLE public.web_sales_ai_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read web sales analyses"
  ON public.web_sales_ai_analyses;
CREATE POLICY "authenticated read web sales analyses"
  ON public.web_sales_ai_analyses
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.web_sales_ai_analyses IS
  'Immutable, versioned monthly WEB sales and EC expense analyses produced by the local Codex bridge.';
COMMENT ON COLUMN public.web_sales_ai_analyses.input_snapshot IS
  'Compact deterministic analysis packet used for this exact report version.';
