-- 2026-10-01: WEB sales revenue consumers use the EC's reported amount.
-- Existing response shapes, function owners, RLS behavior, and execution ACLs
-- are preserved by CREATE OR REPLACE. Grants are only for pure numeric helpers;
-- no existing RPC or table privileges and no data values are changed here.
-- SUM ordinarily ignores NULL; each affected aggregate explicitly propagates
-- missing sold amounts/costs. Empty/unsold groups stay zero.
-- Daily-sales-report RPCs and quantity-only RPCs are intentionally unchanged.

-- Keep recorded money separate from catalog prices. These helpers are pure:
-- they read no table, do not bypass RLS, and have no mutation privileges.
CREATE OR REPLACE FUNCTION public.web_sales_reported_amount(
  quantity numeric, reported_amount numeric
)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN COALESCE(quantity, 0) = 0 THEN 0::numeric ELSE reported_amount END;
$function$;

CREATE OR REPLACE FUNCTION public.web_sales_reported_profit(
  quantity numeric, reported_amount numeric, snapshot_cost numeric,
  snapshot_price numeric, snapshot_profit_rate numeric
)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN COALESCE(quantity, 0) = 0 THEN 0::numeric
    WHEN reported_amount IS NULL OR snapshot_cost IS NULL OR snapshot_cost <= 0
      OR (COALESCE(snapshot_profit_rate, 0) = 0 AND snapshot_cost = snapshot_price)
      THEN NULL::numeric
    ELSE reported_amount - quantity * snapshot_cost
  END;
$function$;

COMMENT ON FUNCTION public.web_sales_reported_amount(numeric, numeric)
  IS 'Recorded EC amount; quantity zero is zero, sold amount missing remains NULL.';
COMMENT ON FUNCTION public.web_sales_reported_profit(numeric, numeric, numeric, numeric, numeric)
  IS 'Recorded EC revenue minus saved quantity times known saved cost. Unverified cost/amount remains NULL.';

CREATE OR REPLACE FUNCTION public.web_sales_reported_total_amount(sales public.web_sales_summary)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT (public.web_sales_reported_amount(s.amazon_count, s.amazon_amount) + public.web_sales_reported_amount(s.rakuten_count, s.rakuten_amount) + public.web_sales_reported_amount(s.yahoo_count, s.yahoo_amount) + public.web_sales_reported_amount(s.mercari_count, s.mercari_amount) + public.web_sales_reported_amount(s.base_count, s.base_amount) + public.web_sales_reported_amount(s.qoo10_count, s.qoo10_amount) + public.web_sales_reported_amount(s.tiktok_count, s.tiktok_amount))
  FROM (SELECT ($1).*) AS s;
$function$;

CREATE OR REPLACE FUNCTION public.web_sales_reported_total_profit(sales public.web_sales_summary)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT public.web_sales_reported_profit(
    (COALESCE(s.amazon_count, 0) + COALESCE(s.rakuten_count, 0) + COALESCE(s.yahoo_count, 0) + COALESCE(s.mercari_count, 0) + COALESCE(s.base_count, 0) + COALESCE(s.qoo10_count, 0) + COALESCE(s.tiktok_count, 0)), public.web_sales_reported_total_amount($1),
    s.unit_cost_ex_ec, s.unit_price, s.unit_profit_rate
  )
  FROM (SELECT ($1).*) AS s;
$function$;

-- Existing read RPCs allow PUBLIC/anon/authenticated/service_role. Make pure
-- arithmetic helpers callable under the same roles regardless of the owner's
-- default function ACL. This grants no table or composite-type privileges.
GRANT EXECUTE ON FUNCTION public.web_sales_reported_amount(numeric, numeric)
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_sales_reported_profit(numeric, numeric, numeric, numeric, numeric)
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_sales_reported_total_amount(public.web_sales_summary)
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_sales_reported_total_profit(public.web_sales_summary)
  TO PUBLIC, anon, authenticated, service_role;

