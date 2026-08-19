BEGIN;

ALTER TABLE public.manufacturing_inventory_items
  ADD COLUMN IF NOT EXISTS source_unit_quantity numeric,
  ADD COLUMN IF NOT EXISTS source_tax_included_cost numeric;

UPDATE public.manufacturing_inventory_items
SET
  source_unit_quantity = COALESCE(source_unit_quantity, base_unit_quantity),
  source_tax_included_cost = COALESCE(source_tax_included_cost, base_tax_included_cost)
WHERE source_id IS NOT NULL;

ALTER TABLE public.manufacturing_inventory_items
  DROP CONSTRAINT IF EXISTS manufacturing_inventory_source_unit_quantity_check,
  ADD CONSTRAINT manufacturing_inventory_source_unit_quantity_check
    CHECK (source_unit_quantity IS NULL OR source_unit_quantity > 0),
  DROP CONSTRAINT IF EXISTS manufacturing_inventory_source_cost_check,
  ADD CONSTRAINT manufacturing_inventory_source_cost_check
    CHECK (source_tax_included_cost IS NULL OR source_tax_included_cost >= 0);

COMMIT;

