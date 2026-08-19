CREATE TABLE IF NOT EXISTS public.brand_store_inventory_wholesale_rate_backup_20260730 AS
SELECT
  id AS inventory_item_id,
  inventory_id,
  selling_price,
  wholesale_price,
  now() AS backed_up_at
FROM public.brand_store_inventory_items;

ALTER TABLE public.brand_store_inventory_wholesale_rate_backup_20260730 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.brand_store_inventory_wholesale_rate_backup_20260730 FROM anon, authenticated;
GRANT ALL ON TABLE public.brand_store_inventory_wholesale_rate_backup_20260730 TO service_role;

UPDATE public.brand_store_inventory_items
SET wholesale_price = CASE
  WHEN selling_price IS NULL THEN NULL
  ELSE round(selling_price * 0.70, 2)
END
WHERE wholesale_price IS DISTINCT FROM CASE
  WHEN selling_price IS NULL THEN NULL
  ELSE round(selling_price * 0.70, 2)
END;

CREATE OR REPLACE FUNCTION public.enforce_brand_store_inventory_seventy_percent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.wholesale_price := CASE
    WHEN NEW.selling_price IS NULL THEN NULL
    ELSE round(NEW.selling_price * 0.70, 2)
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brand_store_inventory_seventy_percent
  ON public.brand_store_inventory_items;

CREATE TRIGGER trg_brand_store_inventory_seventy_percent
BEFORE INSERT OR UPDATE OF selling_price, wholesale_price
ON public.brand_store_inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_brand_store_inventory_seventy_percent();

COMMENT ON FUNCTION public.enforce_brand_store_inventory_seventy_percent()
IS 'Keeps brand-store stocktake unit price at 70 percent of tax-exclusive selling price.';
