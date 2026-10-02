-- Atomic API advertising acquisition. Every existing source snapshot and
-- per-series amount is checked under the same lock before writes.
CREATE OR REPLACE FUNCTION public.apply_official_ad_api_acquisition(
  p_channel text,
  p_report_month date,
  p_performance_rows jsonb,
  p_cost_rows jsonb,
  p_expected_performance_rows jsonb,
  p_expected_cost_rows jsonb,
  p_apply_costs boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  actual_performance jsonb;
  actual_costs jsonb;
  row_value jsonb;
  existing_count integer;
  inserted_count integer := 0;
  total_cost numeric := 0;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('amazon', 'meta') OR p_report_month IS NULL OR p_apply_costs IS NULL
    OR extract(day from p_report_month) <> 1 THEN RAISE EXCEPTION 'Invalid acquisition channel/month'; END IF;
  IF jsonb_typeof(p_performance_rows) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_cost_rows) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_expected_performance_rows) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_expected_cost_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_performance_rows) > 20000
    OR jsonb_array_length(p_cost_rows) > 20000 THEN RAISE EXCEPTION 'Invalid acquisition rows'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('official-ad:' || p_channel || ':' || p_report_month::text, 0));
  -- Legacy importers do not share the advisory lock. Protect missing rows and
  -- newly inserted product series as well as rows already present.
  LOCK TABLE public.advertising_costs IN SHARE ROW EXCLUSIVE MODE;
  -- Row locks also protect existing values against writers that do not use the
  -- advisory lock (legacy CSV importers).
  PERFORM 1 FROM public.advertising_costs WHERE report_month = p_report_month FOR UPDATE;
  IF p_channel = 'amazon' THEN
    LOCK TABLE public.amazon_ads_performance IN SHARE ROW EXCLUSIVE MODE;
    PERFORM 1 FROM public.amazon_ads_performance WHERE report_month = to_char(p_report_month, 'YYYY-MM') FOR UPDATE;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO actual_performance FROM
      (SELECT id, campaign_name, ad_group_name, asin, sku, cost, series_code
       FROM public.amazon_ads_performance WHERE report_month = to_char(p_report_month, 'YYYY-MM')) s;
  ELSE
    LOCK TABLE public.meta_ads_performance IN SHARE ROW EXCLUSIVE MODE;
    PERFORM 1 FROM public.meta_ads_performance WHERE report_month = to_char(p_report_month, 'YYYY-MM') FOR UPDATE;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO actual_performance FROM
      (SELECT id, campaign_name, ad_set_name, amount_spent, series_code
       FROM public.meta_ads_performance WHERE report_month = to_char(p_report_month, 'YYYY-MM')) s;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('series_code', series_code, 'cost',
    CASE WHEN p_channel = 'amazon' THEN amazon_cost ELSE meta_cost END)), '[]'::jsonb)
    INTO actual_costs FROM public.advertising_costs WHERE report_month = p_report_month;
  IF EXISTS ((SELECT value FROM jsonb_array_elements(actual_performance)) EXCEPT (SELECT value FROM jsonb_array_elements(p_expected_performance_rows)))
    OR EXISTS ((SELECT value FROM jsonb_array_elements(p_expected_performance_rows)) EXCEPT (SELECT value FROM jsonb_array_elements(actual_performance)))
    OR jsonb_array_length(actual_performance) <> jsonb_array_length(p_expected_performance_rows)
    OR EXISTS ((SELECT value FROM jsonb_array_elements(actual_costs)) EXCEPT (SELECT value FROM jsonb_array_elements(p_expected_cost_rows)))
    OR EXISTS ((SELECT value FROM jsonb_array_elements(p_expected_cost_rows)) EXCEPT (SELECT value FROM jsonb_array_elements(actual_costs)))
    OR jsonb_array_length(actual_costs) <> jsonb_array_length(p_expected_cost_rows)
    THEN RAISE EXCEPTION 'Acquisition source changed; retry reconciliation'; END IF;
  existing_count := jsonb_array_length(actual_performance);
  FOR row_value IN SELECT value FROM jsonb_array_elements(p_performance_rows) LOOP
    IF jsonb_typeof(row_value) <> 'object' OR row_value->>'report_month' IS DISTINCT FROM to_char(p_report_month, 'YYYY-MM')
      OR coalesce(row_value->>'campaign_name', '') = ''
      OR jsonb_typeof(row_value->(CASE WHEN p_channel = 'amazon' THEN 'cost' ELSE 'amount_spent' END)) IS DISTINCT FROM 'number'
      OR (row_value->>(CASE WHEN p_channel = 'amazon' THEN 'cost' ELSE 'amount_spent' END))::numeric NOT BETWEEN 0 AND 10000000000
      OR (p_channel = 'amazon' AND (coalesce(row_value->>'asin', '') = '' OR coalesce(row_value->>'ad_group_name', '') = ''))
      OR (p_channel = 'meta' AND coalesce(row_value->>'ad_set_name', '') = '')
      THEN RAISE EXCEPTION 'Invalid performance amount or key'; END IF;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(p_cost_rows) LOOP
    IF jsonb_typeof(row_value->'cost') IS DISTINCT FROM 'number'
      OR (row_value->>'cost')::numeric NOT BETWEEN 0 AND 10000000000
      OR trunc((row_value->>'cost')::numeric) <> (row_value->>'cost')::numeric
      OR jsonb_typeof(row_value->'series_code') IS DISTINCT FROM 'number'
      OR (row_value->>'series_code')::numeric NOT BETWEEN 1 AND 2147483647
      OR trunc((row_value->>'series_code')::numeric) <> (row_value->>'series_code')::numeric
      THEN RAISE EXCEPTION 'Invalid series cost'; END IF;
    total_cost := total_cost + (row_value->>'cost')::numeric;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_cost_rows)) <>
    (SELECT count(DISTINCT value->>'series_code') FROM jsonb_array_elements(p_cost_rows))
    THEN RAISE EXCEPTION 'Duplicate series cost'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_cost_rows) candidate
    WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE series_code=(candidate->>'series_code')::integer))
    THEN RAISE EXCEPTION 'Unknown product series'; END IF;
  IF p_channel='amazon' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_performance_rows) candidate
    GROUP BY candidate->>'campaign_name',candidate->>'ad_group_name',candidate->>'asin',coalesce(candidate->>'sku','') HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Duplicate advertised product'; END IF;
  IF p_channel='meta' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_performance_rows) candidate
    GROUP BY candidate->>'campaign_name',candidate->>'ad_set_name' HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Duplicate Meta ad set'; END IF;
  IF p_apply_costs AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(actual_costs) old
    LEFT JOIN jsonb_array_elements(p_cost_rows) candidate ON candidate->>'series_code' = old->>'series_code'
    WHERE coalesce((old->>'cost')::numeric, 0) > 0
      AND abs((old->>'cost')::numeric - coalesce((candidate->>'cost')::numeric, 0)) > 1
  ) THEN RAISE EXCEPTION 'Existing series cost must be reconciled'; END IF;
  IF p_channel = 'amazon' THEN
    IF existing_count = 0 THEN
      INSERT INTO public.amazon_ads_performance
        (report_month,start_date,end_date,campaign_name,ad_group_name,sku,asin,impressions,clicks,ctr,cpc,cost,sales,acos,roas,orders,units_sold,conversion_rate,series_code)
      SELECT report_month,start_date,end_date,campaign_name,ad_group_name,sku,asin,impressions,clicks,ctr,cpc,cost,sales,acos,roas,orders,units_sold,conversion_rate,series_code
        FROM jsonb_populate_recordset(NULL::public.amazon_ads_performance,p_performance_rows);
      GET DIAGNOSTICS inserted_count = ROW_COUNT;
    ELSE
      UPDATE public.amazon_ads_performance old SET series_code = candidate.series_code
        FROM jsonb_populate_recordset(NULL::public.amazon_ads_performance,p_performance_rows) candidate
        WHERE old.report_month = to_char(p_report_month,'YYYY-MM') AND old.series_code IS NULL AND candidate.series_code > 0
          AND old.campaign_name = candidate.campaign_name AND old.ad_group_name = candidate.ad_group_name
          AND old.asin = candidate.asin AND coalesce(old.sku,'') = coalesce(candidate.sku,'');
    END IF;
    IF p_apply_costs THEN
      INSERT INTO public.advertising_costs (series_code,report_month,amazon_cost)
        SELECT (value->>'series_code')::integer,p_report_month,(value->>'cost')::numeric FROM jsonb_array_elements(p_cost_rows)
        ON CONFLICT (series_code,report_month) DO UPDATE SET amazon_cost = EXCLUDED.amazon_cost;
    END IF;
  ELSE
    IF existing_count = 0 THEN
      INSERT INTO public.meta_ads_performance
        (report_month,campaign_name,ad_set_name,amount_spent,impressions,reach,frequency,cpm,clicks,link_clicks,ctr,cpc,series_code)
      SELECT report_month,campaign_name,ad_set_name,amount_spent,impressions,reach,frequency,cpm,clicks,link_clicks,ctr,cpc,series_code
        FROM jsonb_populate_recordset(NULL::public.meta_ads_performance,p_performance_rows);
      GET DIAGNOSTICS inserted_count = ROW_COUNT;
    ELSE
      UPDATE public.meta_ads_performance old SET series_code = candidate.series_code
        FROM jsonb_populate_recordset(NULL::public.meta_ads_performance,p_performance_rows) candidate
        WHERE old.report_month = to_char(p_report_month,'YYYY-MM') AND old.series_code IS NULL AND candidate.series_code > 0
          AND old.campaign_name = candidate.campaign_name AND old.ad_set_name = candidate.ad_set_name;
    END IF;
    IF p_apply_costs THEN
      INSERT INTO public.advertising_costs (series_code,report_month,meta_cost)
        SELECT (value->>'series_code')::integer,p_report_month,(value->>'cost')::numeric FROM jsonb_array_elements(p_cost_rows)
        ON CONFLICT (series_code,report_month) DO UPDATE SET meta_cost = EXCLUDED.meta_cost;
    END IF;
  END IF;
  RETURN jsonb_build_object('insertedCount', inserted_count, 'totalCost', total_cost, 'costsApplied', p_apply_costs);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_official_ad_api_acquisition(text,date,jsonb,jsonb,jsonb,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_official_ad_api_acquisition(text,date,jsonb,jsonb,jsonb,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_official_ec_profit_acquisition(p_data jsonb, p_expected_existing jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  existing public.ec_profit_monthly%ROWTYPE;
  incoming public.ec_profit_monthly%ROWTYPE;
  field_name text;
  wrote integer;
BEGIN
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object'
    OR coalesce(p_data->>'channel','') NOT IN ('amazon','base')
    OR coalesce(p_data->>'report_month','') !~ '^\d{4}-\d{2}-01$'
    OR coalesce(p_data->>'coverage_level','') NOT IN ('complete','partial','needs_review')
    OR coalesce(p_data->>'report_basis','') NOT IN ('order','transaction','settlement','mixed')
    OR jsonb_typeof(p_data->'source_files') IS DISTINCT FROM 'array'
    OR length(coalesce(p_data->>'notes','')) > 4000 THEN RAISE EXCEPTION 'Invalid EC acquisition'; END IF;
  FOREACH field_name IN ARRAY ARRAY['gross_sales','refunds','platform_fees','payment_fees','seller_discounts','seller_coupons','seller_points','shipping_costs','other_costs','other_credits'] LOOP
    IF jsonb_typeof(p_data->field_name) IS DISTINCT FROM 'number'
      OR (p_data->>field_name)::numeric NOT BETWEEN 0 AND 10000000000 THEN RAISE EXCEPTION 'Invalid EC amount'; END IF;
  END LOOP;
  SELECT * INTO incoming FROM jsonb_populate_record(NULL::public.ec_profit_monthly,p_data);
  IF incoming.report_month IS NULL OR incoming.period_start IS NULL OR incoming.period_end IS NULL
    OR incoming.report_month <> date_trunc('month',incoming.report_month)::date
    OR incoming.period_start <> incoming.report_month
    OR incoming.period_end <> (incoming.report_month + interval '1 month - 1 day')::date
    OR incoming.raw_summary->>'acquisition_source' IS DISTINCT FROM 'official_api'
    OR incoming.source_job_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid EC acquisition period/source'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('official-ec:' || incoming.channel || ':' || incoming.report_month::text,0));
  LOCK TABLE public.ec_profit_monthly IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO existing FROM public.ec_profit_monthly WHERE channel=incoming.channel AND report_month=incoming.report_month FOR UPDATE;
  IF FOUND THEN
    IF existing.coverage_level='complete' OR (existing.coverage_level='partial' AND incoming.coverage_level='needs_review'
      AND (existing.source_job_id IS NOT NULL OR existing.raw_summary->>'acquisition_source'='official_api')) THEN
      RETURN jsonb_build_object('preservedExisting',true,'importedCount',0);
    END IF;
    IF p_expected_existing IS NULL OR NOT (to_jsonb(existing) @> p_expected_existing) THEN RAISE EXCEPTION 'EC acquisition source changed'; END IF;
    UPDATE public.ec_profit_monthly SET period_start=incoming.period_start,period_end=incoming.period_end,report_basis=incoming.report_basis,
      coverage_level=incoming.coverage_level,gross_sales=incoming.gross_sales,refunds=incoming.refunds,platform_fees=incoming.platform_fees,
      payment_fees=incoming.payment_fees,seller_discounts=incoming.seller_discounts,seller_coupons=incoming.seller_coupons,
      seller_points=incoming.seller_points,shipping_costs=incoming.shipping_costs,other_costs=incoming.other_costs,
      other_credits=incoming.other_credits,net_payout=incoming.net_payout,source_job_id=NULL,source_files=incoming.source_files,
      raw_summary=incoming.raw_summary,notes=incoming.notes,imported_at=now(),updated_at=now() WHERE id=existing.id;
  ELSE
    IF p_expected_existing IS NOT NULL THEN RAISE EXCEPTION 'EC acquisition source changed'; END IF;
    INSERT INTO public.ec_profit_monthly (channel,report_month,period_start,period_end,report_basis,coverage_level,gross_sales,refunds,
      platform_fees,payment_fees,seller_discounts,seller_coupons,seller_points,shipping_costs,other_costs,other_credits,
      net_payout,source_job_id,source_files,raw_summary,notes,imported_at,updated_at)
    VALUES(incoming.channel,incoming.report_month,incoming.period_start,incoming.period_end,incoming.report_basis,incoming.coverage_level,
      incoming.gross_sales,incoming.refunds,incoming.platform_fees,incoming.payment_fees,incoming.seller_discounts,incoming.seller_coupons,
      incoming.seller_points,incoming.shipping_costs,incoming.other_costs,incoming.other_credits,incoming.net_payout,NULL,
      incoming.source_files,incoming.raw_summary,incoming.notes,now(),now()) ON CONFLICT(channel,report_month) DO NOTHING;
    GET DIAGNOSTICS wrote = ROW_COUNT;
    IF wrote=0 THEN RETURN jsonb_build_object('preservedExisting',true,'importedCount',0); END IF;
  END IF;
  RETURN jsonb_build_object('preservedExisting',false,'importedCount',1);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_official_ec_profit_acquisition(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_official_ec_profit_acquisition(jsonb,jsonb) TO service_role;
