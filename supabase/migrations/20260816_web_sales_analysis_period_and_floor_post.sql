-- Track interim/final analysis periods and the automatic TSG floor post.

ALTER TABLE public.web_sales_ai_analyses
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS analysis_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS floor_staff_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tsg_post_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tsg_post_id text,
  ADD COLUMN IF NOT EXISTS tsg_board_id text,
  ADD COLUMN IF NOT EXISTS tsg_post_url text,
  ADD COLUMN IF NOT EXISTS tsg_post_error text,
  ADD COLUMN IF NOT EXISTS tsg_posted_at timestamptz;

UPDATE public.web_sales_ai_analyses AS analysis
SET
  period_start = COALESCE(analysis.period_start, job.period_start, analysis.report_month),
  period_end = COALESCE(
    analysis.period_end,
    job.period_end,
    (analysis.report_month + interval '1 month - 1 day')::date
  )
FROM public.web_sales_codex_jobs AS job
WHERE job.id = analysis.job_id
  AND (analysis.period_start IS NULL OR analysis.period_end IS NULL);

UPDATE public.web_sales_ai_analyses
SET
  period_start = COALESCE(period_start, report_month),
  period_end = COALESCE(period_end, (report_month + interval '1 month - 1 day')::date),
  analysis_type = CASE
    WHEN EXTRACT(day FROM COALESCE(period_end, (report_month + interval '1 month - 1 day')::date)) = 15
      THEN 'half_month'
    ELSE 'monthly'
  END;

ALTER TABLE public.web_sales_ai_analyses
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE public.web_sales_ai_analyses
  DROP CONSTRAINT IF EXISTS web_sales_ai_analyses_analysis_type_check,
  ADD CONSTRAINT web_sales_ai_analyses_analysis_type_check
    CHECK (analysis_type IN ('half_month', 'monthly')),
  DROP CONSTRAINT IF EXISTS web_sales_ai_analyses_period_check,
  ADD CONSTRAINT web_sales_ai_analyses_period_check
    CHECK (period_end >= period_start),
  DROP CONSTRAINT IF EXISTS web_sales_ai_analyses_tsg_post_status_check,
  ADD CONSTRAINT web_sales_ai_analyses_tsg_post_status_check
    CHECK (tsg_post_status IN ('pending', 'posted', 'failed', 'skipped'));

ALTER TABLE public.web_sales_ai_analyses
  DROP CONSTRAINT IF EXISTS web_sales_ai_analyses_report_month_version_key;

ALTER TABLE public.web_sales_ai_analyses
  ADD CONSTRAINT web_sales_ai_analyses_month_type_version_key
    UNIQUE (report_month, analysis_type, version);

CREATE INDEX IF NOT EXISTS idx_web_sales_ai_analyses_month_type_version
  ON public.web_sales_ai_analyses(report_month, analysis_type, version DESC);

COMMENT ON COLUMN public.web_sales_ai_analyses.analysis_type IS
  'half_month is the 1st-15th quantity snapshot; monthly is the final monthly analysis.';
COMMENT ON COLUMN public.web_sales_ai_analyses.floor_staff_summary IS
  'Short sales-only summary posted to the NEW brand hall floor board.';
