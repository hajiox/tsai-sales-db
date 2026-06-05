CREATE OR REPLACE VIEW ad_costs_monthly AS
SELECT
  series_code,
  report_month,
  COALESCE(google_cost, 0)
    + COALESCE(meta_cost, 0)
    + COALESCE(amazon_cost, 0)
    + COALESCE(rakuten_cost, 0)
    + COALESCE(yahoo_cost, 0)
    + COALESCE(other_cost, 0) AS total_ad_cost,
  COALESCE(google_cost, 0) AS google_cost,
  COALESCE(meta_cost, 0) AS meta_cost,
  COALESCE(amazon_cost, 0) AS amazon_cost,
  COALESCE(rakuten_cost, 0) AS rakuten_cost,
  COALESCE(yahoo_cost, 0) AS yahoo_cost,
  COALESCE(other_cost, 0) AS other_cost
FROM advertising_costs;

CREATE OR REPLACE FUNCTION public.get_monthly_financial_summary(target_month text)
RETURNS TABLE(
  total_count integer,
  total_amount bigint,
  total_profit bigint,
  total_ad_cost bigint,
  total_final_profit bigint,
  amazon_count integer,
  amazon_amount bigint,
  amazon_profit bigint,
  amazon_ad_cost bigint,
  amazon_final_profit bigint,
  rakuten_count integer,
  rakuten_amount bigint,
  rakuten_profit bigint,
  rakuten_ad_cost bigint,
  rakuten_final_profit bigint,
  yahoo_count integer,
  yahoo_amount bigint,
  yahoo_profit bigint,
  yahoo_ad_cost bigint,
  yahoo_final_profit bigint,
  mercari_count integer,
  mercari_amount bigint,
  mercari_profit bigint,
  mercari_ad_cost bigint,
  mercari_final_profit bigint,
  base_count integer,
  base_amount bigint,
  base_profit bigint,
  base_ad_cost bigint,
  base_final_profit bigint,
  qoo10_count integer,
  qoo10_amount bigint,
  qoo10_profit bigint,
  qoo10_ad_cost bigint,
  qoo10_final_profit bigint,
  tiktok_count integer,
  tiktok_amount bigint,
  tiktok_profit bigint,
  tiktok_ad_cost bigint,
  tiktok_final_profit bigint
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH sales_data AS (
    SELECT
      SUM(
        COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) +
        COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) +
        COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) +
        COALESCE(ws.tiktok_count, 0)
      )::integer AS total_cnt,
      SUM((
        COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) +
        COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) +
        COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) +
        COALESCE(ws.tiktok_count, 0)
      ) * COALESCE(p.price, 0)) AS total_amt,
      SUM(TRUNC((
        COALESCE(ws.amazon_count, 0) + COALESCE(ws.rakuten_count, 0) +
        COALESCE(ws.yahoo_count, 0) + COALESCE(ws.mercari_count, 0) +
        COALESCE(ws.base_count, 0) + COALESCE(ws.qoo10_count, 0) +
        COALESCE(ws.tiktok_count, 0)
      ) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS total_prf,
      SUM(COALESCE(ws.amazon_count, 0))::integer AS amazon_cnt,
      SUM(COALESCE(ws.amazon_count, 0) * COALESCE(p.price, 0)) AS amazon_amt,
      SUM(TRUNC(COALESCE(ws.amazon_count, 0) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS amazon_prf,
      SUM(COALESCE(ws.rakuten_count, 0))::integer AS rakuten_cnt,
      SUM(COALESCE(ws.rakuten_count, 0) * COALESCE(p.price, 0)) AS rakuten_amt,
      SUM(TRUNC(COALESCE(ws.rakuten_count, 0) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS rakuten_prf,
      SUM(COALESCE(ws.yahoo_count, 0))::integer AS yahoo_cnt,
      SUM(COALESCE(ws.yahoo_count, 0) * COALESCE(p.price, 0)) AS yahoo_amt,
      SUM(TRUNC(COALESCE(ws.yahoo_count, 0) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS yahoo_prf,
      SUM(COALESCE(ws.mercari_count, 0))::integer AS mercari_cnt,
      SUM(COALESCE(ws.mercari_count, 0) * COALESCE(p.price, 0)) AS mercari_amt,
      SUM(TRUNC(COALESCE(ws.mercari_count, 0) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS mercari_prf,
      SUM(COALESCE(ws.base_count, 0))::integer AS base_cnt,
      SUM(COALESCE(ws.base_count, 0) * COALESCE(p.price, 0)) AS base_amt,
      SUM(TRUNC(COALESCE(ws.base_count, 0) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS base_prf,
      SUM(COALESCE(ws.qoo10_count, 0))::integer AS qoo10_cnt,
      SUM(COALESCE(ws.qoo10_count, 0) * COALESCE(p.price, 0)) AS qoo10_amt,
      SUM(TRUNC(COALESCE(ws.qoo10_count, 0) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS qoo10_prf,
      SUM(COALESCE(ws.tiktok_count, 0))::integer AS tiktok_cnt,
      SUM(COALESCE(ws.tiktok_count, 0) * COALESCE(p.price, 0)) AS tiktok_amt,
      SUM(TRUNC(COALESCE(ws.tiktok_count, 0) * COALESCE(p.price, 0) * (COALESCE(p.profit_rate, 0) / 100.0)))::bigint AS tiktok_prf
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
    COALESCE(sd.total_amt, 0)::bigint,
    COALESCE(sd.total_prf, 0)::bigint,
    ac.total_cost,
    COALESCE(sd.total_prf, 0)::bigint - ac.total_cost,
    COALESCE(sd.amazon_cnt, 0),
    COALESCE(sd.amazon_amt, 0)::bigint,
    COALESCE(sd.amazon_prf, 0)::bigint,
    ac.amazon_cost_val,
    COALESCE(sd.amazon_prf, 0)::bigint - ac.amazon_cost_val,
    COALESCE(sd.rakuten_cnt, 0),
    COALESCE(sd.rakuten_amt, 0)::bigint,
    COALESCE(sd.rakuten_prf, 0)::bigint,
    ac.rakuten_cost_val,
    COALESCE(sd.rakuten_prf, 0)::bigint - ac.rakuten_cost_val,
    COALESCE(sd.yahoo_cnt, 0),
    COALESCE(sd.yahoo_amt, 0)::bigint,
    COALESCE(sd.yahoo_prf, 0)::bigint,
    ac.yahoo_cost_val,
    COALESCE(sd.yahoo_prf, 0)::bigint - ac.yahoo_cost_val,
    COALESCE(sd.mercari_cnt, 0),
    COALESCE(sd.mercari_amt, 0)::bigint,
    COALESCE(sd.mercari_prf, 0)::bigint,
    0::bigint,
    COALESCE(sd.mercari_prf, 0)::bigint,
    COALESCE(sd.base_cnt, 0),
    COALESCE(sd.base_amt, 0)::bigint,
    COALESCE(sd.base_prf, 0)::bigint,
    0::bigint,
    COALESCE(sd.base_prf, 0)::bigint,
    COALESCE(sd.qoo10_cnt, 0),
    COALESCE(sd.qoo10_amt, 0)::bigint,
    COALESCE(sd.qoo10_prf, 0)::bigint,
    0::bigint,
    COALESCE(sd.qoo10_prf, 0)::bigint,
    COALESCE(sd.tiktok_cnt, 0),
    COALESCE(sd.tiktok_amt, 0)::bigint,
    COALESCE(sd.tiktok_prf, 0)::bigint,
    0::bigint,
    COALESCE(sd.tiktok_prf, 0)::bigint
  FROM sales_data sd, ad_costs ac;
END;
$function$;
