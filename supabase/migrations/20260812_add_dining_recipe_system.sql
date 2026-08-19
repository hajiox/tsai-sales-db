create table if not exists public.dining_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  item_type text not null default 'food' check (item_type in ('food', 'material')),
  purchase_quantity numeric not null default 1 check (purchase_quantity > 0),
  yield_quantity numeric not null default 1 check (yield_quantity > 0),
  price_incl_tax numeric not null default 0 check (price_incl_tax >= 0),
  unit text not null default 'g',
  notes text,
  source_file text,
  source_sheet text,
  source_reference text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dining_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  menu_group text,
  selling_price numeric not null default 0 check (selling_price >= 0),
  serving_yield numeric not null default 1 check (serving_yield > 0),
  serving_unit text not null default '食',
  is_intermediate boolean not null default false,
  notes text,
  source_file text,
  source_sheet text,
  source_reference text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dining_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.dining_recipes(id) on delete cascade,
  dining_item_id uuid references public.dining_items(id) on delete restrict,
  intermediate_recipe_id uuid references public.dining_recipes(id) on delete restrict,
  quantity numeric not null default 0 check (quantity >= 0),
  unit text not null default 'g',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dining_recipe_items_one_source check (
    num_nonnulls(dining_item_id, intermediate_recipe_id) = 1
  ),
  constraint dining_recipe_items_recipe_sort_unique unique (recipe_id, sort_order)
);

create index if not exists dining_items_type_sort_idx
  on public.dining_items(item_type, sort_order, name);
create index if not exists dining_recipes_sort_idx
  on public.dining_recipes(is_intermediate, sort_order, name);
create index if not exists dining_recipe_items_recipe_idx
  on public.dining_recipe_items(recipe_id, sort_order);

create or replace function public.set_dining_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dining_items_set_updated_at on public.dining_items;
create trigger dining_items_set_updated_at
before update on public.dining_items
for each row execute function public.set_dining_updated_at();

drop trigger if exists dining_recipes_set_updated_at on public.dining_recipes;
create trigger dining_recipes_set_updated_at
before update on public.dining_recipes
for each row execute function public.set_dining_updated_at();

drop trigger if exists dining_recipe_items_set_updated_at on public.dining_recipe_items;
create trigger dining_recipe_items_set_updated_at
before update on public.dining_recipe_items
for each row execute function public.set_dining_updated_at();

alter table public.dining_items enable row level security;
alter table public.dining_recipes enable row level security;
alter table public.dining_recipe_items enable row level security;

revoke all on table public.dining_items from anon, authenticated;
revoke all on table public.dining_recipes from anon, authenticated;
revoke all on table public.dining_recipe_items from anon, authenticated;

insert into public.dining_items
  (id, name, item_type, purchase_quantity, yield_quantity, price_incl_tax, unit, notes, source_file, source_sheet, source_reference, sort_order)
