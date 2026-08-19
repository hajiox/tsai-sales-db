create extension if not exists pgcrypto;

create table if not exists public.shipping_label_mappings (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  amazon_name text not null default '',
  label_name text not null default '',
  amazon_pattern text not null default '',
  delivery_pattern text not null default '未設定'
    check (delivery_pattern in ('通常', '冷凍', '冷蔵', 'ネコポス', '未設定')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipping_label_mappings_delivery_pattern
  on public.shipping_label_mappings (delivery_pattern);

create index if not exists idx_shipping_label_mappings_sort_order
  on public.shipping_label_mappings (sort_order, sku);

alter table public.shipping_label_mappings enable row level security;

revoke all on table public.shipping_label_mappings from anon, authenticated;

create or replace function public.set_shipping_label_mappings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shipping_label_mappings_updated_at on public.shipping_label_mappings;
create trigger trg_shipping_label_mappings_updated_at
before update on public.shipping_label_mappings
for each row
execute function public.set_shipping_label_mappings_updated_at();
