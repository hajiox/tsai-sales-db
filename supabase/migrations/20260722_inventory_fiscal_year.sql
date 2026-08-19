BEGIN;

ALTER TABLE public.brand_store_inventory_counts
  ADD COLUMN IF NOT EXISTS fiscal_year integer;

UPDATE public.brand_store_inventory_counts
SET fiscal_year = EXTRACT(YEAR FROM inventory_date)::integer
  + CASE WHEN EXTRACT(MONTH FROM inventory_date)::integer >= 8 THEN 1 ELSE 0 END
WHERE fiscal_year IS NULL;

ALTER TABLE public.brand_store_inventory_counts
  ALTER COLUMN fiscal_year SET NOT NULL,
  DROP CONSTRAINT IF EXISTS brand_store_inventory_counts_fiscal_year_check,
  ADD CONSTRAINT brand_store_inventory_counts_fiscal_year_check
    CHECK (fiscal_year BETWEEN 2000 AND 2100);

CREATE UNIQUE INDEX IF NOT EXISTS brand_store_inventory_counts_fiscal_year_unique_idx
  ON public.brand_store_inventory_counts(fiscal_year);

ALTER TABLE public.manufacturing_inventory_counts
  ADD COLUMN IF NOT EXISTS fiscal_year integer;

UPDATE public.manufacturing_inventory_counts
SET fiscal_year = EXTRACT(YEAR FROM inventory_date)::integer
  + CASE WHEN EXTRACT(MONTH FROM inventory_date)::integer >= 8 THEN 1 ELSE 0 END
WHERE fiscal_year IS NULL;

ALTER TABLE public.manufacturing_inventory_counts
  ALTER COLUMN fiscal_year SET NOT NULL,
  DROP CONSTRAINT IF EXISTS manufacturing_inventory_counts_fiscal_year_check,
  ADD CONSTRAINT manufacturing_inventory_counts_fiscal_year_check
    CHECK (fiscal_year BETWEEN 2000 AND 2100);

CREATE UNIQUE INDEX IF NOT EXISTS manufacturing_inventory_counts_fiscal_year_unique_idx
  ON public.manufacturing_inventory_counts(fiscal_year);

COMMIT;