-- get_monthly_financial_summary(target_month text)
CREATE OR REPLACE FUNCTION public.get_monthly_financial_summary(target_month text)
 RETURNS TABLE(total_count integer, total_amount bigint, total_profit bigint, total_ad_cost bigint, total_final_profit bigint, amazon_count integer, amazon_amount bigint, amazon_profit bigint, amazon_ad_cost bigint, amazon_final_profit bigint, rakuten_count integer, rakuten_amount bigint, rakuten_profit bigint, rakuten_ad_cost bigint, rakuten_final_profit bigint, yahoo_count integer, yahoo_amount bigint, yahoo_profit bigint, yahoo_ad_cost bigint, yahoo_final_profit bigint, mercari_count integer, mercari_amount bigint, mercari_profit bigint, mercari_ad_cost bigint, mercari_final_profit bigint, base_count integer, base_amount bigint, base_profit bigint, base_ad_cost bigint, base_final_profit bigint, qoo10_count integer, qoo10_amount bigint, qoo10_profit bigint, qoo10_ad_cost bigint, qoo10_final_profit bigint, tiktok_count integer, tiktok_amount bigint, tiktok_profit bigint, tiktok_ad_cost bigint, tiktok_final_profit bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH sales_data AS (
    SELECT
      SUM(COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) + COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) + COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) + COALESCE(ws.tiktok_count, 0))::integer AS total_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_total_amount(ws)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_total_amount(ws)), 0::numeric) END)::bigint AS total_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_total_profit(ws))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_total_profit(ws))), 0::numeric) END)::bigint::bigint AS total_prf,
      SUM(COALESCE(ws.amazon_count, 0))::integer AS amazon_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)), 0::numeric) END)::bigint AS amazon_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.amazon_count, 0), public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.amazon_count, 0), public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint::bigint AS amazon_prf,
      SUM(COALESCE(ws.rakuten_count, 0))::integer AS rakuten_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)), 0::numeric) END)::bigint AS rakuten_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.rakuten_count, 0), public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.rakuten_count, 0), public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint::bigint AS rakuten_prf,
      SUM(COALESCE(ws.yahoo_count, 0))::integer AS yahoo_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)), 0::numeric) END)::bigint AS yahoo_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.yahoo_count, 0), public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.yahoo_count, 0), public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint::bigint AS yahoo_prf,
      SUM(COALESCE(ws.mercari_count, 0))::integer AS mercari_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)), 0::numeric) END)::bigint AS mercari_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.mercari_count, 0), public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.mercari_count, 0), public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint::bigint AS mercari_prf,
      SUM(COALESCE(ws.base_count, 0))::integer AS base_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.base_count, ws.base_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.base_count, ws.base_amount)), 0::numeric) END)::bigint AS base_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.base_count, 0), public.web_sales_reported_amount(ws.base_count, ws.base_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.base_count, 0), public.web_sales_reported_amount(ws.base_count, ws.base_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint::bigint AS base_prf,
      SUM(COALESCE(ws.qoo10_count, 0))::integer AS qoo10_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)), 0::numeric) END)::bigint AS qoo10_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.qoo10_count, 0), public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.qoo10_count, 0), public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint::bigint AS qoo10_prf,
      SUM(COALESCE(ws.tiktok_count, 0))::integer AS tiktok_cnt,
      (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount)), 0::numeric) END)::bigint AS tiktok_amt,
      (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.tiktok_count, 0), public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.tiktok_count, 0), public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint::bigint AS tiktok_prf
    FROM web_sales_summary ws
    JOIN products p ON ws.product_id = p.id
    WHERE ws.report_month = (target_month || '-01')::date
  ),
  ad_costs AS (
    SELECT
      COALESCE(SUM(
        COALESCE(google_cost, 0) +
        COALESCE(meta_cost, 0) +
        COALESCE(amazon_cost, 0) +
        COALESCE(rakuten_cost, 0) +
        COALESCE(yahoo_cost, 0) +
        COALESCE(other_cost, 0)
      ), 0)::bigint AS total_cost,
      COALESCE(SUM(COALESCE(amazon_cost, 0)), 0)::bigint AS amazon_cost_val,
      COALESCE(SUM(COALESCE(rakuten_cost, 0)), 0)::bigint AS rakuten_cost_val,
      COALESCE(SUM(COALESCE(yahoo_cost, 0)), 0)::bigint AS yahoo_cost_val
    FROM advertising_costs
    WHERE report_month = (target_month || '-01')::date
  )
  SELECT
    COALESCE(sd.total_cnt, 0),
    sd.total_amt::bigint,
    sd.total_prf::bigint,
    ac.total_cost,
    sd.total_prf::bigint - ac.total_cost,
    COALESCE(sd.amazon_cnt, 0),
    sd.amazon_amt::bigint,
    sd.amazon_prf::bigint,
    ac.amazon_cost_val,
    sd.amazon_prf::bigint - ac.amazon_cost_val,
    COALESCE(sd.rakuten_cnt, 0),
    sd.rakuten_amt::bigint,
    sd.rakuten_prf::bigint,
    ac.rakuten_cost_val,
    sd.rakuten_prf::bigint - ac.rakuten_cost_val,
    COALESCE(sd.yahoo_cnt, 0),
    sd.yahoo_amt::bigint,
    sd.yahoo_prf::bigint,
    ac.yahoo_cost_val,
    sd.yahoo_prf::bigint - ac.yahoo_cost_val,
    COALESCE(sd.mercari_cnt, 0),
    sd.mercari_amt::bigint,
    sd.mercari_prf::bigint,
    0::bigint,
    sd.mercari_prf::bigint,
    COALESCE(sd.base_cnt, 0),
    sd.base_amt::bigint,
    sd.base_prf::bigint,
    0::bigint,
    sd.base_prf::bigint,
    COALESCE(sd.qoo10_cnt, 0),
    sd.qoo10_amt::bigint,
    sd.qoo10_prf::bigint,
    0::bigint,
    sd.qoo10_prf::bigint,
    COALESCE(sd.tiktok_cnt, 0),
    sd.tiktok_amt::bigint,
    sd.tiktok_prf::bigint,
    0::bigint,
    sd.tiktok_prf::bigint
  FROM sales_data sd, ad_costs ac;
