CREATE TABLE IF NOT EXISTS public.app_data_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_data_migrations
    WHERE name = '20260531_recipe_selling_price_tax_excluded'
  ) THEN
    CREATE TABLE IF NOT EXISTS public.recipes_selling_price_tax_included_backup_20260531 AS
    SELECT
      id,
      selling_price AS selling_price_incl_tax,
      now() AS backed_up_at
    FROM public.recipes
    WHERE selling_price IS NOT NULL;

    UPDATE public.recipes
    SET selling_price = floor(selling_price / 1.08)
    WHERE selling_price IS NOT NULL;

    COMMENT ON COLUMN public.recipes.selling_price IS
      'Tax-excluded selling price. Tax-included display values are calculated with floor(selling_price * 1.08).';

    INSERT INTO public.app_data_migrations (name)
    VALUES ('20260531_recipe_selling_price_tax_excluded');
  END IF;
END $$;
