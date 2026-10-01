-- Preserve each EC's reported product-sales amount on the report's original
-- basis (which can include shipping) separately from catalog prices and
-- monthly cost snapshots. NULL means no actual amount was obtained; 0 is an
-- explicit zero. Historical non-BASE quantities do not imply a revenue amount.
ALTER TABLE public.web_sales_summary
  ADD COLUMN IF NOT EXISTS amazon_amount numeric,
  ADD COLUMN IF NOT EXISTS rakuten_amount numeric,
  ADD COLUMN IF NOT EXISTS yahoo_amount numeric,
  ADD COLUMN IF NOT EXISTS mercari_amount numeric,
  ADD COLUMN IF NOT EXISTS qoo10_amount numeric,
  ADD COLUMN IF NOT EXISTS tiktok_amount numeric;

-- Widening an integer amount is lossless and keeps all existing BASE values.
ALTER TABLE public.web_sales_summary ALTER COLUMN base_amount TYPE numeric;
ALTER TABLE public.web_sales_summary ALTER COLUMN base_amount DROP NOT NULL;

COMMENT ON COLUMN public.web_sales_summary.amazon_amount IS 'Official merchandise revenue; NULL=not obtained, 0=reported zero. Never recompute from catalog price.';
COMMENT ON COLUMN public.web_sales_summary.rakuten_amount IS 'Official merchandise revenue; NULL=not obtained, 0=reported zero. Never recompute from catalog price.';
COMMENT ON COLUMN public.web_sales_summary.yahoo_amount IS 'Official merchandise revenue after seller discounts; NULL=not obtained, 0=reported zero. Never recompute from catalog price.';
COMMENT ON COLUMN public.web_sales_summary.mercari_amount IS 'Official product-sales report amount on its original basis, including shipping when the report includes it; NULL=not obtained, 0=reported zero. Do not deduct the same shipping or settlement item again.';
COMMENT ON COLUMN public.web_sales_summary.base_amount IS 'Official merchandise revenue; shipping and settlement deductions are separate.';
COMMENT ON COLUMN public.web_sales_summary.qoo10_amount IS 'Official merchandise revenue; platform coupons and settlement deductions are separate.';
COMMENT ON COLUMN public.web_sales_summary.tiktok_amount IS 'Official merchandise revenue; platform coupons and settlement deductions are separate.';

CREATE OR REPLACE FUNCTION public.replace_web_sales_channel_summary(
  p_channel text,
  p_report_month date,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count_column text;
  v_amount_column text;
  v_row jsonb;
  v_row_count integer := 0;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok') THEN
    RAISE EXCEPTION 'Unsupported WEB sales channel';
  END IF;
  IF p_report_month IS NULL OR p_report_month <> date_trunc('month', p_report_month)::date THEN
    RAISE EXCEPTION 'report_month must be the first day of the month';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;
  -- Validate every row before replacing a month. Missing amounts must never
  -- silently become zero, and duplicate products must already be aggregated.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object'
      OR jsonb_typeof(v_row->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_row->'amount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Each summary row requires numeric quantity and official amount';
    END IF;
    IF (v_row->>'quantity')::numeric < 0
      OR (v_row->>'quantity')::numeric <> trunc((v_row->>'quantity')::numeric) THEN
      RAISE EXCEPTION 'Summary quantity must be a nonnegative integer';
    END IF;
    IF (v_row->>'quantity')::numeric = 0 AND (v_row->>'amount')::numeric <> 0 THEN
      RAISE EXCEPTION 'A nonzero sales amount requires a positive sales quantity';
    END IF;
    IF v_row->>'product_id' IS NULL THEN
      RAISE EXCEPTION 'Each summary row requires product_id';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) item
    GROUP BY (item->>'product_id')::uuid HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Summary rows must be aggregated by product_id';
  END IF;

  v_count_column := p_channel || '_count';
  v_amount_column := p_channel || '_amount';
  EXECUTE format(
    'UPDATE public.web_sales_summary SET %1$I = 0, %2$I = 0 WHERE report_month = $1',
    v_count_column, v_amount_column
  ) USING p_report_month;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    EXECUTE format(
      'INSERT INTO public.web_sales_summary
        (product_id, report_month, %1$I, %2$I, unit_price, unit_profit_rate)
       VALUES
        (($1->>''product_id'')::uuid, $2,
         ($1->>''quantity'')::integer,
         ($1->>''amount'')::numeric,
         COALESCE(($1->>''unit_price'')::numeric, 0),
         COALESCE(($1->>''unit_profit_rate'')::numeric, 0))
       ON CONFLICT (product_id, report_month) DO UPDATE SET
        %1$I = EXCLUDED.%1$I,
        %2$I = EXCLUDED.%2$I,
        unit_price = COALESCE(web_sales_summary.unit_price, EXCLUDED.unit_price),
        unit_profit_rate = COALESCE(web_sales_summary.unit_profit_rate, EXCLUDED.unit_profit_rate)',
      v_count_column, v_amount_column
    ) USING v_row, p_report_month;
    v_row_count := v_row_count + 1;
  END LOOP;
  RETURN v_row_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_web_sales_channel_summary(text, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_web_sales_channel_summary(text, date, jsonb)
  TO service_role;
