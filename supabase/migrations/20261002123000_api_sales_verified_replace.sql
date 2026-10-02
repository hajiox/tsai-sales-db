-- API imports cannot overwrite a concurrently edited, verified monthly report.
-- The existing CSV/manual RPC is intentionally unchanged. Its writes acquire
-- ROW EXCLUSIVE locks, which conflict with this short comparison/write lock.
CREATE OR REPLACE FUNCTION public.replace_verified_api_sales_summary(
  p_channel text,
  p_report_month date,
  p_rows jsonb,
  p_period_start date,
  p_period_end date,
  p_expected_summary jsonb,
  p_reconciliation_required boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  actual_summary jsonb;
  expected_summary jsonb;
  incoming_summary jsonb;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('amazon', 'rakuten', 'yahoo', 'base')
    OR p_report_month IS NULL OR p_report_month <> date_trunc('month', p_report_month)::date
    OR p_period_start IS DISTINCT FROM p_report_month
    OR p_period_end IS DISTINCT FROM (p_report_month + interval '1 month - 1 day')::date
    OR p_reconciliation_required IS NULL
    OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
    OR p_expected_summary IS NULL OR jsonb_typeof(p_expected_summary) <> 'array' THEN
    RAISE EXCEPTION 'api_sales_condition_unverified';
  END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'product_id'), '[]'::jsonb)
    INTO expected_summary FROM jsonb_array_elements(p_expected_summary);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(expected_summary) value
    WHERE jsonb_typeof(value->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(value->'amount') IS DISTINCT FROM 'number'
      OR value->>'product_id' IS NULL) THEN
    RAISE EXCEPTION 'api_sales_baseline_unverified';
  END IF;
  LOCK TABLE public.web_sales_summary IN SHARE ROW EXCLUSIVE MODE;
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(jsonb_build_object(''product_id'', product_id::text,
       ''quantity'', coalesce(%1$I, 0), ''amount'', %2$I) ORDER BY product_id::text), ''[]''::jsonb)
       FROM public.web_sales_summary WHERE report_month = $1
       AND (coalesce(%1$I, 0) <> 0 OR coalesce(%2$I, 0) <> 0)',
    p_channel || '_count', p_channel || '_amount')
    INTO actual_summary USING p_report_month;
  IF actual_summary IS DISTINCT FROM expected_summary
    OR (p_reconciliation_required AND expected_summary = '[]'::jsonb) THEN
    RAISE EXCEPTION 'api_sales_summary_changed_or_unverified';
  END IF;
  -- Recheck every product inside the transaction, not just the grand total.
  SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', value->>'product_id',
    'quantity', value->'quantity', 'amount', value->'amount') ORDER BY value->>'product_id'), '[]'::jsonb)
    INTO incoming_summary FROM jsonb_array_elements(p_rows) value
    WHERE (value->>'quantity')::numeric <> 0 OR (value->>'amount')::numeric <> 0;
  IF expected_summary <> '[]'::jsonb AND incoming_summary IS DISTINCT FROM expected_summary THEN
    RAISE EXCEPTION 'api_sales_report_product_mismatch';
  END IF;
  RETURN public.replace_web_sales_channel_summary(p_channel, p_report_month, p_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_verified_api_sales_summary(text, date, jsonb, date, date, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_verified_api_sales_summary(text, date, jsonb, date, date, jsonb, boolean)
  TO service_role;
