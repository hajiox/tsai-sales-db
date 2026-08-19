create extension if not exists pgcrypto;

create table if not exists public.shipping_label_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('amazon', 'yahoo')),
  source_file_name text not null,
  source_row_count integer not null default 0 check (source_row_count >= 0),
  source_rows jsonb not null default '[]'::jsonb,
  sender_settings jsonb not null default '{}'::jsonb,
  conversion_snapshot jsonb not null default '{}'::jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipping_label_exports (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.shipping_label_imports(id) on delete cascade,
  carrier text not null check (carrier in ('yamato', 'sagawa')),
  file_name text not null,
  row_count integer not null default 0 check (row_count >= 0),
  csv_content text not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_shipping_label_imports_created_at
  on public.shipping_label_imports (created_at desc);

create index if not exists idx_shipping_label_imports_source_created_at
  on public.shipping_label_imports (source, created_at desc);

create index if not exists idx_shipping_label_exports_import_created_at
  on public.shipping_label_exports (import_id, created_at desc);

alter table public.shipping_label_imports enable row level security;
alter table public.shipping_label_exports enable row level security;

revoke all on table public.shipping_label_imports from anon, authenticated;
revoke all on table public.shipping_label_exports from anon, authenticated;

create or replace function public.set_shipping_label_imports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shipping_label_imports_updated_at on public.shipping_label_imports;
create trigger trg_shipping_label_imports_updated_at
before update on public.shipping_label_imports
for each row
execute function public.set_shipping_label_imports_updated_at();

comment on table public.shipping_label_imports is 'Shipping label source imports and conversion snapshots. Contains customer shipping data.';
comment on table public.shipping_label_exports is 'Exact Yamato B2 and Sagawa CSV files generated from a shipping label import.';
