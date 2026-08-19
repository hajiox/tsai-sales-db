CREATE TABLE IF NOT EXISTS public.brand_store_product_master_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL DEFAULT '',
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  inserted_count integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  price_changed_count integer NOT NULL DEFAULT 0 CHECK (price_changed_count >= 0),
  synced_inventory_id uuid REFERENCES public.brand_store_inventory_counts(id) ON DELETE SET NULL,
  synced_item_count integer NOT NULL DEFAULT 0 CHECK (synced_item_count >= 0),
  imported_by text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_brand_store_product_master_imports_imported_at
  ON public.brand_store_product_master_imports (imported_at DESC);

ALTER TABLE public.brand_store_product_master_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.brand_store_product_master_imports FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.brand_store_product_master_imports TO service_role;

ALTER TABLE IF EXISTS public.brand_store_inventory_wholesale_tax_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.brand_store_inventory_wholesale_tax_backup FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.brand_store_inventory_wholesale_tax_backup TO service_role;

ALTER TABLE public.product_master_history
  ADD COLUMN IF NOT EXISTS old_price integer,
  ADD COLUMN IF NOT EXISTS new_price integer,
  ADD COLUMN IF NOT EXISTS old_tax_rate smallint,
  ADD COLUMN IF NOT EXISTS new_tax_rate smallint,
  ADD COLUMN IF NOT EXISTS old_barcode text,
  ADD COLUMN IF NOT EXISTS new_barcode text,
  ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES public.brand_store_product_master_imports(id) ON DELETE SET NULL;

INSERT INTO public.brand_store_product_master_imports (
  imported_at,
  file_name,
  row_count,
  imported_by
)
SELECT
  dominant.last_updated_at,
  '既存商品マスター（履歴移行）',
  dominant.row_count,
  'system'
FROM (
  SELECT
    max(updated_at) AS last_updated_at,
    count(*)::integer AS row_count
  FROM public.product_master
  WHERE updated_at IS NOT NULL
  GROUP BY date_trunc('day', updated_at)
  ORDER BY count(*) DESC, max(updated_at) DESC
  LIMIT 1
) AS dominant
WHERE dominant.last_updated_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.brand_store_product_master_imports
  );
