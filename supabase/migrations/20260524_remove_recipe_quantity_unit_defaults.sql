ALTER TABLE public.recipes
  ALTER COLUMN filling_quantity_unit DROP DEFAULT,
  ALTER COLUMN net_content_unit DROP DEFAULT;
