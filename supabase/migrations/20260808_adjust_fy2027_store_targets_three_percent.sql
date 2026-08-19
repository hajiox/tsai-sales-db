-- Final FY2027 rebalance: set both physical-store channels to about 3% growth.
-- WEB and wholesale/OEM remain unchanged; manufacturing follows the lower total.

WITH monthly AS (
  SELECT *
  FROM (VALUES
    (DATE '2026-08-01', 2100000::numeric, 4700000::numeric, 36000::numeric),
    (DATE '2026-09-01', 1500000::numeric, 4000000::numeric, 40000::numeric),
    (DATE '2026-10-01', 1800000::numeric, 4400000::numeric, 56000::numeric),
    (DATE '2026-11-01', 2900000::numeric, 4400000::numeric, 74000::numeric),
    (DATE '2026-12-01',  900000::numeric, 3400000::numeric, 53000::numeric),
    (DATE '2027-01-01',  800000::numeric, 3000000::numeric, 47000::numeric),
    (DATE '2027-02-01', 1100000::numeric, 2800000::numeric, 39000::numeric),
    (DATE '2027-03-01', 1500000::numeric, 3800000::numeric, 56000::numeric),
    (DATE '2027-04-01', 1500000::numeric, 4200000::numeric, 51000::numeric),
    (DATE '2027-05-01', 2100000::numeric, 4600000::numeric, 62000::numeric),
    (DATE '2027-06-01', 1500000::numeric, 3900000::numeric, 50000::numeric),
    (DATE '2027-07-01', 1600000::numeric, 3400000::numeric, 61000::numeric)
  ) AS values_by_month(month, store, shoku, manufacturing)
), targets AS (
  SELECT 'target'::text AS metric, 'STORE'::text AS channel_code, month, store AS amount FROM monthly
  UNION ALL SELECT 'target', 'SHOKU', month, shoku FROM monthly
  UNION ALL SELECT 'manufacturing_target', 'FACTORY', month, manufacturing FROM monthly
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
