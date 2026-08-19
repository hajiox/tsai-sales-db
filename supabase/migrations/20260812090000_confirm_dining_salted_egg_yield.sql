-- Confirm the salted egg batch yield at 10 eggs per batch.

update public.dining_recipes
set
  notes = replace(
    notes,
    '掲示板に出来高数の記載がないため、フレッシュさいとうの卵10個入り1パックを1仕込みとして概算。',
    '出来高は卵10個入り1パックを1仕込みとして確定。'
  ),
  updated_at = now()
where id = 'd2000000-0000-4000-8000-000000000048';

update public.dining_recipe_items
set
  notes = '掲示板の現行山塩煮たまごレシピを連携。出来高10個で確定。',
  updated_at = now()
where intermediate_recipe_id = 'd2000000-0000-4000-8000-000000000048';

update public.dining_recipes
set
  notes = replace(notes, '山塩煮たまご仕込みを連携。出来高10個として概算。', '山塩煮たまご仕込みを連携。出来高10個で確定。'),
  updated_at = now()
where id in (
  'd2000000-0000-4000-8000-000000000024',
  'd2000000-0000-4000-8000-000000000025',
  'd2000000-0000-4000-8000-000000000027',
  'd2000000-0000-4000-8000-000000000029',
  'd2000000-0000-4000-8000-000000000031',
  'd2000000-0000-4000-8000-000000000032'
);
