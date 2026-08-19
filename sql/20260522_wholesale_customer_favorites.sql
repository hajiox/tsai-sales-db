-- TSA WEB納品書: 発行先お気に入り

ALTER TABLE public.wholesale_customers
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS favorite_order integer;

CREATE INDEX IF NOT EXISTS idx_wholesale_customers_favorite
  ON public.wholesale_customers(is_favorite, favorite_order, customer_name);

WITH next_code AS (
  SELECT 'WH' || LPAD(
    (
      COALESCE(MAX(SUBSTRING(customer_code FROM '^WH([0-9]+)$')::integer), 0) + 1
    )::text,
    4,
    '0'
  ) AS customer_code
  FROM public.wholesale_customers
  WHERE customer_code ~ '^WH[0-9]+$'
)
INSERT INTO public.wholesale_customers (
  customer_code,
  customer_name,
  customer_type,
  is_active,
  normalized_name,
  is_favorite,
  favorite_order
)
SELECT
  next_code.customer_code,
  '道の駅いなわしろ',
  '通常卸',
  true,
  '道の駅いなわしろ',
  true,
  1
FROM next_code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.wholesale_customers
  WHERE customer_name ILIKE '%猪苗代%'
     OR customer_name ILIKE '%いなわしろ%'
     OR normalized_name ILIKE '%猪苗代%'
     OR normalized_name ILIKE '%いなわしろ%'
);

UPDATE public.wholesale_customers
SET
  is_favorite = true,
  favorite_order = 1
WHERE customer_name ILIKE '%猪苗代%'
   OR customer_name ILIKE '%いなわしろ%'
   OR normalized_name ILIKE '%猪苗代%'
   OR normalized_name ILIKE '%いなわしろ%';
