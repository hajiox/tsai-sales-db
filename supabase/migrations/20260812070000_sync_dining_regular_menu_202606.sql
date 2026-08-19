begin;

alter table public.dining_recipes
  add column if not exists is_active boolean not null default true;

comment on column public.dining_recipes.is_active is
  'Current menu visibility. Inactive recipes remain stored for historical reference.';

-- Preserve old recipes and cost evidence, but only expose items in the latest regular menu.
update public.dining_recipes
set is_active = is_intermediate;

insert into public.dining_items
  (id, name, item_type, purchase_quantity, yield_quantity, price_incl_tax, unit, notes, source_file, source_sheet, source_reference, sort_order)
values
  (
    'd1000000-0000-4000-8000-000000000068',
    '山塩煮玉子',
    'food',
    1,
    1,
    0,
    '個',
    '要確認（2026-08-12）。最新版メニューに使用数は記載されているが、製造原価・仕入原価の根拠が未登録。',
    '【レギュラーメニュー】27（2026年6月）価格改定.pdf',
    '1ページ',
    '三大ラーメン',
    68
  )
on conflict (id) do update set
  name = excluded.name,
  notes = excluded.notes,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_reference = excluded.source_reference,
  sort_order = excluded.sort_order;

-- Existing recipes that remain on the June 2026 regular menu.
update public.dining_recipes set
  name = '喜多方ラーメン', selling_price = 780, is_active = true, sort_order = 110,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '喜多方醤油ラーメン'
where id = 'd2000000-0000-4000-8000-000000000002';

update public.dining_recipes set
  name = '会津山塩ラーメン', selling_price = 880, is_active = true, sort_order = 310,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津山塩ラーメン'
where id = 'd2000000-0000-4000-8000-000000000003';

update public.dining_recipes set
  name = '味噌ラーメン', selling_price = 880, is_active = true, sort_order = 210,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '西会津味噌ラーメン'
where id = 'd2000000-0000-4000-8000-000000000004';

update public.dining_recipes set
  name = 'ソースかつ丼（味噌汁付）', selling_price = 1000, is_active = true, sort_order = 410,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津ソースかつ丼'
where id = 'd2000000-0000-4000-8000-000000000005';

update public.dining_recipes set
  selling_price = 1080, is_active = true, sort_order = 120,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '喜多方醤油ラーメン'
where id = 'd2000000-0000-4000-8000-000000000013';

update public.dining_recipes set
  selling_price = 1180, is_active = true, sort_order = 320,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津山塩ラーメン'
where id = 'd2000000-0000-4000-8000-000000000014';

update public.dining_recipes set
  name = '味噌チャーシューメン', selling_price = 1180, is_active = true, sort_order = 220,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '西会津味噌ラーメン'
where id = 'd2000000-0000-4000-8000-000000000015';

update public.dining_recipes set
  name = '特盛ソースかつ丼（味噌汁付）', selling_price = 1450, is_active = true, sort_order = 420,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津ソースかつ丼'
where id = 'd2000000-0000-4000-8000-000000000017';

update public.dining_recipes set
  name = '会津ソースカツ丼（持ち帰り）', selling_price = 800, is_active = true, sort_order = 510,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '持ち帰り専用メニュー'
where id = 'd2000000-0000-4000-8000-000000000018';

update public.dining_recipes set
  name = 'カレーライス', selling_price = 780, is_active = true, sort_order = 610,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津 The カリー'
where id = 'd2000000-0000-4000-8000-000000000019';

update public.dining_recipes set
  selling_price = 880, is_active = true, sort_order = 620,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津 The カリー'
where id = 'd2000000-0000-4000-8000-000000000020';

update public.dining_recipes set
  selling_price = 1080, is_active = true, sort_order = 630,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津 The カリー'
where id = 'd2000000-0000-4000-8000-000000000021';

