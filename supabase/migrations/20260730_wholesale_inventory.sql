BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.wholesale_sukeneko_master_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  set_item_count integer NOT NULL DEFAULT 0,
  imported_by text NOT NULL DEFAULT '',
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wholesale_sukeneko_product_master (
  source_code text PRIMARY KEY,
  product_name text NOT NULL,
  source_price numeric(12, 2),
  is_set boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_price IS NULL OR source_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.wholesale_inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL UNIQUE
    CHECK (fiscal_year BETWEEN 2000 AND 2100),
  inventory_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed')),
  source_file_name text,
  source_row_count integer NOT NULL DEFAULT 0,
  matched_row_count integer NOT NULL DEFAULT 0,
  consolidated_item_count integer NOT NULL DEFAULT 0,
  set_row_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  master_import_id uuid
    REFERENCES public.wholesale_sukeneko_master_imports(id) ON DELETE SET NULL,
  imported_at timestamptz,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wholesale_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL
    REFERENCES public.wholesale_inventory_counts(id) ON DELETE CASCADE,
  source_key text,
  source_recipe_id uuid
    REFERENCES public.recipes(id) ON DELETE SET NULL,
  source_web_product_id uuid
    REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  retail_price_excl_tax numeric(12, 2),
  wholesale_price numeric(12, 2),
  tax_rate smallint NOT NULL DEFAULT 8
    CHECK (tax_rate IN (8, 10)),
  quantity numeric(14, 3),
  price_source text NOT NULL DEFAULT '',
  calculation_method text NOT NULL DEFAULT 'direct'
    CHECK (calculation_method IN (
      'direct',
      'shared_stock',
      'bundle_derived',
      'listing_deduplicated',
      'unmatched',
      'manual'
    )),
  review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('confirmed', 'needs_review', 'excluded')),
  review_reason text NOT NULL DEFAULT '',
  source_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  is_manual boolean NOT NULL DEFAULT false,
  price_is_manual boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (retail_price_excl_tax IS NULL OR retail_price_excl_tax >= 0),
  CHECK (wholesale_price IS NULL OR wholesale_price >= 0),
  CHECK (quantity IS NULL OR quantity >= 0),
  CHECK (jsonb_typeof(source_rows) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS wholesale_inventory_items_source_unique_idx
  ON public.wholesale_inventory_items(inventory_id, source_key);

CREATE INDEX IF NOT EXISTS wholesale_inventory_counts_year_idx
  ON public.wholesale_inventory_counts(fiscal_year DESC, inventory_date DESC);

CREATE INDEX IF NOT EXISTS wholesale_inventory_items_inventory_idx
  ON public.wholesale_inventory_items(
    inventory_id,
    review_status,
    sort_order,
    product_name
  );

CREATE INDEX IF NOT EXISTS wholesale_sukeneko_master_imports_date_idx
  ON public.wholesale_sukeneko_master_imports(imported_at DESC);

CREATE INDEX IF NOT EXISTS wholesale_sukeneko_product_master_set_idx
  ON public.wholesale_sukeneko_product_master(is_set, source_code);

ALTER TABLE public.wholesale_sukeneko_master_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_sukeneko_product_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_inventory_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wholesale_sukeneko_master_imports FROM anon, authenticated;
REVOKE ALL ON TABLE public.wholesale_sukeneko_product_master FROM anon, authenticated;
REVOKE ALL ON TABLE public.wholesale_inventory_counts FROM anon, authenticated;
REVOKE ALL ON TABLE public.wholesale_inventory_items FROM anon, authenticated;
GRANT ALL ON TABLE public.wholesale_sukeneko_master_imports TO service_role;
GRANT ALL ON TABLE public.wholesale_sukeneko_product_master TO service_role;
GRANT ALL ON TABLE public.wholesale_inventory_counts TO service_role;
GRANT ALL ON TABLE public.wholesale_inventory_items TO service_role;

CREATE OR REPLACE FUNCTION public.set_wholesale_inventory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wholesale_inventory_counts_updated_at
  ON public.wholesale_inventory_counts;
CREATE TRIGGER trg_wholesale_inventory_counts_updated_at
BEFORE UPDATE ON public.wholesale_inventory_counts
FOR EACH ROW
EXECUTE FUNCTION public.set_wholesale_inventory_updated_at();

DROP TRIGGER IF EXISTS trg_wholesale_inventory_items_updated_at
  ON public.wholesale_inventory_items;
CREATE TRIGGER trg_wholesale_inventory_items_updated_at
BEFORE UPDATE ON public.wholesale_inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.set_wholesale_inventory_updated_at();

DROP TRIGGER IF EXISTS trg_wholesale_sukeneko_product_master_updated_at
  ON public.wholesale_sukeneko_product_master;
CREATE TRIGGER trg_wholesale_sukeneko_product_master_updated_at
BEFORE UPDATE ON public.wholesale_sukeneko_product_master
FOR EACH ROW
EXECUTE FUNCTION public.set_wholesale_inventory_updated_at();

COMMIT;
