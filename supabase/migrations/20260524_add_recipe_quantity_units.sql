ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS filling_quantity_unit text,
ADD COLUMN IF NOT EXISTS net_content_unit text;

UPDATE public.recipes
SET filling_quantity_unit = 'g'
WHERE filling_quantity_unit IS NULL OR filling_quantity_unit NOT IN ('g', 'ml');

UPDATE public.recipes
SET net_content_unit = 'g'
WHERE net_content_unit IS NULL OR net_content_unit NOT IN ('g', 'ml');

ALTER TABLE public.recipes
ALTER COLUMN filling_quantity_unit SET DEFAULT 'g',
ALTER COLUMN net_content_unit SET DEFAULT 'g';

DO $$
BEGIN
  ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_filling_quantity_unit_check
  CHECK (filling_quantity_unit IN ('g', 'ml'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_net_content_unit_check
  CHECK (net_content_unit IN ('g', 'ml'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.recipes.filling_quantity_unit IS '充填量の単位。g または ml';
COMMENT ON COLUMN public.recipes.net_content_unit IS '内容量（表記量）の単位。g または ml';
