-- Apply a verified monthly Google Ads API snapshot atomically. The other
-- advertising media and their original amounts are preserved.
CREATE OR REPLACE FUNCTION public.apply_google_ads_api_acquisition(
  p_report_month date,
  p_performance_rows jsonb,
  p_cost_rows jsonb,
  p_expected_existing_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_total numeric;
  incoming_total numeric;
  last_day date;
BEGIN
  IF p_report_month IS NULL OR p_report_month <> date_trunc('month', p_report_month)::date
    OR p_expected_existing_total IS NULL OR p_expected_existing_total < 0 OR p_expected_existing_total > 10000000000
    OR jsonb_typeof(p_performance_rows) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_cost_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid Google Ads monthly acquisition inputs';
  END IF;
  IF jsonb_array_length(p_performance_rows) > 50000 OR jsonb_array_length(p_cost_rows) > 1000 THEN
    RAISE EXCEPTION 'Google Ads acquisition size limit exceeded';
  END IF;
  last_day := (p_report_month + interval '1 month - 1 day')::date;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_cost_rows) AS item
    WHERE COALESCE(item->>'series_code', '') !~ '^[1-9][0-9]*$'
      OR COALESCE(item->>'google_cost', '') !~ '^[0-9]+$'
      OR (item->>'google_cost')::numeric > 10000000000
  ) THEN
    RAISE EXCEPTION 'Invalid Google Ads series costs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_cost_rows) AS row(series_code integer, google_cost numeric)
    GROUP BY series_code HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Google Ads series costs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_cost_rows) AS row(series_code integer, google_cost numeric)
    WHERE NOT EXISTS (SELECT 1 FROM public.products AS product WHERE product.series_code = row.series_code)
  ) THEN
    RAISE EXCEPTION 'Unknown Google Ads product series';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_performance_rows) AS row(
      campaign_name text, asset_group_name text, report_date date, cost_micros bigint,
      impressions integer, clicks integer, conversions numeric, conversions_value numeric, series_code integer
    )
    WHERE NULLIF(trim(campaign_name), '') IS NULL OR NULLIF(trim(asset_group_name), '') IS NULL
      OR report_date IS NULL OR report_date < p_report_month OR report_date > last_day
      OR cost_micros IS NULL OR cost_micros < 0 OR cost_micros > 10000000000000000
      OR impressions IS NULL OR impressions < 0 OR clicks IS NULL OR clicks < 0
      OR conversions IS NULL OR conversions_value IS NULL
      OR (series_code IS NOT NULL AND series_code <= 0)
  ) THEN
    RAISE EXCEPTION 'Invalid Google Ads performance rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_performance_rows) AS row(campaign_name text, asset_group_name text, report_date date)
    GROUP BY campaign_name, asset_group_name, report_date HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Google Ads performance rows';
  END IF;

  -- A table lock also serializes writes from the existing CSV/import endpoint,
  -- which does not use this function's advisory locking contract.
  LOCK TABLE public.advertising_costs IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.google_ads_performance IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(sum(google_cost), 0) INTO current_total
    FROM public.advertising_costs WHERE report_month = p_report_month;
  IF current_total IS DISTINCT FROM p_expected_existing_total THEN
    RAISE EXCEPTION 'Saved Google Ads costs changed during acquisition';
  END IF;
  SELECT COALESCE(sum(google_cost), 0) INTO incoming_total
    FROM jsonb_to_recordset(p_cost_rows) AS row(series_code integer, google_cost numeric);
  IF current_total > 0 AND abs(current_total - incoming_total) > 1 THEN
    RAISE EXCEPTION 'Google Ads official and saved totals require reconciliation';
  END IF;
  IF jsonb_array_length(p_performance_rows) = 0 AND incoming_total <> 0 THEN
    RAISE EXCEPTION 'Google Ads costs have no official performance rows';
  END IF;

  DELETE FROM public.google_ads_performance WHERE report_date BETWEEN p_report_month AND last_day;
  INSERT INTO public.google_ads_performance (
    campaign_name, asset_group_name, asset_group_status, report_date, cost_micros,
    impressions, clicks, conversions, conversions_value, series_code, synced_at
  )
  SELECT campaign_name, asset_group_name, asset_group_status, report_date, cost_micros,
    impressions, clicks, conversions, conversions_value, series_code, now()
  FROM jsonb_to_recordset(p_performance_rows) AS row(
    campaign_name text, asset_group_name text, asset_group_status text, report_date date,
    cost_micros bigint, impressions integer, clicks integer, conversions numeric,
    conversions_value numeric, series_code integer
  );

  UPDATE public.advertising_costs SET google_cost = 0 WHERE report_month = p_report_month;
  UPDATE public.advertising_costs AS existing SET google_cost = incoming.google_cost
  FROM jsonb_to_recordset(p_cost_rows) AS incoming(series_code integer, google_cost numeric)
  WHERE existing.report_month = p_report_month AND existing.series_code = incoming.series_code;
  INSERT INTO public.advertising_costs (
    report_month, series_code, google_cost, meta_cost, amazon_cost, rakuten_cost, yahoo_cost, other_cost
  )
  SELECT p_report_month, incoming.series_code, incoming.google_cost, 0, 0, 0, 0, 0
  FROM jsonb_to_recordset(p_cost_rows) AS incoming(series_code integer, google_cost numeric)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.advertising_costs AS existing
    WHERE existing.report_month = p_report_month AND existing.series_code = incoming.series_code
  );
  RETURN jsonb_build_object('totalCost', incoming_total, 'seriesCount', jsonb_array_length(p_cost_rows),
    'performanceCount', jsonb_array_length(p_performance_rows));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_google_ads_api_acquisition(date, jsonb, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_google_ads_api_acquisition(date, jsonb, jsonb, numeric) TO service_role;
