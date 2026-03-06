-- ad_costs_monthly ビューを作成
-- get_monthly_financial_summary RPCが参照しているが、存在しないためサマリーが表示されない問題を修正
-- advertising_costs テーブルからビューを作成する

CREATE OR REPLACE VIEW ad_costs_monthly AS
SELECT
  series_code,
  report_month,
  COALESCE(google_cost, 0) + COALESCE(amazon_cost, 0) + COALESCE(rakuten_cost, 0) + COALESCE(yahoo_cost, 0) + COALESCE(other_cost, 0) AS total_ad_cost,
  COALESCE(google_cost, 0) AS google_cost,
  COALESCE(amazon_cost, 0) AS amazon_cost,
  COALESCE(rakuten_cost, 0) AS rakuten_cost,
  COALESCE(yahoo_cost, 0) AS yahoo_cost,
  COALESCE(other_cost, 0) AS other_cost
FROM advertising_costs;
