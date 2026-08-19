-- API-driven WEB sales synchronization with immutable run snapshots.

CREATE TABLE IF NOT EXISTS public.web_sales_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok')),
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'cron_daily', 'cron_half_month', 'cron_previous_month', 'mapping_retry')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_month date NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'needs_review', 'failed', 'skipped')),
  item_count integer NOT NULL DEFAULT 0,
  quantity_total numeric NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_sales_sync_runs_period_check CHECK (period_end >= period_start),
  CONSTRAINT web_sales_sync_runs_month_check CHECK (report_month = date_trunc('month', report_month)::date)
);

-- Keep this constraint current when the migration is re-applied to an existing database.
ALTER TABLE public.web_sales_sync_runs
  DROP CONSTRAINT IF EXISTS web_sales_sync_runs_trigger_type_check;
ALTER TABLE public.web_sales_sync_runs
  ADD CONSTRAINT web_sales_sync_runs_trigger_type_check
  CHECK (trigger_type IN ('manual', 'cron_daily', 'cron_half_month', 'cron_previous_month', 'mapping_retry'));

CREATE INDEX IF NOT EXISTS idx_web_sales_sync_runs_channel_month
  ON public.web_sales_sync_runs(channel, report_month, started_at DESC);

CREATE TABLE IF NOT EXISTS public.web_sales_sync_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.web_sales_sync_runs(id) ON DELETE CASCADE,
  external_order_id text NOT NULL,
  external_line_id text NOT NULL,
  external_product_key text NOT NULL,
  external_product_name text NOT NULL DEFAULT '',
  occurred_at timestamptz,
  quantity numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  source_status text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, external_order_id, external_line_id)
);

CREATE INDEX IF NOT EXISTS idx_web_sales_sync_items_run
  ON public.web_sales_sync_items(run_id);

CREATE INDEX IF NOT EXISTS idx_web_sales_sync_items_product_key
  ON public.web_sales_sync_items(external_product_key);

CREATE TABLE IF NOT EXISTS public.web_sales_external_mappings (
  channel text NOT NULL CHECK (channel IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok')),
  external_product_key text NOT NULL,
  external_product_name text NOT NULL DEFAULT '',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  match_source text NOT NULL DEFAULT 'manual' CHECK (match_source IN ('manual', 'legacy_title', 'product_code', 'exact_name')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(channel, external_product_key)
);

CREATE INDEX IF NOT EXISTS idx_web_sales_external_mappings_product
  ON public.web_sales_external_mappings(product_id);

CREATE TABLE IF NOT EXISTS public.web_sales_sync_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.web_sales_sync_runs(id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_product_key text NOT NULL,
  external_product_name text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  resolved boolean NOT NULL DEFAULT false,
  resolved_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, external_product_key)
);

CREATE INDEX IF NOT EXISTS idx_web_sales_sync_unmatched_open
  ON public.web_sales_sync_unmatched(resolved, created_at DESC);

ALTER TABLE public.web_sales_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_sales_sync_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_sales_external_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_sales_sync_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read web sales sync runs" ON public.web_sales_sync_runs;
CREATE POLICY "authenticated read web sales sync runs"
  ON public.web_sales_sync_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read web sales sync items" ON public.web_sales_sync_items;
CREATE POLICY "authenticated read web sales sync items"
  ON public.web_sales_sync_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read web sales mappings" ON public.web_sales_external_mappings;
CREATE POLICY "authenticated read web sales mappings"
  ON public.web_sales_external_mappings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read web sales unmatched" ON public.web_sales_sync_unmatched;
CREATE POLICY "authenticated read web sales unmatched"
  ON public.web_sales_sync_unmatched FOR SELECT TO authenticated USING (true);

-- Replace one channel's monthly summary as a single transaction. If any row
-- fails, PostgreSQL rolls back both the reset and every inserted row.
CREATE OR REPLACE FUNCTION public.replace_web_sales_channel_summary(
  p_channel text,
  p_report_month date,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_column text;
  v_row jsonb;
  v_row_count integer := 0;
BEGIN
  IF p_channel NOT IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok') THEN
    RAISE EXCEPTION 'Unsupported WEB sales channel: %', p_channel;
  END IF;
  IF p_report_month <> date_trunc('month', p_report_month)::date THEN
    RAISE EXCEPTION 'report_month must be the first day of the month';
  END IF;
  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  v_count_column := p_channel || '_count';
  IF p_channel = 'base' THEN
    UPDATE public.web_sales_summary
      SET base_count = 0, base_amount = 0
      WHERE report_month = p_report_month;
  ELSE
    EXECUTE format(
      'UPDATE public.web_sales_summary SET %I = 0 WHERE report_month = $1',
      v_count_column
    ) USING p_report_month;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    IF p_channel = 'base' THEN
      INSERT INTO public.web_sales_summary (
        product_id, report_month, base_count, base_amount, unit_price, unit_profit_rate
      ) VALUES (
        (v_row->>'product_id')::uuid,
        p_report_month,
        round(COALESCE((v_row->>'quantity')::numeric, 0))::integer,
        round(COALESCE((v_row->>'amount')::numeric, 0))::integer,
        COALESCE((v_row->>'unit_price')::numeric, 0),
        COALESCE((v_row->>'unit_profit_rate')::numeric, 0)
      )
      ON CONFLICT (product_id, report_month) DO UPDATE SET
        base_count = EXCLUDED.base_count,
        base_amount = EXCLUDED.base_amount,
        unit_price = EXCLUDED.unit_price,
        unit_profit_rate = EXCLUDED.unit_profit_rate;
    ELSE
      EXECUTE format(
        'INSERT INTO public.web_sales_summary
          (product_id, report_month, %1$I, unit_price, unit_profit_rate)
         VALUES
          (($1->>''product_id'')::uuid, $2,
           round(COALESCE(($1->>''quantity'')::numeric, 0))::integer,
           COALESCE(($1->>''unit_price'')::numeric, 0),
           COALESCE(($1->>''unit_profit_rate'')::numeric, 0))
         ON CONFLICT (product_id, report_month) DO UPDATE SET
          %1$I = EXCLUDED.%1$I,
          unit_price = EXCLUDED.unit_price,
          unit_profit_rate = EXCLUDED.unit_profit_rate',
        v_count_column
      ) USING v_row, p_report_month;
    END IF;
    v_row_count := v_row_count + 1;
  END LOOP;

  RETURN v_row_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_web_sales_channel_summary(text, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_web_sales_channel_summary(text, date, jsonb)
  TO service_role;

COMMENT ON TABLE public.web_sales_sync_runs IS 'WEB sales API synchronization execution history';
COMMENT ON TABLE public.web_sales_sync_items IS 'Immutable normalized source rows for each synchronization run';
COMMENT ON TABLE public.web_sales_external_mappings IS 'Stable EC product key to TSA product mapping';
COMMENT ON TABLE public.web_sales_sync_unmatched IS 'Products requiring manual TSA product mapping';
