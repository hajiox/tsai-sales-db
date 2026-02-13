
-- Run this in Supabase Dashboard SQL Editor to prepare for name integration

-- 1. Add linking columns to recipe_items
ALTER TABLE recipe_items 
ADD COLUMN IF NOT EXISTS ingredient_id UUID REFERENCES ingredients(id),
ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id),
ADD COLUMN IF NOT EXISTS intermediate_recipe_id UUID REFERENCES recipes(id);

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient_id ON recipe_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_material_id ON recipe_items(material_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_intermediate_recipe_id ON recipe_items(intermediate_recipe_id);

-- 3. (Optional) Constraint: only one link type allowed per row (if we want to be strict later)
-- ALTER TABLE recipe_items ADD CONSTRAINT check_one_link CHECK (
--   (ingredient_id IS NOT NULL)::int + (material_id IS NOT NULL)::int + (intermediate_recipe_id IS NOT NULL)::int <= 1
-- );
