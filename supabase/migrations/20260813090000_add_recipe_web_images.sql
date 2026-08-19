begin;

create table if not exists public.recipe_web_images (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  image_url text not null,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'rakuten', 'base', 'shared_folder')),
  source_page_url text,
  source_image_url text,
  original_filename text,
  file_size_bytes integer not null check (file_size_bytes > 0 and file_size_bytes <= 256000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists recipe_web_images_recipe_sort_idx
  on public.recipe_web_images(recipe_id, sort_order, created_at);

create unique index if not exists recipe_web_images_source_unique_idx
  on public.recipe_web_images(recipe_id, source_image_url)
  where source_image_url is not null;

alter table public.recipe_web_images enable row level security;
revoke all on table public.recipe_web_images from anon, authenticated;

comment on table public.recipe_web_images is
  'EC商品ページ向け画像。製造・印刷用の商品写真とは分離して管理する。';
comment on column public.recipe_web_images.file_size_bytes is
  'アップロード後の実ファイルサイズ。Web用上限250KiB。';

commit;
