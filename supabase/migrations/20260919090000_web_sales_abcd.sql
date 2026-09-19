-- Atomic immutable snapshots; only the authenticated admin server may access them.
create table if not exists public.web_sales_abcd_snapshots (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('amazon','rakuten','yahoo','qoo10','tiktok','base','mercari')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  metric text not null,
  scope text not null,
  source text not null,
  item_count integer not null check (item_count between 1 and 5000),
  content_hash text not null unique,
  payload jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists web_sales_abcd_history on public.web_sales_abcd_snapshots(channel, period_end desc, created_at desc);
alter table public.web_sales_abcd_snapshots enable row level security;
revoke all on public.web_sales_abcd_snapshots from anon, authenticated;
grant select, insert on public.web_sales_abcd_snapshots to service_role;

create table if not exists public.web_sales_abcd_actions (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.web_sales_abcd_snapshots(id),
  product_key text not null,
  action_date date not null,
  description text not null check (length(description) between 1 and 1000),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists web_sales_abcd_actions_snapshot on public.web_sales_abcd_actions(snapshot_id);
alter table public.web_sales_abcd_actions enable row level security;
revoke all on public.web_sales_abcd_actions from anon, authenticated;
grant select, insert on public.web_sales_abcd_actions to service_role;
