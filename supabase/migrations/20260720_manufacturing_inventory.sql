BEGIN;

CREATE TABLE IF NOT EXISTS public.manufacturing_inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manufacturing_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.manufacturing_inventory_counts(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('ingredient', 'material')),
  source_id uuid,
  item_name text NOT NULL,
  source_unit_text text,
  base_unit_quantity numeric,
  unit_quantity numeric,
  base_tax_included_cost numeric,
  tax_included_cost numeric,
  stock_count numeric,
  note text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_manual boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manufacturing_inventory_base_unit_quantity_check CHECK (base_unit_quantity IS NULL OR base_unit_quantity > 0),
  CONSTRAINT manufacturing_inventory_unit_quantity_check CHECK (unit_quantity IS NULL OR unit_quantity > 0),
  CONSTRAINT manufacturing_inventory_base_cost_check CHECK (base_tax_included_cost IS NULL OR base_tax_included_cost >= 0),
  CONSTRAINT manufacturing_inventory_cost_check CHECK (tax_included_cost IS NULL OR tax_included_cost >= 0),
  CONSTRAINT manufacturing_inventory_stock_count_check CHECK (stock_count IS NULL OR stock_count >= 0)
);

CREATE INDEX IF NOT EXISTS manufacturing_inventory_counts_date_idx
  ON public.manufacturing_inventory_counts(inventory_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS manufacturing_inventory_items_inventory_idx
  ON public.manufacturing_inventory_items(inventory_id, item_type, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS manufacturing_inventory_items_source_unique_idx
  ON public.manufacturing_inventory_items(inventory_id, item_type, source_id)
  WHERE source_id IS NOT NULL;

ALTER TABLE public.manufacturing_inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_inventory_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.manufacturing_inventory_counts FROM anon, authenticated;
REVOKE ALL ON TABLE public.manufacturing_inventory_items FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_manufacturing_inventory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_manufacturing_inventory_counts_updated_at ON public.manufacturing_inventory_counts;
CREATE TRIGGER update_manufacturing_inventory_counts_updated_at
  BEFORE UPDATE ON public.manufacturing_inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_manufacturing_inventory_updated_at();

DROP TRIGGER IF EXISTS update_manufacturing_inventory_items_updated_at ON public.manufacturing_inventory_items;
CREATE TRIGGER update_manufacturing_inventory_items_updated_at
  BEFORE UPDATE ON public.manufacturing_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_manufacturing_inventory_updated_at();

COMMIT;
