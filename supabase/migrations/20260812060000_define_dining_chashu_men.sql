begin;

delete from public.dining_recipe_items
where recipe_id in (
  'd2000000-0000-4000-8000-000000000013',
  'd2000000-0000-4000-8000-000000000014',
  'd2000000-0000-4000-8000-000000000015'
);

-- Soy sauce chashu: copy the standard recipe, omit nori, and use four slices total.
insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
select
  'd2000000-0000-4000-8000-000000000013',
  dining_item_id,
  intermediate_recipe_id,
  case
    when dining_item_id = 'd1000000-0000-4000-8000-000000000007' then 100
    else quantity
  end,
  unit,
  row_number() over (order by sort_order)::integer,
  case
    when dining_item_id = 'd1000000-0000-4000-8000-000000000007'
      then '通常1枚25g + 追加3枚 = 計4枚（100g）'
    else notes
  end
from public.dining_recipe_items
where recipe_id = 'd2000000-0000-4000-8000-000000000002'
  and dining_item_id is distinct from 'd1000000-0000-4000-8000-000000000010'
order by sort_order;

-- Salt chashu: copy the standard recipe and use four slices total.
insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
select
  'd2000000-0000-4000-8000-000000000014',
  dining_item_id,
  intermediate_recipe_id,
  case
    when dining_item_id = 'd1000000-0000-4000-8000-000000000007' then 100
    else quantity
  end,
  unit,
  sort_order,
  case
    when dining_item_id = 'd1000000-0000-4000-8000-000000000007'
      then '通常1枚25g + 追加3枚 = 計4枚（100g）'
    else notes
  end
from public.dining_recipe_items
where recipe_id = 'd2000000-0000-4000-8000-000000000003'
order by sort_order;

-- Miso chashu: retain the standard minced chashu and add four sliced pieces.
insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
select
  'd2000000-0000-4000-8000-000000000015',
  dining_item_id,
  intermediate_recipe_id,
  quantity,
  unit,
  sort_order,
  notes
from public.dining_recipe_items
where recipe_id = 'd2000000-0000-4000-8000-000000000004'
order by sort_order;

insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
values
  (
    'd2000000-0000-4000-8000-000000000015',
    'd1000000-0000-4000-8000-000000000007',
    null,
    100,
    'g',
    18,
    '追加4枚 = 100g（1枚25g換算）'
  );

update public.dining_recipes
set
  notes = '通常の喜多方醤油ラーメンを基準に、海苔なし・チャーシュー追加3枚。通常1枚と合わせて計4枚（100g）。',
  source_file = 'ユーザー指示',
  source_sheet = '2026-08-12',
  source_reference = '醤油チャーシューメン'
where id = 'd2000000-0000-4000-8000-000000000013';

update public.dining_recipes
set
  notes = '通常の会津山塩ラーメンを基準に、チャーシュー追加3枚。通常1枚と合わせて計4枚（100g）。',
  source_file = 'ユーザー指示',
  source_sheet = '2026-08-12',
  source_reference = '塩チャーシューメン'
where id = 'd2000000-0000-4000-8000-000000000014';

update public.dining_recipes
set
  notes = '通常の西会津味噌ラーメンを基準に、既存の挽きチャーシューを残してスライスチャーシュー4枚（100g）を追加。',
  source_file = 'ユーザー指示',
  source_sheet = '2026-08-12',
  source_reference = '味噌チャーシューメン'
where id = 'd2000000-0000-4000-8000-000000000015';

commit;
