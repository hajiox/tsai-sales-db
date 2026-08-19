ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_filling_quantity_unit_check,
  DROP CONSTRAINT IF EXISTS recipes_net_content_unit_check;

COMMENT ON COLUMN public.recipes.filling_quantity_unit IS 'Unit for filling quantity. Allows g, ml, or custom text.';
COMMENT ON COLUMN public.recipes.net_content_unit IS 'Unit for net content. Allows g, ml, or custom text.';
