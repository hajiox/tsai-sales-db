-- FY2027 (2026-08 to 2027-07) targets.
-- FY2026 actual: JPY 274,787,016. FY2027 target: JPY 310,000,000 (+12.8%).
-- Monthly sales and manufacturing targets follow FY2026 seasonality and are rounded.

WITH monthly AS (
  SELECT *
  FROM (VALUES
    (DATE '2026-08-01', 13100000::numeric, 6900000::numeric, 2300000::numeric, 4800000::numeric, 20::numeric, 38000::numeric),
    (DATE '2026-09-01', 11000000::numeric, 7300000::numeric, 1600000::numeric, 3900000::numeric, 20::numeric, 41000::numeric),
    (DATE '2026-10-01', 14700000::numeric, 6800000::numeric, 1800000::numeric, 4200000::numeric, 20::numeric, 58000::numeric),
    (DATE '2026-11-01', 19700000::numeric, 7300000::numeric, 2900000::numeric, 4200000::numeric, 20::numeric, 76000::numeric),
    (DATE '2026-12-01', 18300000::numeric, 8000000::numeric, 1000000::numeric, 3300000::numeric, 20::numeric, 54000::numeric),
    (DATE '2027-01-01',  9800000::numeric, 3200000::numeric,  800000::numeric, 2900000::numeric, 20::numeric, 48000::numeric),
    (DATE '2027-02-01', 13300000::numeric, 3800000::numeric, 1200000::numeric, 2700000::numeric, 20::numeric, 40000::numeric),
    (DATE '2027-03-01', 15300000::numeric, 3600000::numeric, 1500000::numeric, 3600000::numeric, 20::numeric, 57000::numeric),
    (DATE '2027-04-01', 13500000::numeric, 6900000::numeric, 1600000::numeric, 4000000::numeric, 20::numeric, 52000::numeric),
    (DATE '2027-05-01', 14400000::numeric, 4400000::numeric, 2200000::numeric, 4400000::numeric, 20::numeric, 63000::numeric),
    (DATE '2027-06-01', 15400000::numeric, 4300000::numeric, 1500000::numeric, 3800000::numeric, 20::numeric, 51000::numeric),
    (DATE '2027-07-01', 17500000::numeric, 6500000::numeric, 1600000::numeric, 3200000::numeric, 20::numeric, 62000::numeric)
  ) AS values_by_month(month, web, wholesale_oem, store, shoku, acquisition, manufacturing)
), targets AS (
  SELECT 'target'::text AS metric, 'WEB'::text AS channel_code, month, web AS amount FROM monthly
  UNION ALL SELECT 'target', 'WHOLESALE', month, wholesale_oem FROM monthly
  UNION ALL SELECT 'target', 'STORE', month, store FROM monthly
  UNION ALL SELECT 'target', 'SHOKU', month, shoku FROM monthly
  UNION ALL SELECT 'acquisition_target', 'SALES_TEAM', month, acquisition FROM monthly
  UNION ALL SELECT 'manufacturing_target', 'FACTORY', month, manufacturing FROM monthly
  UNION ALL SELECT 'annual_detail_target', 'WHOLESALE_CORE', DATE '2026-08-01', 48000000::numeric
  UNION ALL SELECT 'annual_detail_target', 'OEM', DATE '2026-08-01', 21000000::numeric
)
INSERT INTO public.kpi_manual_entries_v1 (
  metric,
  channel_code,
  month,
  amount,
  updated_at
)
SELECT metric, channel_code, month, amount, now()
FROM targets
ON CONFLICT (metric, channel_code, month)
DO UPDATE SET
  amount = EXCLUDED.amount,
  updated_at = now();
