-- Optional per-line override. Existing records retain the source/category fallback.
ALTER TABLE public.manufacturing_inventory_items
  ADD COLUMN IF NOT EXISTS tax_rate smallint CHECK (tax_rate IN (0, 8, 10));
