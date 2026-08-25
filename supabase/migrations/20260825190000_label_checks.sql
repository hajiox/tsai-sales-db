create extension if not exists pgcrypto;

create table if not exists public.label_checks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique default gen_random_uuid(),
  mode text not null check (mode in ('simple', 'normal')),
  file_name text,
  file_hash text,
  product_name text,
  raw_materials text,
  expiry_date_printed text,
  expiry_date_normalized date,
  manufacturing_date date,
  matched_recipe_id uuid references public.recipes(id) on delete set null,
  matched_recipe_name text,
  shelf_life text,
  shelf_life_days integer,
  expected_expiry date,
  judgment text not null check (judgment in ('OK', 'NG', 'UNKNOWN', 'MANUAL')),
  deviation_percent numeric(10, 2),
  deviation_days integer,
  confidence numeric(6, 5),
  source text not null default 'tsa' check (source in ('tsa', 'mobile', 'upload', 'scanner', 'migration')),
  notes text,
  label_data jsonb not null default '{}'::jsonb,
  document_id text,
  checked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.label_check_images (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.label_checks(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  byte_size integer not null check (byte_size >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists label_checks_created_at_idx
  on public.label_checks (created_at desc);
create index if not exists label_checks_mode_created_at_idx
  on public.label_checks (mode, created_at desc);
create index if not exists label_checks_judgment_created_at_idx
  on public.label_checks (judgment, created_at desc);
create index if not exists label_checks_recipe_idx
  on public.label_checks (matched_recipe_id)
  where matched_recipe_id is not null;
create index if not exists label_check_images_check_id_idx
  on public.label_check_images (check_id, sort_order);

alter table public.label_checks enable row level security;
alter table public.label_check_images enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'label-check-images',
  'label-check-images',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.label_checks is 'TSA裏ラベルチェックの通常・簡易判定履歴';
comment on table public.label_check_images is '裏ラベルチェック画像の非公開Storage参照';
