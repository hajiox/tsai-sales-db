begin;

-- The three negi ramen rows were added from the June 2026 menu before their
-- topping quantities were confirmed. Rebuild them from the matching standard
-- ramen, then add the confirmed negi toppings.
delete from public.dining_recipe_items
where recipe_id in (
  'd2000000-0000-4000-8000-000000000026',
  'd2000000-0000-4000-8000-000000000030',
  'd2000000-0000-4000-8000-000000000033'
);

insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, notes, sort_order)
select
  mapping.target_recipe_id,
  source_item.dining_item_id,
  source_item.intermediate_recipe_id,
  source_item.quantity,
  source_item.unit,
  source_item.notes,
  source_item.sort_order
from (
  values
    ('d2000000-0000-4000-8000-000000000026'::uuid, 'd2000000-0000-4000-8000-000000000002'::uuid),
    ('d2000000-0000-4000-8000-000000000030'::uuid, 'd2000000-0000-4000-8000-000000000004'::uuid),
    ('d2000000-0000-4000-8000-000000000033'::uuid, 'd2000000-0000-4000-8000-000000000003'::uuid)
) as mapping(target_recipe_id, source_recipe_id)
join public.dining_recipe_items source_item
  on source_item.recipe_id = mapping.source_recipe_id;

update public.dining_items
set
  name = '自家製ラー油',
  notes = 'TSA食材DBの中間原価を採用。現行の自家製ラー油503.2g・税込原価439.73円。'
where id = 'd1000000-0000-4000-8000-000000000054';

insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, notes, sort_order)
select
  target.recipe_id,
  confirmed.dining_item_id,
  null,
  confirmed.quantity,
  'g',
  '2026-08-12 分量確定',
  confirmed.sort_order
from (
  values
    ('d2000000-0000-4000-8000-000000000026'::uuid),
    ('d2000000-0000-4000-8000-000000000030'::uuid),
    ('d2000000-0000-4000-8000-000000000033'::uuid)
) as target(recipe_id)
cross join (
  values
    ('d1000000-0000-4000-8000-000000000056'::uuid, 30::numeric, 90),
    ('d1000000-0000-4000-8000-000000000054'::uuid, 5::numeric, 91)
) as confirmed(dining_item_id, quantity, sort_order);

update public.dining_recipes
set notes = '通常ラーメンの構成に、白髪ねぎ30g・自家製ラー油5gを追加。2026-08-12 分量確定。'
where id in (
  'd2000000-0000-4000-8000-000000000026',
  'd2000000-0000-4000-8000-000000000030',
  'd2000000-0000-4000-8000-000000000033'
);

commit;