END;
$function$
;

-- get_monthly_series_summary(target_month text)
CREATE OR REPLACE FUNCTION public.get_monthly_series_summary(target_month text)
 RETURNS TABLE(series_name text, series_code integer, series_count integer, series_amount bigint, series_profit bigint, series_ad_cost bigint, series_final_profit bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        p.series::text AS series_name,
        p.series_code AS series_code,
        SUM(COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) + COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) + COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) + COALESCE(ws.tiktok_count, 0))::integer AS series_count,
        (CASE WHEN COUNT(*) FILTER (WHERE (
            public.web_sales_reported_total_amount(ws)
        ) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(
            public.web_sales_reported_total_amount(ws)
        ), 0::numeric) END)::bigint::bigint AS series_amount,
        (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(
            public.web_sales_reported_total_profit(ws)
        )) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(
            public.web_sales_reported_total_profit(ws)
        )), 0::numeric) END)::bigint::bigint AS series_profit,
        -- 広告費: advertising_costsテーブルのシリーズ別実データを直接合算（均等配分廃止）
        COALESCE(
            (SELECT SUM(ac.amazon_cost + ac.google_cost + ac.meta_cost +
                        ac.rakuten_cost + ac.yahoo_cost + ac.other_cost)
             FROM advertising_costs ac
             WHERE ac.series_code = p.series_code
             AND ac.report_month = (target_month || '-01')::DATE), 0
        )::bigint AS series_ad_cost,
        -- 最終利益 = 粗利 - 広告費
        (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(
            public.web_sales_reported_total_profit(ws)
        )) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(
            public.web_sales_reported_total_profit(ws)
        )), 0::numeric) END)::bigint::bigint -
        COALESCE(
            (SELECT SUM(ac.amazon_cost + ac.google_cost + ac.meta_cost +
                        ac.rakuten_cost + ac.yahoo_cost + ac.other_cost)
             FROM advertising_costs ac
             WHERE ac.series_code = p.series_code
             AND ac.report_month = (target_month || '-01')::DATE), 0
        )::bigint AS series_final_profit
    FROM web_sales_summary ws
    LEFT JOIN products p ON ws.product_id = p.id
    WHERE ws.report_month = (target_month || '-01')::DATE
    AND p.series_code IS NOT NULL
    GROUP BY p.series, p.series_code
    ORDER BY series_count DESC;
END;
$function$
;

