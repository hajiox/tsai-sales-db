BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.wholesale_partner_inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL UNIQUE
    CHECK (fiscal_year BETWEEN 2000 AND 2100),
  inventory_date date NOT NULL,
  source_month date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed')),
  source_sale_row_count integer NOT NULL DEFAULT 0,
  source_product_count integer NOT NULL DEFAULT 0,
  source_total_quantity numeric(16, 6) NOT NULL DEFAULT 0,
  source_total_amount numeric(16, 2) NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wholesale_partner_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL
    REFERENCES public.wholesale_partner_inventory_counts(id) ON DELETE CASCADE,
  product_id uuid
    REFERENCES public.wholesale_products(id) ON DELETE SET NULL,
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL,
  sold_quantity numeric(16, 6) NOT NULL,
  sales_amount numeric(16, 2) NOT NULL,
  average_selling_price numeric(16, 6) NOT NULL,
  inventory_quantity numeric(16, 6) NOT NULL,
  cost_rate numeric(7, 6) NOT NULL DEFAULT 0.7,
  cost_unit numeric(16, 6) NOT NULL,
  inventory_value numeric(16, 2) NOT NULL,
  note text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, product_id),
  CHECK (sold_quantity >= 0),
  CHECK (sales_amount >= 0),
  CHECK (average_selling_price >= 0),
  CHECK (inventory_quantity >= 0),
  CHECK (cost_rate >= 0 AND cost_rate <= 1),
  CHECK (cost_unit >= 0),
  CHECK (inventory_value >= 0)
);

CREATE INDEX IF NOT EXISTS wholesale_partner_inventory_counts_year_idx
  ON public.wholesale_partner_inventory_counts(fiscal_year DESC);

CREATE INDEX IF NOT EXISTS wholesale_partner_inventory_items_inventory_idx
  ON public.wholesale_partner_inventory_items(inventory_id, sort_order, product_name);

ALTER TABLE public.wholesale_partner_inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_partner_inventory_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wholesale_partner_inventory_counts FROM anon, authenticated;
REVOKE ALL ON TABLE public.wholesale_partner_inventory_items FROM anon, authenticated;
GRANT ALL ON TABLE public.wholesale_partner_inventory_counts TO service_role;
GRANT ALL ON TABLE public.wholesale_partner_inventory_items TO service_role;

CREATE OR REPLACE FUNCTION public.set_wholesale_partner_inventory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wholesale_partner_inventory_counts_updated_at
  ON public.wholesale_partner_inventory_counts;
CREATE TRIGGER trg_wholesale_partner_inventory_counts_updated_at
BEFORE UPDATE ON public.wholesale_partner_inventory_counts
FOR EACH ROW
EXECUTE FUNCTION public.set_wholesale_partner_inventory_updated_at();

DROP TRIGGER IF EXISTS trg_wholesale_partner_inventory_items_updated_at
  ON public.wholesale_partner_inventory_items;
CREATE TRIGGER trg_wholesale_partner_inventory_items_updated_at
BEFORE UPDATE ON public.wholesale_partner_inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.set_wholesale_partner_inventory_updated_at();

CREATE OR REPLACE FUNCTION public.replace_wholesale_partner_inventory(
  p_fiscal_year integer,
  p_inventory_date date,
  p_source_month date,
  p_source_sale_row_count integer,
  p_source_product_count integer,
  p_source_total_quantity numeric,
  p_source_total_amount numeric,
  p_created_by text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_inventory_id uuid;
BEGIN
  IF p_fiscal_year < 2000 OR p_fiscal_year > 2100 THEN
    RAISE EXCEPTION 'Invalid fiscal year';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items must be an array';
  END IF;

  INSERT INTO public.wholesale_partner_inventory_counts (
    fiscal_year,
    inventory_date,
    source_month,
    source_sale_row_count,
    source_product_count,
    source_total_quantity,
    source_total_amount,
    generated_at,
    created_by
  )
  VALUES (
    p_fiscal_year,
    p_inventory_date,
    p_source_month,
    p_source_sale_row_count,
    p_source_product_count,
    p_source_total_quantity,
    p_source_total_amount,
    now(),
    COALESCE(p_created_by, '')
  )
  ON CONFLICT (fiscal_year)
  DO UPDATE SET
    inventory_date = EXCLUDED.inventory_date,
    source_month = EXCLUDED.source_month,
    source_sale_row_count = EXCLUDED.source_sale_row_count,
    source_product_count = EXCLUDED.source_product_count,
    source_total_quantity = EXCLUDED.source_total_quantity,
    source_total_amount = EXCLUDED.source_total_amount,
    generated_at = now()
  RETURNING id INTO target_inventory_id;

  DELETE FROM public.wholesale_partner_inventory_items AS existing
  WHERE existing.inventory_id = target_inventory_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS incoming
      WHERE (incoming->>'product_id')::uuid = existing.product_id
    );

  INSERT INTO public.wholesale_partner_inventory_items (
    inventory_id,
    product_id,
    product_code,
    product_name,
    sold_quantity,
    sales_amount,
    average_selling_price,
    inventory_quantity,
    cost_rate,
    cost_unit,
    inventory_value,
    sort_order
  )
  SELECT
    target_inventory_id,
    (item->>'product_id')::uuid,
    COALESCE(item->>'product_code', ''),
    item->>'product_name',
    (item->>'sold_quantity')::numeric,
    (item->>'sales_amount')::numeric,
    (item->>'average_selling_price')::numeric,
    (item->>'inventory_quantity')::numeric,
    (item->>'cost_rate')::numeric,
    (item->>'cost_unit')::numeric,
    (item->>'inventory_value')::numeric,
    (item->>'sort_order')::integer
  FROM jsonb_array_elements(p_items) AS item
  ON CONFLICT (inventory_id, product_id)
  DO UPDATE SET
    product_code = EXCLUDED.product_code,
    product_name = EXCLUDED.product_name,
    sold_quantity = EXCLUDED.sold_quantity,
    sales_amount = EXCLUDED.sales_amount,
    average_selling_price = EXCLUDED.average_selling_price,
    inventory_quantity = EXCLUDED.inventory_quantity,
    cost_rate = EXCLUDED.cost_rate,
    cost_unit = EXCLUDED.cost_unit,
    inventory_value = EXCLUDED.inventory_value,
    sort_order = EXCLUDED.sort_order;

  RETURN target_inventory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_wholesale_partner_inventory(
  integer,
  date,
  date,
  integer,
  integer,
  numeric,
  numeric,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_wholesale_partner_inventory(
  integer,
  date,
  date,
  integer,
  integer,
  numeric,
  numeric,
  text,
  jsonb
) TO service_role;

COMMIT;
