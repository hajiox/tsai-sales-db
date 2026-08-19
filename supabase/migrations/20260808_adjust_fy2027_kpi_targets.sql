-- Rebalance FY2027 targets: both store channels grow about 5%, while WEB and
-- wholesale/OEM retain the main growth role at a more moderate level.

WITH monthly AS (
  SELECT *
  FROM (VALUES
    (DATE '2026-08-01', 12900000::numeric, 6400000::numeric, 2300000::numeric, 5000000::numeric, 19::numeric, 37000::numeric),
    (DATE '2026-09-01', 10900000::numeric, 6900000::numeric, 1600000::numeric, 4200000::numeric, 19::numeric, 41000::numeric),
    (DATE '2026-10-01', 14500000::numeric, 6400000::numeric, 1800000::numeric, 4400000::numeric, 19::numeric, 57000::numeric),
    (DATE '2026-11-01', 19500000::numeric, 6900000::numeric, 2900000::numeric, 4400000::numeric, 19::numeric, 75000::numeric),
    (DATE '2026-12-01', 18100000::numeric, 7600000::numeric, 1000000::numeric, 3400000::numeric, 19::numeric, 53000::numeric),
    (DATE '2027-01-01',  9700000::numeric, 3100000::numeric,  800000::numeric, 3000000::numeric, 19::numeric, 47000::numeric),
    (DATE '2027-02-01', 13200000::numeric, 3600000::numeric, 1100000::numeric, 2900000::numeric, 19::numeric, 40000::numeric),
    (DATE '2027-03-01', 15100000::numeric, 3300000::numeric, 1500000::numeric, 3900000::numeric, 19::numeric, 56000::numeric),
    (DATE '2027-04-01', 13300000::numeric, 6500000::numeric, 1500000::numeric, 4300000::numeric, 19::numeric, 51000::numeric),
    (DATE '2027-05-01', 14300000::numeric, 4200000::numeric, 2100000::numeric, 4600000::numeric, 19::numeric, 62000::numeric),
    (DATE '2027-06-01', 15200000::numeric, 4000000::numeric, 1500000::numeric, 4000000::numeric, 19::numeric, 50000::numeric),
    (DATE '2027-07-01', 17300000::numeric, 6100000::numeric, 1600000::numeric, 3400000::numeric, 19::numeric, 61000::numeric)
  ) AS values_by_month(month, web, wholesale_oem, store, shoku, acquisition, manufacturing)
), targets AS (
  SELECT 'target'::text AS metric, 'WEB'::text AS channel_code, month, web AS amount FROM monthly
  UNION ALL SELECT 'target', 'WHOLESALE', month, wholesale_oem FROM monthly
  UNION ALL SELECT 'target', 'STORE', month, store FROM monthly
  UNION ALL SELECT 'target', 'SHOKU', month, shoku FROM monthly
  UNION ALL SELECT 'acquisition_target', 'SALES_TEAM', month, acquisition FROM monthly
  UNION ALL SELECT 'manufacturing_target', 'FACTORY', month, manufacturing FROM monthly
  UNION ALL SELECT 'annual_detail_target', 'WHOLESALE_CORE', DATE '2026-08-01', 45000000::numeric
  UNION ALL SELECT 'annual_detail_target', 'OEM', DATE '2026-08-01', 20000000::numeric
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
