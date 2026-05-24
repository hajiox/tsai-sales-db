-- DocScanner物販納品書 -> TSA卸販売管理 連携

ALTER TABLE public.wholesale_customers
  ADD COLUMN IF NOT EXISTS doc_scanner_counterparty_id text,
  ADD COLUMN IF NOT EXISTS normalized_name text;

CREATE UNIQUE INDEX IF NOT EXISTS wholesale_customers_doc_scanner_counterparty_id_key
  ON public.wholesale_customers(doc_scanner_counterparty_id)
  WHERE doc_scanner_counterparty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wholesale_customers_normalized_name
  ON public.wholesale_customers(normalized_name);

ALTER TABLE public.wholesale_sales
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_wholesale_sales_source_type
  ON public.wholesale_sales(source_type);

CREATE TABLE IF NOT EXISTS public.wholesale_delivery_note_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_delivery_note_id text NOT NULL,
  external_line_id text NOT NULL,
  delivery_note_number text,
  delivery_date date NOT NULL,
  doc_scanner_counterparty_id text,
  counterparty_name text,
  wholesale_customer_id uuid NOT NULL REFERENCES public.wholesale_customers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.wholesale_products(id) ON DELETE RESTRICT,
  source_recipe_id uuid,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  unit_price integer NOT NULL DEFAULT 0,
  amount integer NOT NULL DEFAULT 0,
  transaction_type text,
  rate numeric,
  source_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (external_delivery_note_id, external_line_id)
);

CREATE INDEX IF NOT EXISTS idx_wholesale_delivery_note_sales_note
  ON public.wholesale_delivery_note_sales(external_delivery_note_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_delivery_note_sales_aggregate
  ON public.wholesale_delivery_note_sales(product_id, wholesale_customer_id, delivery_date);

CREATE INDEX IF NOT EXISTS idx_wholesale_delivery_note_sales_customer
  ON public.wholesale_delivery_note_sales(wholesale_customer_id, delivery_date);
