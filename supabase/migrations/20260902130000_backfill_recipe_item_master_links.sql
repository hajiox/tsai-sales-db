-- Repair legacy recipe rows that retained only an exact master name.
-- Ambiguous or unmatched names remain untouched for operator review.

WITH unique_ingredient_names AS (
  SELECT btrim(name) AS name_key
  FROM public.ingredients
  WHERE btrim(name) <> ''
  GROUP BY btrim(name)
  HAVING count(*) = 1
)
UPDATE public.recipe_items AS recipe_item
SET ingredient_id = ingredient.id
FROM public.ingredients AS ingredient
JOIN unique_ingredient_names AS unique_name
  ON unique_name.name_key = btrim(ingredient.name)
WHERE recipe_item.item_type = 'ingredient'
  AND recipe_item.ingredient_id IS NULL
  AND btrim(recipe_item.item_name) = unique_name.name_key;

WITH unique_material_names AS (
  SELECT btrim(name) AS name_key
  FROM public.materials
  WHERE btrim(name) <> ''
  GROUP BY btrim(name)
  HAVING count(*) = 1
)
UPDATE public.recipe_items AS recipe_item
SET material_id = material.id
FROM public.materials AS material
JOIN unique_material_names AS unique_name
  ON unique_name.name_key = btrim(material.name)
WHERE recipe_item.item_type = 'material'
  AND recipe_item.material_id IS NULL
  AND btrim(recipe_item.item_name) = unique_name.name_key;
