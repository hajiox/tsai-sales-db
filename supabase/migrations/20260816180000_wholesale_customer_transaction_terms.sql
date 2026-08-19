-- TSAスマホ納品書でDocScanner取引先マスターの取引条件を使用する。
ALTER TABLE public.wholesale_customers
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS default_rate numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wholesale_customers_transaction_type_check'
  ) THEN
    ALTER TABLE public.wholesale_customers
      ADD CONSTRAINT wholesale_customers_transaction_type_check
      CHECK (transaction_type IS NULL OR transaction_type IN ('purchase', 'consignment'));
  END IF;
END
$$;

-- 既存値はDocScanner発行分の最新スナップショットから初期化する。
-- TSAスマホ発行分は、旧固定値を正本として再利用しない。
WITH latest_doc_scanner_terms AS (
  SELECT DISTINCT ON (wholesale_customer_id)
    wholesale_customer_id,
    transaction_type,
    rate
  FROM public.wholesale_delivery_note_sales
  WHERE external_delivery_note_id NOT LIKE 'tsa-web-%'
    AND transaction_type IN ('purchase', 'consignment')
  ORDER BY wholesale_customer_id, delivery_date DESC, created_at DESC
)
UPDATE public.wholesale_customers customers
SET
  transaction_type = terms.transaction_type,
  default_rate = COALESCE(
    NULLIF(terms.rate, 0),
    CASE WHEN terms.transaction_type = 'consignment' THEN 0.70 ELSE 0.65 END
  ),
  updated_at = now()
FROM latest_doc_scanner_terms terms
WHERE customers.id = terms.wholesale_customer_id
  AND customers.transaction_type IS NULL;
