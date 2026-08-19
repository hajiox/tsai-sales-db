create extension if not exists pgcrypto;

create table if not exists public.brand_store_inventory_counts (
  id uuid primary key default gen_random_uuid(),
  inventory_date date not null default current_date,
  source_start_month date not null,
  source_end_month date not null,
  status text not null default 'draft'
    check (status in ('draft', 'completed')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_store_inventory_items (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.brand_store_inventory_counts(id) on delete cascade,
  source_key text,
  source_product_id integer,
  product_name text not null,
  selling_price numeric(12, 2),
  wholesale_price numeric(12, 2),
  quantity integer,
  note text not null default '',
  annual_quantity_sold integer not null default 0,
  last_sold_month date,
  sort_order integer not null default 0,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (selling_price is null or selling_price >= 0),
  check (wholesale_price is null or wholesale_price >= 0),
  check (quantity is null or quantity >= 0)
);

create unique index if not exists idx_brand_store_inventory_items_source
  on public.brand_store_inventory_items (inventory_id, source_key)
  where source_key is not null;

create index if not exists idx_brand_store_inventory_counts_date
  on public.brand_store_inventory_counts (inventory_date desc, created_at desc);

create index if not exists idx_brand_store_inventory_items_inventory
  on public.brand_store_inventory_items (inventory_id, sort_order, product_name);

alter table public.brand_store_inventory_counts enable row level security;
alter table public.brand_store_inventory_items enable row level security;

revoke all on table public.brand_store_inventory_counts from anon, authenticated;
revoke all on table public.brand_store_inventory_items from anon, authenticated;

create or replace function public.set_brand_store_inventory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_brand_store_inventory_counts_updated_at on public.brand_store_inventory_counts;
create trigger trg_brand_store_inventory_counts_updated_at
before update on public.brand_store_inventory_counts
for each row execute function public.set_brand_store_inventory_updated_at();

drop trigger if exists trg_brand_store_inventory_items_updated_at on public.brand_store_inventory_items;
create trigger trg_brand_store_inventory_items_updated_at
before update on public.brand_store_inventory_items
for each row execute function public.set_brand_store_inventory_updated_at();
