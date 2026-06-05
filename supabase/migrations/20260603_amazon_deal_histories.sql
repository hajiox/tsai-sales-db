create extension if not exists pgcrypto;

create table if not exists public.amazon_deal_histories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'exported')),
  file_name text,
  sheet_name text,
  row_count integer not null default 0,
  participating_count integer not null default 0,
  not_participating_count integer not null default 0,
  best_deal_count integer not null default 0,
  lightning_deal_count integer not null default 0,
  warning_count integer not null default 0,
  payload jsonb not null,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amazon_deal_histories_created_at_idx
  on public.amazon_deal_histories (created_at desc);

create index if not exists amazon_deal_histories_status_created_at_idx
  on public.amazon_deal_histories (status, created_at desc);

alter table public.amazon_deal_histories enable row level security;

revoke all on table public.amazon_deal_histories from anon;
revoke all on table public.amazon_deal_histories from authenticated;