-- get_period_financial_summary(start_month text, end_month text)
CREATE OR REPLACE FUNCTION public.get_period_financial_summary(start_month text, end_month text)
 RETURNS TABLE(total_count integer, total_amount bigint, amazon_count integer, amazon_amount bigint, rakuten_count integer, rakuten_amount bigint, yahoo_count integer, yahoo_amount bigint, mercari_count integer, mercari_amount bigint, base_count integer, base_amount bigint, qoo10_count integer, qoo10_amount bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    SUM(COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) + COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) + COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) + COALESCE(ws.tiktok_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_total_amount(ws)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_total_amount(ws)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.amazon_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.rakuten_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.yahoo_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.mercari_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.base_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.base_count, ws.base_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.base_count, ws.base_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.qoo10_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)), 0::numeric) END)::bigint
  FROM web_sales_summary ws
  LEFT JOIN products p ON ws.product_id = p.id
  WHERE ws.report_month >= (start_month || '-01')::DATE
    AND ws.report_month <= (end_month || '-01')::DATE;
END;
$function$
;

-- get_period_series_summary(start_month text, end_month text)
CREATE OR REPLACE FUNCTION public.get_period_series_summary(start_month text, end_month text)
 RETURNS TABLE(series_name text, series_count integer, series_amount bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(p.series, '未分類'),
    SUM(COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) + COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) + COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) + COALESCE(ws.tiktok_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_total_amount(ws)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_total_amount(ws)), 0::numeric) END)::bigint
  FROM web_sales_summary ws
  LEFT JOIN products p ON ws.product_id = p.id
  WHERE ws.report_month >= (start_month || '-01')::DATE
    AND ws.report_month <= (end_month || '-01')::DATE
  GROUP BY p.series
  ORDER BY series_count DESC;
END;
$function$
;

-- get_previous_year_data(target_month text)
CREATE OR REPLACE FUNCTION public.get_previous_year_data(target_month text)
 RETURNS TABLE(total_count integer, total_amount bigint, amazon_count integer, amazon_amount bigint, rakuten_count integer, rakuten_amount bigint, yahoo_count integer, yahoo_amount bigint, mercari_count integer, mercari_amount bigint, base_count integer, base_amount bigint, qoo10_count integer, qoo10_amount bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
  previous_year_month DATE;
BEGIN
  -- 前年同月を計算
  previous_year_month := (target_month || '-01')::DATE - INTERVAL '1 year';

  RETURN QUERY
  SELECT
    SUM(COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) + COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) + COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) + COALESCE(ws.tiktok_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_total_amount(ws)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_total_amount(ws)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.amazon_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.rakuten_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.yahoo_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.mercari_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.base_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.base_count, ws.base_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.base_count, ws.base_amount)), 0::numeric) END)::bigint,
    SUM(COALESCE(ws.qoo10_count, 0))::INTEGER,
    (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)), 0::numeric) END)::bigint
  FROM web_sales_summary ws
  LEFT JOIN products p ON ws.product_id = p.id
  WHERE ws.report_month = previous_year_month;
END;
$function$
;

-- get_product_trend_data(target_month text, target_product_id uuid)
CREATE OR REPLACE FUNCTION public.get_product_trend_data(target_month text, target_product_id uuid)
 RETURNS TABLE(month_label text, sales integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  base_date DATE;
  start_month DATE;
BEGIN
  base_date := (target_month || '-01')::date;
  start_month := base_date - INTERVAL '5 months';

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(start_month, base_date, interval '1 month')::date as month_date
  )
  SELECT
    TO_CHAR(m.month_date, 'YY/MM') as month_label,
    public.web_sales_reported_total_amount(ws)::integer as sales
  FROM months m
  LEFT JOIN web_sales_summary ws
    ON ws.product_id = target_product_id
    AND ws.report_month = m.month_date
  LEFT JOIN products p ON p.id = ws.product_id
  ORDER BY m.month_date;
END;
$function$
;