values
  ('d1000000-0000-4000-8000-000000000001', '清湯', 'food', 2000, 2000, 1987.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'O3:T3', 1),
  ('d1000000-0000-4000-8000-000000000002', '豚骨', 'food', 2000, 2000, 1447.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'O4:T4', 2),
  ('d1000000-0000-4000-8000-000000000003', '煮汁（水・原価0）', 'food', 6000, 6000, 0, 'g', 'スープの出来高計算用。仕入原価は0円。', '【重要】メニュー原価率.xlsx', '2025年', 'C3', 3),
  ('d1000000-0000-4000-8000-000000000004', '醤油だれ', 'food', 18000, 100800, 12519.36, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C4:I4', 4),
  ('d1000000-0000-4000-8000-000000000005', 'にぼし油1500（にぼし200g）', 'food', 4900, 4400, 1954.8, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C5:I5', 5),
  ('d1000000-0000-4000-8000-000000000006', '麺', 'food', 130, 130, 64.8, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C6:I6', 6),
  ('d1000000-0000-4000-8000-000000000007', 'チャーシュー', 'food', 131000, 131000, 160515, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C7:I7', 7),
  ('d1000000-0000-4000-8000-000000000008', 'メンマ', 'food', 1000, 1000, 928.8, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C8:I8', 8),
  ('d1000000-0000-4000-8000-000000000009', 'ナルト', 'food', 150, 140, 138.24, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C9:I9', 9),
  ('d1000000-0000-4000-8000-000000000010', '海苔400枚', 'food', 400, 400, 3088.8, '枚', null, '【重要】メニュー原価率.xlsx', '2025年', 'C10:I10', 10),
  ('d1000000-0000-4000-8000-000000000011', '小ネギ', 'food', 90, 80, 259.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C11:I11', 11),
  ('d1000000-0000-4000-8000-000000000012', '塩ダレ（山塩）', 'food', 1000, 1000, 2592, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C12:I12', 12),
  ('d1000000-0000-4000-8000-000000000013', 'ネギ油1500（ネギ500g・生姜300g）', 'food', 3800, 3500, 1558.65, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C13:I13', 13),
  ('d1000000-0000-4000-8000-000000000014', '塩ダレ（帆立）', 'food', 18000, 18000, 13867.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C14:I14', 14),
  ('d1000000-0000-4000-8000-000000000015', 'ワカメ', 'food', 150, 1500, 648, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C20:I20', 15),
  ('d1000000-0000-4000-8000-000000000016', '炒りごま', 'food', 1000, 1000, 723.6, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C22:I22', 16),
  ('d1000000-0000-4000-8000-000000000017', '料理酒', 'food', 1800, 1800, 356.4, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C25:I25', 17),
  ('d1000000-0000-4000-8000-000000000018', '油', 'food', 16500, 16500, 5184, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C26:I26', 18),
  ('d1000000-0000-4000-8000-000000000019', 'ごま油', 'food', 1650, 1650, 2068.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C27:I27', 19),
  ('d1000000-0000-4000-8000-000000000020', '味噌', 'food', 20000, 20000, 4438.8, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C30:I30', 20),
  ('d1000000-0000-4000-8000-000000000021', '玉ねぎ', 'food', 1000, 900, 378, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C31:I31', 21),
  ('d1000000-0000-4000-8000-000000000022', 'ニンジン', 'food', 1000, 930, 432, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C32:I32', 22),
  ('d1000000-0000-4000-8000-000000000023', 'もやし（価格確認）', 'food', 250, 250, 48.6, 'g', '原本に価格確認の注記あり。', '【重要】メニュー原価率.xlsx', '2025年', 'C33:I33', 23),
  ('d1000000-0000-4000-8000-000000000024', 'チャーシューフレーク（自社）', 'food', 131000, 131000, 160515, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C34:I34', 24),
  ('d1000000-0000-4000-8000-000000000025', 'ニンニク', 'food', 1000, 900, 772.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C35:I35', 25),
  ('d1000000-0000-4000-8000-000000000026', '七味', 'food', 300, 300, 572.4, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C36:I36', 26),
  ('d1000000-0000-4000-8000-000000000027', 'ハイミー', 'food', 1000, 1000, 2089.8, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C37:I37', 27),
  ('d1000000-0000-4000-8000-000000000028', 'ニラ', 'food', 100, 90, 181.44, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C38:I38', 28),
  ('d1000000-0000-4000-8000-000000000029', 'グラニュー糖', 'food', 1000, 1000, 313.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C39:I39', 29),
  ('d1000000-0000-4000-8000-000000000030', 'ロースカツ160g（枚数）', 'food', 1, 1, 240.516, '枚', null, '【重要】メニュー原価率.xlsx', '2025年', 'C40:I40', 30),
  ('d1000000-0000-4000-8000-000000000031', 'ソース（調理後）', 'food', 2700, 2600, 552.9, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C41:I41', 31),
  ('d1000000-0000-4000-8000-000000000032', 'キャベツ（冬）', 'food', 1000, 850, 518.4, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C42:I42', 32),
  ('d1000000-0000-4000-8000-000000000033', 'ご飯', 'food', 27000, 59400, 15000, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C43:I43', 33),
  ('d1000000-0000-4000-8000-000000000034', '味噌汁味噌', 'food', 3000, 2850, 1706.4, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C44:I44', 34),
  ('d1000000-0000-4000-8000-000000000035', '味噌汁具材', 'food', 150, 150, 1339.2, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C45:I45', 35),
  ('d1000000-0000-4000-8000-000000000036', '青がっぱ', 'food', 1000, 1000, 275.4, 'g', null, '【重要】メニュー原価率.xlsx', '2025年', 'C46:I46', 36)
on conflict (id) do nothing;

insert into public.dining_recipes
  (id, name, menu_group, selling_price, serving_yield, serving_unit, is_intermediate, notes, source_file, source_sheet, source_reference, sort_order)
values
  ('d2000000-0000-4000-8000-000000000001', 'スープ（2025年原価計算）', '中間仕込み', 0, 9000, 'g', true, 'Excelの実計算を採用。行名は清湯500g表記ですが、参照セルS3は清湯1,000gです。清湯1,000g＋豚骨500g＋煮汁6,000g、出来高9,000gとして登録。', '【重要】メニュー原価率.xlsx', '2025年', 'C3・O2:T5', 1),
  ('d2000000-0000-4000-8000-000000000002', '喜多方ラーメン', '三大ラーメン', 780, 1, '食', false, null, '【重要】メニュー原価率.xlsx', '2025年', 'B3:M11', 10),
  ('d2000000-0000-4000-8000-000000000003', '山塩ラーメン', '三大ラーメン', 880, 1, '食', false, null, '【重要】メニュー原価率.xlsx', '2025年', 'B12:M22', 20),
  ('d2000000-0000-4000-8000-000000000004', '味噌ラーメン', '三大ラーメン', 880, 1, '食', false, null, '【重要】メニュー原価率.xlsx', '2025年', 'B23:M39', 30),
  ('d2000000-0000-4000-8000-000000000005', 'ソースカツ丼', 'ソースカツ丼', 1000, 1, '食', false, null, '【重要】メニュー原価率.xlsx', '2025年', 'B40:M46', 40)
on conflict (id) do nothing;

insert into public.dining_recipe_items
  (recipe_id, dining_item_id, intermediate_recipe_id, quantity, unit, sort_order, notes)
values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', null, 1000, 'g', 1, 'Excel参照セルS3を採用'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', null, 500, 'g', 2, null),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', null, 6000, 'g', 3, null),

  ('d2000000-0000-4000-8000-000000000002', null, 'd2000000-0000-4000-8000-000000000001', 270, 'g', 1, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004', null, 30, 'g', 2, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000005', null, 22, 'g', 3, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000006', null, 130, 'g', 4, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000007', null, 25, 'g', 5, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000008', null, 25, 'g', 6, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000009', null, 5, 'g', 7, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000010', null, 1, '枚', 8, null),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000011', null, 4, 'g', 9, null),

  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000012', null, 10, 'g', 1, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000013', null, 22, 'g', 2, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000014', null, 20, 'g', 3, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000006', null, 130, 'g', 4, null),
  ('d2000000-0000-4000-8000-000000000003', null, 'd2000000-0000-4000-8000-000000000001', 270, 'g', 5, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000007', null, 25, 'g', 6, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000008', null, 25, 'g', 7, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000009', null, 5, 'g', 8, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000015', null, 20, 'g', 9, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000011', null, 4, 'g', 10, null),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000016', null, 5, 'g', 11, null),

  ('d2000000-0000-4000-8000-000000000004', null, 'd2000000-0000-4000-8000-000000000001', 270, 'g', 1, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000006', null, 130, 'g', 2, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000017', null, 25, 'g', 3, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000018', null, 10, 'g', 4, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000019', null, 8, 'g', 5, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000011', null, 4, 'g', 6, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000016', null, 5, 'g', 7, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000020', null, 50, 'g', 8, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000021', null, 25, 'g', 9, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000022', null, 10, 'g', 10, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000023', null, 125, 'g', 11, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000024', null, 30, 'g', 12, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000025', null, 6, 'g', 13, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000026', null, 0.5, 'g', 14, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000027', null, 5, 'g', 15, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000028', null, 3, 'g', 16, null),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000029', null, 6, 'g', 17, null),

  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000030', null, 1, '枚', 1, null),
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000031', null, 50, 'g', 2, null),
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000032', null, 30, 'g', 3, null),
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000033', null, 140, 'g', 4, null),
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000034', null, 15, 'g', 5, null),
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000035', null, 2, 'g', 6, null),
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000036', null, 8, 'g', 7, null)
on conflict (recipe_id, sort_order) do nothing;
