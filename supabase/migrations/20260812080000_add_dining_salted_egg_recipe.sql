-- Register the current salted egg recipe and replace the temporary zero-yen item.

insert into public.dining_items (
  id, name, item_type, purchase_quantity, yield_quantity, price_incl_tax, unit,
  notes, source_file, source_sheet, source_reference, sort_order
)
values (
  'd1000000-0000-4000-8000-000000000069',
  '卵Lサイズ（10個入り）',
  'food',
  10,
  10,
  302.4,
  '個',
  '調査済み（2026-08-12）。出典: DocScanner／フレッシュさいとう／2026-05-30／20260611_020.jpg。税抜280円・食品8%税込302.40円／10個。2026-04-03から2026-05-30まで26明細で税抜280円を確認。',
  'DocScanner',
  '請求書',
  '20260611_020.jpg',
  69
)
on conflict (id) do update set
  name = excluded.name,
  item_type = excluded.item_type,
  purchase_quantity = excluded.purchase_quantity,
  yield_quantity = excluded.yield_quantity,
  price_incl_tax = excluded.price_incl_tax,
  unit = excluded.unit,
  notes = excluded.notes,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_reference = excluded.source_reference,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.dining_recipes (
  id, name, menu_group, selling_price, serving_yield, serving_unit,
  is_intermediate, is_active, notes, source_file, source_sheet, source_reference, sort_order
)
values (
  'd2000000-0000-4000-8000-000000000048',
  '山塩煮たまご（仕込み）',
  '中間部品',
  0,
  10,
  '個',
  true,
  true,
  '掲示板の現行「山塩煮たまご 新レシピ」を登録。卵の底に穴を開け、沸騰湯で8分から8分20秒茹で、氷水で冷却して殻をむき漬け汁へ。翌日から提供、賞味期限5日。漬け汁は水750ml、ラーメン用塩ダレ半レードル、食塩小さじ2。掲示板に出来高数の記載がないため、フレッシュさいとうの卵10個入り1パックを1仕込みとして概算。',
  'https://v0-line-blush.vercel.app/board/b28f7261-c845-4142-9c41-12b779c8b8bd',
  '【レシピ】食のブランド館',
  '山塩煮たまご 新レシピ',
  4
)
on conflict (id) do update set
  name = excluded.name,
  menu_group = excluded.menu_group,
  serving_yield = excluded.serving_yield,
  serving_unit = excluded.serving_unit,
  is_intermediate = excluded.is_intermediate,
  is_active = excluded.is_active,
  notes = excluded.notes,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_reference = excluded.source_reference,
  sort_order = excluded.sort_order,
  updated_at = now();

delete from public.dining_recipe_items
where recipe_id = 'd2000000-0000-4000-8000-000000000048';

insert into public.dining_recipe_items (
  recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, notes, sort_order
)
values
  ('d2000000-0000-4000-8000-000000000048', 'd1000000-0000-4000-8000-000000000069', null, 10, '個', '卵Lサイズ10個入り1パック', 1),
  ('d2000000-0000-4000-8000-000000000048', 'd1000000-0000-4000-8000-000000000003', null, 750, 'ml', '漬け汁の水750ml', 2),
  ('d2000000-0000-4000-8000-000000000048', 'd1000000-0000-4000-8000-000000000012', null, 5, 'g', 'ラーメン用塩ダレ半レードルを既存の山塩・帆立1対1配合で按分', 3),
  ('d2000000-0000-4000-8000-000000000048', 'd1000000-0000-4000-8000-000000000014', null, 5, 'g', 'ラーメン用塩ダレ半レードルを既存の山塩・帆立1対1配合で按分', 4),
  ('d2000000-0000-4000-8000-000000000048', 'd1000000-0000-4000-8000-000000000066', null, 12, 'g', '食塩小さじ2。小さじ1を6gとして換算', 5);

update public.dining_recipe_items
set
  dining_item_id = null,
  intermediate_recipe_id = 'd2000000-0000-4000-8000-000000000048',
  unit = '個',
  notes = '掲示板の現行山塩煮たまごレシピを連携。出来高10個として概算。',
  updated_at = now()
where dining_item_id = 'd1000000-0000-4000-8000-000000000068';

update public.dining_recipes
set
  notes = replace(replace(notes, '煮玉子原価は要確認。', '山塩煮たまご仕込みを連携。出来高10個として概算。'), '煮玉子原価は要確認', '山塩煮たまご仕込みを連携。出来高10個として概算'),
  updated_at = now()
where id in (
  'd2000000-0000-4000-8000-000000000024',
  'd2000000-0000-4000-8000-000000000025',
  'd2000000-0000-4000-8000-000000000027',
  'd2000000-0000-4000-8000-000000000029',
  'd2000000-0000-4000-8000-000000000031',
  'd2000000-0000-4000-8000-000000000032'
);

delete from public.dining_items
where id = 'd1000000-0000-4000-8000-000000000068'
  and not exists (
    select 1 from public.dining_recipe_items
    where dining_item_id = 'd1000000-0000-4000-8000-000000000068'
  );
