-- Repair current recipe rows whose positive unit cost was stored as zero.
-- Historical recipe_versions are immutable and are intentionally not changed.

-- Restore exact master links for the current OEM sea-urchin furikake recipe.
UPDATE recipe_items ri
SET ingredient_id = i.id
FROM ingredients i
WHERE ri.recipe_id = '21390395-2d8a-4c2b-ab60-9c767b51621c'
  AND ri.item_type = 'ingredient'
  AND ri.ingredient_id IS NULL
  AND ri.item_name = i.name
  AND (SELECT count(*) FROM ingredients i2 WHERE i2.name = ri.item_name) = 1;

UPDATE recipe_items ri
SET material_id = m.id
FROM materials m
WHERE ri.recipe_id = '21390395-2d8a-4c2b-ab60-9c767b51621c'
  AND ri.item_type = 'material'
  AND ri.material_id IS NULL
  AND ri.item_name = m.name
  AND (SELECT count(*) FROM materials m2 WHERE m2.name = ri.item_name) = 1;

UPDATE recipe_items ri
SET expense_id = e.id
FROM expenses e
WHERE ri.recipe_id = '21390395-2d8a-4c2b-ab60-9c767b51621c'
  AND ri.item_type = 'expense'
  AND ri.expense_id IS NULL
  AND ri.item_name = e.name
  AND (SELECT count(*) FROM expenses e2 WHERE e2.name = ri.item_name) = 1;

-- The Ashinomaki curry has twelve zero-cost rows with one confirmed master each.
WITH links(item_id, master_id) AS (
  VALUES
    ('efc36991-09fe-4cad-94dc-ca8580d4a0cd'::uuid, '47bacf72-af26-4f5e-91f4-ff5827229f07'::uuid),
    ('04c8b8b3-b8ce-4e10-b121-5dcdd165123b'::uuid, 'af5d3d29-d359-439e-99e8-c6296dbdf2e3'::uuid),
    ('c2e5741a-a785-4c9d-ad21-db4cfa3ebb4f'::uuid, '252c0380-d91f-4242-a240-8499f92f0370'::uuid),
    ('f685bbf6-1c53-4941-98b5-fa004463bbf7'::uuid, 'b1cde7dd-8c7c-4f30-b084-8e95cd82371b'::uuid),
    ('ebb0d8af-55b4-486e-a6d0-4b06a4380ed4'::uuid, '22b1a380-10f9-4264-bd2e-d2c51f0d3ca1'::uuid),
    ('33e9b412-8fca-427c-8fd6-22a88fe39fa9'::uuid, '31617066-b026-4228-a1d9-f73e0c50c14e'::uuid),
    ('2e4cbd75-15d2-4833-bc29-7bdc8baf9740'::uuid, '76e86abc-109e-4f36-8bb0-0eb38c3f156e'::uuid),
    ('901d5564-860a-487a-b634-e5b5f661147d'::uuid, '01554e9d-9269-4cff-bdd1-e152993ae2b9'::uuid),
    ('9e166a5e-72ba-4d8f-b9c7-f0ed10908564'::uuid, '4116366d-0da6-4d37-9ff9-be257c6a9a80'::uuid),
    ('78d4809e-93f1-4f24-92f7-b1dc944520c1'::uuid, '6af9e1a0-187f-42e6-b0b5-85293e0fae07'::uuid),
    ('0e4336a3-a5bb-4772-8ea3-ee5bcf6242d7'::uuid, '63fe999a-22a1-4cf9-80ac-793550662f96'::uuid),
    ('216f533a-5cc7-4861-bc9d-97c266bdcdde'::uuid, '49d7c15b-e2f2-4d66-af77-f1d05e1d9a15'::uuid)
)
UPDATE recipe_items ri
SET ingredient_id = links.master_id
FROM links
WHERE ri.id = links.item_id
  AND ri.item_type = 'ingredient'
  AND ri.ingredient_id IS NULL;

-- Recalculate every linked positive-price ingredient row that is currently zero.
UPDATE recipe_items ri
SET item_name = i.name,
    unit_price = i.price,
    unit_quantity = i.unit_quantity,
    tax_included = COALESCE(i.tax_included, true),
    cost = round(
      COALESCE(ri.usage_amount, 0) * i.price / NULLIF(i.unit_quantity, 0)
      * CASE WHEN i.tax_included = false THEN 1.08 ELSE 1 END,
      4
    )
FROM ingredients i
WHERE ri.ingredient_id = i.id
  AND ri.item_type = 'ingredient'
  AND COALESCE(ri.usage_amount, 0) > 0
  AND COALESCE(ri.cost, 0) = 0
  AND COALESCE(i.price, 0) > 0
  AND COALESCE(i.unit_quantity, 0) > 0;

UPDATE recipe_items ri
SET item_name = e.name,
    unit_price = e.unit_price,
    tax_included = COALESCE(e.tax_included, true),
    cost = round(
      COALESCE(ri.usage_amount, 0) * e.unit_price
      * CASE WHEN e.tax_included = false THEN 1.10 ELSE 1 END,
      4
    )
FROM expenses e
WHERE ri.expense_id = e.id
  AND ri.item_type = 'expense'
  AND COALESCE(ri.usage_amount, 0) > 0
  AND COALESCE(ri.cost, 0) = 0
  AND COALESCE(e.unit_price, 0) > 0;

