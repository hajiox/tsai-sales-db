create extension if not exists pgcrypto;

create table if not exists public.trial_balance_uploads (
  id uuid primary key default gen_random_uuid(),
  report_month date not null,
  company_name text,
  period_label text,
  file_name text not null,
  encoding text not null,
  file_size bigint not null default 0,
  source_text text not null,
  row_count integer not null default 0,
  bs_row_count integer not null default 0,
  pl_row_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_trial_balance_uploads_report_month
  on public.trial_balance_uploads (report_month desc, created_at desc);

create table if not exists public.trial_balance_accounts (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.trial_balance_uploads(id) on delete cascade,
  report_month date not null,
  statement_type text not null check (statement_type in ('bs', 'pl')),
  account_code text not null,
  account_name text not null,
  opening_balance bigint not null default 0,
  debit_amount bigint not null default 0,
  credit_amount bigint not null default 0,
  closing_balance bigint not null default 0,
  ratio numeric,
  row_no integer not null,
  is_summary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_trial_balance_accounts_month_code
  on public.trial_balance_accounts (report_month, account_code);

create index if not exists idx_trial_balance_accounts_upload_order
  on public.trial_balance_accounts (upload_id, statement_type, row_no);

create unique index if not exists uq_trial_balance_accounts_upload_row
  on public.trial_balance_accounts (upload_id, statement_type, row_no);