update public.dining_recipes set
  selling_price = 1180, is_active = true, sort_order = 640,
  source_file = '【レギュラーメニュー】27（2026年6月）価格改定.pdf', source_sheet = '1ページ', source_reference = '会津 The カリー'
where id = 'd2000000-0000-4000-8000-000000000022';

insert into public.dining_recipes
  (id, name, menu_group, selling_price, serving_yield, serving_unit, is_intermediate, is_active, notes, source_file, source_sheet, source_reference, sort_order)
values
  ('d2000000-0000-4000-8000-000000000024', '特選喜多方ラーメン', '喜多方醤油ラーメン', 1030, 1, '食', false, true, '通常の喜多方ラーメンを基準に、叉焼を計2枚（50g）とし山塩煮玉子1個を追加。煮玉子原価は要確認。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '喜多方醤油ラーメン', 130),
  ('d2000000-0000-4000-8000-000000000025', '山塩煮玉子入り醤油ラーメン', '喜多方醤油ラーメン', 880, 1, '食', false, true, '通常の喜多方ラーメンに山塩煮玉子1個を追加。煮玉子原価は要確認。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '喜多方醤油ラーメン', 140),
  ('d2000000-0000-4000-8000-000000000026', 'ネギ醤油ラーメン', '喜多方醤油ラーメン', 880, 1, '食', false, true, '最新版メニュー掲載確認。ネギの使用量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '喜多方醤油ラーメン', 150),
  ('d2000000-0000-4000-8000-000000000027', '特選西会津味噌ラーメン', '西会津味噌ラーメン', 1130, 1, '食', false, true, '通常の味噌ラーメンを基準に、叉焼1枚（25g）と山塩煮玉子1個を追加。煮玉子原価は要確認。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '西会津味噌ラーメン', 230),
  ('d2000000-0000-4000-8000-000000000028', '辛味噌ラーメン（激辛）', '西会津味噌ラーメン', 980, 1, '食', false, true, '最新版メニュー掲載確認。辛味噌の配合・使用量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '西会津味噌ラーメン', 240),
  ('d2000000-0000-4000-8000-000000000029', '山塩煮玉子入り味噌ラーメン', '西会津味噌ラーメン', 980, 1, '食', false, true, '通常の味噌ラーメンに山塩煮玉子1個を追加。煮玉子原価は要確認。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '西会津味噌ラーメン', 250),
  ('d2000000-0000-4000-8000-000000000030', 'ネギ味噌ラーメン', '西会津味噌ラーメン', 980, 1, '食', false, true, '最新版メニュー掲載確認。ネギの使用量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '西会津味噌ラーメン', 260),
  ('d2000000-0000-4000-8000-000000000031', '特選会津山塩ラーメン', '会津山塩ラーメン', 1130, 1, '食', false, true, '通常の会津山塩ラーメンを基準に、叉焼を計2枚（50g）とし山塩煮玉子1個を追加。煮玉子原価は要確認。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津山塩ラーメン', 330),
  ('d2000000-0000-4000-8000-000000000032', '山塩煮玉子入り塩ラーメン', '会津山塩ラーメン', 980, 1, '食', false, true, '通常の会津山塩ラーメンに山塩煮玉子1個を追加。煮玉子原価は要確認。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津山塩ラーメン', 340),
  ('d2000000-0000-4000-8000-000000000033', 'ネギ山塩ラーメン', '会津山塩ラーメン', 980, 1, '食', false, true, '最新版メニュー掲載確認。ネギの使用量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津山塩ラーメン', 350),
  ('d2000000-0000-4000-8000-000000000034', 'ミニひれソースかつ丼＆喜多方ラーメンセット', 'ミニ丼＆麺セット', 1230, 1, '食', false, true, '最新版メニュー掲載確認。ミニひれソースかつ丼の規格が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 710),
  ('d2000000-0000-4000-8000-000000000035', 'ミニ会津カレー＆喜多方ラーメンセット', 'ミニ丼＆麺セット', 990, 1, '食', false, true, '最新版メニュー掲載確認。ミニカレーの1食量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 720),
  ('d2000000-0000-4000-8000-000000000036', 'ミニひれソースかつ丼＆西会津味噌ラーメンセット', 'ミニ丼＆麺セット', 1330, 1, '食', false, true, '最新版メニュー掲載確認。ミニひれソースかつ丼の規格が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 730),
  ('d2000000-0000-4000-8000-000000000037', 'ミニ会津カレー＆西会津味噌ラーメンセット', 'ミニ丼＆麺セット', 1090, 1, '食', false, true, '最新版メニュー掲載確認。ミニカレーの1食量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 740),
  ('d2000000-0000-4000-8000-000000000038', 'ミニひれソースかつ丼＆会津山塩ラーメンセット', 'ミニ丼＆麺セット', 1330, 1, '食', false, true, '最新版メニュー掲載確認。ミニひれソースかつ丼の規格が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 750),
  ('d2000000-0000-4000-8000-000000000039', 'ミニ会津カレー＆会津山塩ラーメンセット', 'ミニ丼＆麺セット', 1090, 1, '食', false, true, '最新版メニュー掲載確認。ミニカレーの1食量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 760),
  ('d2000000-0000-4000-8000-000000000040', 'ソースかつ丼＆しじみ汁セット', '会津ソースかつ丼', 1100, 1, '食', false, true, '最新版メニュー掲載確認。しじみ汁の規格・原価が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津ソースかつ丼', 430),
  ('d2000000-0000-4000-8000-000000000041', '特盛りソースかつ丼＆しじみ汁セット', '会津ソースかつ丼', 1550, 1, '食', false, true, '最新版メニュー掲載確認。カツ2枚・ご飯大盛り無料。しじみ汁とご飯量の規格が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津ソースかつ丼', 440),
  ('d2000000-0000-4000-8000-000000000042', 'おつまみミニかつ（1個）', '会津ソースかつ丼', 170, 1, '個', false, true, '最新版メニュー掲載確認。ミニかつ1個の規格が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津ソースかつ丼', 450),
  ('d2000000-0000-4000-8000-000000000043', 'ミニひれソースカツ丼セット', '会津ソースかつ丼', 600, 1, '食', false, true, '最新版メニュー掲載確認。味噌汁・お新香付き。ミニひれかつの規格が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津ソースかつ丼', 460),
  ('d2000000-0000-4000-8000-000000000044', '会津磐梯山ジオパークカレー', '会津 The カリー', 1380, 1, '食', false, true, '最新版メニュー掲載確認。カレー・ハンバーグ・会津山塩煮玉子・ヒレ会津ソースカツ2個の構成。各使用量が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '会津 The カリー', 650),
  ('d2000000-0000-4000-8000-000000000045', 'かつのみ（持ち帰り）', '持ち帰り専用', 700, 1, '食', false, true, '最新版メニュー掲載確認。持ち帰り用かつの規格・資材が未確認のためレシピ未登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', '持ち帰り専用メニュー', 520),
  ('d2000000-0000-4000-8000-000000000046', '会津米ごはん', 'サイドメニュー', 170, 1, '食', false, true, '既存定食の標準ご飯140gを1食量として登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 810),
  ('d2000000-0000-4000-8000-000000000047', '味噌汁', 'サイドメニュー', 100, 1, '食', false, true, '既存定食の味噌汁味噌15g・具材2gを1食量として登録。', '【レギュラーメニュー】27（2026年6月）価格改定.pdf', '1ページ', 'ミニ丼＆麺セット', 820)
on conflict (id) do update set
  name = excluded.name,
  menu_group = excluded.menu_group,
  selling_price = excluded.selling_price,
  serving_yield = excluded.serving_yield,
  serving_unit = excluded.serving_unit,
  is_active = excluded.is_active,
  notes = excluded.notes,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_reference = excluded.source_reference,
  sort_order = excluded.sort_order;

-- Rebuild only recipes whose quantities can be derived safely from existing standards.
delete from public.dining_recipe_items
where recipe_id in (
  'd2000000-0000-4000-8000-000000000024',
  'd2000000-0000-4000-8000-000000000025',
  'd2000000-0000-4000-8000-000000000027',
  'd2000000-0000-4000-8000-000000000029',
  'd2000000-0000-4000-8000-000000000031',
  'd2000000-0000-4000-8000-000000000032',
  'd2000000-0000-4000-8000-000000000046',
  'd2000000-0000-4000-8000-000000000047'
);

insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
select
  target.recipe_id,
  source.dining_item_id,
  source.intermediate_recipe_id,
  case when source.dining_item_id = 'd1000000-0000-4000-8000-000000000007' then target.chashu_g else source.quantity end,
  source.unit,
  source.sort_order,
  source.notes
from (
  values
    ('d2000000-0000-4000-8000-000000000024'::uuid, 'd2000000-0000-4000-8000-000000000002'::uuid, 50::numeric),
    ('d2000000-0000-4000-8000-000000000025'::uuid, 'd2000000-0000-4000-8000-000000000002'::uuid, 25::numeric),
    ('d2000000-0000-4000-8000-000000000031'::uuid, 'd2000000-0000-4000-8000-000000000003'::uuid, 50::numeric),
    ('d2000000-0000-4000-8000-000000000032'::uuid, 'd2000000-0000-4000-8000-000000000003'::uuid, 25::numeric)
) as target(recipe_id, source_recipe_id, chashu_g)
join public.dining_recipe_items source on source.recipe_id = target.source_recipe_id;

insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
select
  target.recipe_id,
  source.dining_item_id,
  source.intermediate_recipe_id,
  source.quantity,
  source.unit,
  source.sort_order,
  source.notes
from (
  values
    ('d2000000-0000-4000-8000-000000000027'::uuid),
    ('d2000000-0000-4000-8000-000000000029'::uuid)
) as target(recipe_id)
join public.dining_recipe_items source on source.recipe_id = 'd2000000-0000-4000-8000-000000000004';

insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
values
  ('d2000000-0000-4000-8000-000000000024', 'd1000000-0000-4000-8000-000000000068', null, 1, '個', 10, '山塩煮玉子1個'),
  ('d2000000-0000-4000-8000-000000000025', 'd1000000-0000-4000-8000-000000000068', null, 1, '個', 10, '山塩煮玉子1個'),
  ('d2000000-0000-4000-8000-000000000027', 'd1000000-0000-4000-8000-000000000007', null, 25, 'g', 18, '叉焼1枚（25g）'),
  ('d2000000-0000-4000-8000-000000000027', 'd1000000-0000-4000-8000-000000000068', null, 1, '個', 19, '山塩煮玉子1個'),
  ('d2000000-0000-4000-8000-000000000029', 'd1000000-0000-4000-8000-000000000068', null, 1, '個', 18, '山塩煮玉子1個'),
  ('d2000000-0000-4000-8000-000000000031', 'd1000000-0000-4000-8000-000000000068', null, 1, '個', 12, '山塩煮玉子1個'),
  ('d2000000-0000-4000-8000-000000000032', 'd1000000-0000-4000-8000-000000000068', null, 1, '個', 12, '山塩煮玉子1個'),
  ('d2000000-0000-4000-8000-000000000046', 'd1000000-0000-4000-8000-000000000033', null, 140, 'g', 1, '標準ご飯量'),
  ('d2000000-0000-4000-8000-000000000047', 'd1000000-0000-4000-8000-000000000034', null, 15, 'g', 1, '標準味噌量'),
  ('d2000000-0000-4000-8000-000000000047', 'd1000000-0000-4000-8000-000000000035', null, 2, 'g', 2, '標準具材量');

commit;
