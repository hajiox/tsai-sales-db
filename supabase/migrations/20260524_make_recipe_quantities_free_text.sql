ALTER TABLE public.recipes
  ALTER COLUMN filling_quantity TYPE text USING filling_quantity::text,
  ALTER COLUMN filling_quantity DROP DEFAULT;

COMMENT ON COLUMN public.recipes.filling_quantity IS 'Free text for filling quantity.';
COMMENT ON COLUMN public.recipes.label_quantity IS 'Free text for net content display.';
