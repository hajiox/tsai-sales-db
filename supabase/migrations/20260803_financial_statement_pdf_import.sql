create extension if not exists pgcrypto;

create table if not exists public.financial_statement_uploads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  period_number integer,
  fiscal_year integer not null,
  period_start date not null,
  period_end date not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint not null default 0,
  page_count integer not null default 0,
  source_hash text not null,
  parser_version text not null,
  source_text text not null,
  warnings jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_statement_period_order check (period_start <= period_end),
  constraint financial_statement_hash_format check (source_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists uq_financial_statement_company_period
  on public.financial_statement_uploads (company_name, period_start, period_end);

create index if not exists idx_financial_statement_period_end
  on public.financial_statement_uploads (period_end desc, created_at desc);

create table if not exists public.financial_statement_accounts (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.financial_statement_uploads(id) on delete cascade,
  statement_type text not null check (statement_type in ('bs', 'pl', 'sga', 'equity', 'notes')),
  section text,
  account_name text not null,
  amount bigint,
  row_no integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_financial_statement_account_row
  on public.financial_statement_accounts (upload_id, statement_type, row_no);

create index if not exists idx_financial_statement_account_lookup
  on public.financial_statement_accounts (upload_id, statement_type, account_name);

create table if not exists public.financial_statement_metrics (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.financial_statement_uploads(id) on delete cascade,
  metric_key text not null,
  label text not null,
  category text not null,
  amount bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_financial_statement_metric
  on public.financial_statement_metrics (upload_id, metric_key);

create index if not exists idx_financial_statement_metric_history
  on public.financial_statement_metrics (metric_key, upload_id);

alter table public.financial_statement_uploads enable row level security;
alter table public.financial_statement_accounts enable row level security;
alter table public.financial_statement_metrics enable row level security;

comment on table public.financial_statement_uploads is
  'TSA財務分析へ取り込んだ年次決算書PDFの解析履歴。原本PDFは保存せず、ハッシュと抽出テキストを保存する。';
comment on table public.financial_statement_accounts is
  '決算書PDFから抽出した貸借対照表、損益計算書、販管費内訳、株主資本等変動計算書、注記の明細。';
comment on table public.financial_statement_metrics is
  '決算期比較に使う借入金、棚卸資産、売上、利益等の正規化指標。';