UPDATE recipe_items ri
SET item_name = m.name,
    unit_price = m.price,
    tax_included = COALESCE(m.tax_included, true),
    cost = round(
      COALESCE(ri.usage_amount, 0) * m.price
      * CASE WHEN m.tax_included = false THEN 1.10 ELSE 1 END,
      4
    )
FROM materials m
WHERE ri.material_id = m.id
  AND ri.item_type = 'material'
  AND COALESCE(ri.usage_amount, 0) > 0
  AND COALESCE(ri.cost, 0) = 0
  AND COALESCE(m.price, 0) > 0;

-- This recipe must always use the current master prices, not restored snapshots.
UPDATE recipe_items ri
SET item_name = i.name,
    unit_price = i.price,
    unit_quantity = i.unit_quantity,
    tax_included = COALESCE(i.tax_included, true),
    cost = round(
      COALESCE(ri.usage_amount, 0) * i.price / NULLIF(i.unit_quantity, 0)
      * CASE WHEN i.tax_included = false THEN 1.08 ELSE 1 END,
      4
    )
FROM ingredients i
WHERE ri.recipe_id = '21390395-2d8a-4c2b-ab60-9c767b51621c'
  AND ri.ingredient_id = i.id
  AND ri.item_type = 'ingredient'
  AND COALESCE(i.unit_quantity, 0) > 0;

UPDATE recipe_items ri
SET item_name = m.name,
    unit_price = m.price,
    tax_included = COALESCE(m.tax_included, true),
    cost = round(
      COALESCE(ri.usage_amount, 0) * m.price
      * CASE WHEN m.tax_included = false THEN 1.10 ELSE 1 END,
      4
    )
FROM materials m
WHERE ri.recipe_id = '21390395-2d8a-4c2b-ab60-9c767b51621c'
  AND ri.material_id = m.id
  AND ri.item_type = 'material';

UPDATE recipe_items ri
SET item_name = e.name,
    unit_price = e.unit_price,
    tax_included = COALESCE(e.tax_included, true),
    cost = round(
      COALESCE(ri.usage_amount, 0) * e.unit_price
      * CASE WHEN e.tax_included = false THEN 1.10 ELSE 1 END,
      4
    )
FROM expenses e
WHERE ri.recipe_id = '21390395-2d8a-4c2b-ab60-9c767b51621c'
  AND ri.expense_id = e.id
  AND ri.item_type = 'expense';

-- Refresh only the eight recipes touched by the confirmed zero-cost repair.
WITH affected(recipe_id) AS (
  VALUES
    ('21390395-2d8a-4c2b-ab60-9c767b51621c'::uuid),
    ('d8a05677-8899-4438-898f-e6d2dd2130a7'::uuid),
    ('b0756b7d-5fd3-46b3-a4e5-58d6888696c1'::uuid),
    ('389d7252-c3ed-4285-909d-32f7e119bc77'::uuid),
    ('7d5a0c54-8d69-43e4-af29-a322c388515b'::uuid),
    ('40e1dbc5-cb43-4b94-b376-8142d7468f4a'::uuid),
    ('bcf41937-12ba-4f22-b074-ecb2135fe1da'::uuid),
    ('0c699485-8b4a-442d-b50f-fded29b1ab11'::uuid)
)
UPDATE recipes r
SET total_cost = round(
  COALESCE((
    SELECT sum(COALESCE(ri.cost, 0))
    FROM recipe_items ri
    WHERE ri.recipe_id = r.id
      AND NOT (ri.item_type = 'expense' AND ri.item_name = 'Amazon手数料')
  ), 0)
  + CASE
      WHEN r.amazon_fee_enabled = true AND COALESCE(r.selling_price, 0) > 0
        THEN round(floor(r.selling_price * 1.08) * 0.10)
      ELSE 0
    END,
  4
)
FROM affected
WHERE r.id = affected.recipe_id;

-- Keep linked WEB product profit rates aligned with the repaired current recipe cost.
WITH affected(recipe_id) AS (
  VALUES
    ('21390395-2d8a-4c2b-ab60-9c767b51621c'::uuid),
    ('d8a05677-8899-4438-898f-e6d2dd2130a7'::uuid),
    ('b0756b7d-5fd3-46b3-a4e5-58d6888696c1'::uuid),
    ('389d7252-c3ed-4285-909d-32f7e119bc77'::uuid),
    ('7d5a0c54-8d69-43e4-af29-a322c388515b'::uuid),
    ('40e1dbc5-cb43-4b94-b376-8142d7468f4a'::uuid),
    ('bcf41937-12ba-4f22-b074-ecb2135fe1da'::uuid),
    ('0c699485-8b4a-442d-b50f-fded29b1ab11'::uuid)
)
UPDATE products p
SET price = floor(r.selling_price * 1.08),
    profit_rate = round(
      ((floor(r.selling_price * 1.08) - r.total_cost) / NULLIF(floor(r.selling_price * 1.08), 0)) * 100,
      1
    )
FROM recipes r, affected
WHERE r.id = affected.recipe_id
  AND r.linked_product_id = p.id
  AND COALESCE(r.selling_price, 0) > 0;