-- get_series_trend_data(target_month text, target_series text)
CREATE OR REPLACE FUNCTION public.get_series_trend_data(target_month text, target_series text)
 RETURNS TABLE(month_label text, series_amount bigint, profit_amount bigint, ad_cost bigint, final_profit bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH months AS (
        SELECT generate_series(
            (target_month || '-01')::date - interval '5 months',
            (target_month || '-01')::date,
            interval '1 month'
        )::date as month_date
    ),
    series_sales AS (
        SELECT
            m.month_date,
            (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_total_amount(ws)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_total_amount(ws)), 0::numeric) END)::bigint as sales_amt,
            (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_total_profit(ws))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_total_profit(ws))), 0::numeric) END)::bigint as profit_amt,
            MAX(p.series_code) as series_code
        FROM months m
        LEFT JOIN web_sales_summary ws ON ws.report_month = m.month_date
        LEFT JOIN products p ON ws.product_id = p.id
        WHERE p.series = target_series
        GROUP BY m.month_date
    ),
    ad_costs AS (
        SELECT
            ss.month_date,
            COALESCE(
                (SELECT SUM(ac.amazon_cost + ac.google_cost + ac.meta_cost +
                            ac.rakuten_cost + ac.yahoo_cost + ac.other_cost)
                 FROM advertising_costs ac
                 WHERE ac.series_code = ss.series_code
                 AND ac.report_month = ss.month_date), 0
            ) as total_ad_cost
        FROM series_sales ss
    )
    SELECT
        to_char(ss.month_date, 'YY/MM'),
        ss.sales_amt::bigint,
        ss.profit_amt::bigint,
        COALESCE(ac.total_ad_cost, 0)::bigint,
        (ss.profit_amt - COALESCE(ac.total_ad_cost, 0))::bigint
    FROM series_sales ss
    JOIN ad_costs ac ON ss.month_date = ac.month_date
    ORDER BY ss.month_date;
END;
$function$
;

-- get_site_trend_data(target_month text, target_site text)
CREATE OR REPLACE FUNCTION public.get_site_trend_data(target_month text, target_site text)
 RETURNS TABLE(month_label text, sales bigint, profit_amount bigint, ad_cost bigint, final_profit bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    column_name text;
BEGIN
    IF target_site NOT IN ('amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok') THEN
        RAISE EXCEPTION 'Invalid site name: %', target_site;
    END IF;

    column_name := target_site || '_count';

    RETURN QUERY
    WITH months AS (
        SELECT generate_series(
            (target_month || '-01')::date - interval '5 months',
            (target_month || '-01')::date,
            interval '1 month'
        )::date as month_date
    ),
    site_data AS (
        SELECT
            m.month_date,
            CASE target_site
                WHEN 'amazon' THEN (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount)), 0::numeric) END)::bigint
                WHEN 'rakuten' THEN (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount)), 0::numeric) END)::bigint
                WHEN 'yahoo' THEN (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount)), 0::numeric) END)::bigint
                WHEN 'mercari' THEN (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount)), 0::numeric) END)::bigint
                WHEN 'base' THEN (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.base_count, ws.base_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.base_count, ws.base_amount)), 0::numeric) END)::bigint
                WHEN 'qoo10' THEN (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount)), 0::numeric) END)::bigint
                WHEN 'tiktok' THEN (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount)), 0::numeric) END)::bigint
            END as sales_amount,
            CASE target_site
                WHEN 'amazon' THEN (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.amazon_count, 0), public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.amazon_count, 0), public.web_sales_reported_amount(ws.amazon_count, ws.amazon_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint
                WHEN 'rakuten' THEN (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.rakuten_count, 0), public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.rakuten_count, 0), public.web_sales_reported_amount(ws.rakuten_count, ws.rakuten_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint
                WHEN 'yahoo' THEN (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.yahoo_count, 0), public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.yahoo_count, 0), public.web_sales_reported_amount(ws.yahoo_count, ws.yahoo_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint
                WHEN 'mercari' THEN (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.mercari_count, 0), public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.mercari_count, 0), public.web_sales_reported_amount(ws.mercari_count, ws.mercari_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint
                WHEN 'base' THEN (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.base_count, 0), public.web_sales_reported_amount(ws.base_count, ws.base_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.base_count, 0), public.web_sales_reported_amount(ws.base_count, ws.base_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint
                WHEN 'qoo10' THEN (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.qoo10_count, 0), public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.qoo10_count, 0), public.web_sales_reported_amount(ws.qoo10_count, ws.qoo10_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint
                WHEN 'tiktok' THEN (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_profit(COALESCE(ws.tiktok_count, 0), public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_profit(COALESCE(ws.tiktok_count, 0), public.web_sales_reported_amount(ws.tiktok_count, ws.tiktok_amount), ws.unit_cost_ex_ec, ws.unit_price, ws.unit_profit_rate))), 0::numeric) END)::bigint
            END as profit_amt
        FROM months m
        LEFT JOIN web_sales_summary ws ON ws.report_month = m.month_date
        LEFT JOIN products p ON ws.product_id = p.id
        GROUP BY m.month_date
    ),
    ad_data AS (
        SELECT
            m.month_date,
            CASE target_site
                WHEN 'amazon' THEN COALESCE(SUM(ac.amazon_cost), 0)
                WHEN 'rakuten' THEN COALESCE(SUM(ac.rakuten_cost), 0) / GREATEST(COUNT(DISTINCT ac.series_code), 1)
                WHEN 'yahoo' THEN COALESCE(SUM(ac.yahoo_cost), 0) / GREATEST(COUNT(DISTINCT ac.series_code), 1)
                ELSE 0
            END as site_ad_cost
        FROM months m
        LEFT JOIN advertising_costs ac ON ac.report_month = m.month_date
        GROUP BY m.month_date
    )
    SELECT
        to_char(sd.month_date, 'YY/MM'),
        sd.sales_amount::bigint,
        sd.profit_amt::bigint,
        COALESCE(ad.site_ad_cost, 0)::bigint,
        (sd.profit_amt - COALESCE(ad.site_ad_cost, 0))::bigint
    FROM site_data sd
    JOIN ad_data ad ON sd.month_date = ad.month_date
    ORDER BY sd.month_date;
