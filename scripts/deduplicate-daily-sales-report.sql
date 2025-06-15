-- Remove duplicates and enforce unique date on daily_sales_report

-- 1) Check for duplicate dates
SELECT
  date,
  COUNT(*) AS cnt
FROM daily_sales_report
GROUP BY date
HAVING COUNT(*) > 1;

-- 2) Delete duplicate records, keeping the first entry per date
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (PARTITION BY date ORDER BY date) AS rn
  FROM daily_sales_report
)
DELETE FROM daily_sales_report
WHERE ctid IN (
  SELECT ctid FROM ranked WHERE rn > 1
);

-- 3) Add unique constraint on date
ALTER TABLE daily_sales_report
ADD CONSTRAINT unique_date UNIQUE (date);