END;
$function$
;

-- get_total_trend_data(target_month text)
CREATE OR REPLACE FUNCTION public.get_total_trend_data(target_month text)
 RETURNS TABLE(month_label text, sales bigint, profit_amount bigint, ad_cost bigint, final_profit bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH months AS (
        SELECT generate_series(
            (target_month || '-01')::date - interval '5 months',
            (target_month || '-01')::date,
            interval '1 month'
        )::date as month_date
    )
    SELECT
        to_char(m.month_date, 'YY/MM'),
        (CASE WHEN COUNT(*) FILTER (WHERE (public.web_sales_reported_total_amount(ws)) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(public.web_sales_reported_total_amount(ws)), 0::numeric) END)::bigint::bigint,
        (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_total_profit(ws))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_total_profit(ws))), 0::numeric) END)::bigint::bigint,
        COALESCE(
            (SELECT SUM(ac.amazon_cost + ac.google_cost + ac.meta_cost + ac.other_cost + ac.rakuten_cost + ac.yahoo_cost)
             FROM advertising_costs ac
             WHERE ac.report_month = m.month_date), 0
        )::bigint,
        (CASE WHEN COUNT(*) FILTER (WHERE (TRUNC(public.web_sales_reported_total_profit(ws))) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(TRUNC(public.web_sales_reported_total_profit(ws))), 0::numeric) END)::bigint::bigint -
        COALESCE(
            (SELECT SUM(ac.amazon_cost + ac.google_cost + ac.meta_cost + ac.other_cost + ac.rakuten_cost + ac.yahoo_cost)
             FROM advertising_costs ac
             WHERE ac.report_month = m.month_date), 0
        )::bigint
    FROM months m
    LEFT JOIN web_sales_summary ws ON ws.report_month = m.month_date
    LEFT JOIN products p ON ws.product_id = p.id
    GROUP BY m.month_date
    ORDER BY m.month_date;
END;
$function$
;

-- get_web_sales_monthly(start_date text, end_date text)
CREATE OR REPLACE FUNCTION public.get_web_sales_monthly(start_date text, end_date text)
 RETURNS TABLE(month text, amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
      BEGIN
        RETURN QUERY
        SELECT
          to_char(s.report_month, 'YYYY-MM-01')::text as month,
          (CASE WHEN COUNT(*) FILTER (WHERE (
            public.web_sales_reported_total_amount(s)
          ) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(
            public.web_sales_reported_total_amount(s)
          ), 0::numeric) END)::numeric::numeric as amount
        FROM web_sales_summary s
        JOIN products p ON s.product_id = p.id
        WHERE s.report_month >= CAST(start_date AS DATE) AND s.report_month < CAST(end_date AS DATE)
        GROUP BY month;
      END;
      $function$
;
