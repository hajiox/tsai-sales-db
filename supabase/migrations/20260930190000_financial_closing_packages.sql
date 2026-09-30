-- Closing PDFs contain private tax/payroll/account details. No public storage or
-- anon/authenticated table policy is created; access is through finance API only.
create table if not exists public.financial_statement_documents (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.financial_statement_uploads(id) on delete cascade,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint not null check (file_size between 0 and 20971520),
  page_count integer not null check (page_count between 0 and 400),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  parser_version text not null,
  pdf_bytes bytea,
  source_text text not null,
  document_kinds jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  parsed_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint financial_statement_document_bytes check (pdf_bytes is null or octet_length(pdf_bytes) = file_size),
  unique (upload_id, source_hash)
);
create index if not exists idx_financial_statement_documents_upload on public.financial_statement_documents(upload_id, created_at);

create table if not exists public.financial_statement_document_pages (
  document_id uuid not null references public.financial_statement_documents(id) on delete cascade,
  page_number integer not null check (page_number between 1 and 400),
  document_kind text not null,
  label text not null,
  source_text text not null,
  normalized_text text not null,
  records_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  primary key (document_id, page_number)
);

create table if not exists public.financial_statement_supplemental_records (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.financial_statement_documents(id) on delete cascade,
  page_number integer not null,
  row_no integer not null,
  section text not null,
  account_name text not null,
  amount bigint,
  raw_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (document_id, page_number) references public.financial_statement_document_pages(document_id, page_number) on delete cascade
);
create index if not exists idx_financial_statement_supplemental_document on public.financial_statement_supplemental_records(document_id, page_number, row_no);

alter table public.financial_statement_uploads add column if not exists primary_document_id uuid references public.financial_statement_documents(id);

-- Preserve legacy parsed source before a newly verified final package becomes the
-- primary. Legacy PDF bytes cannot be recovered; authenticated download says so.
insert into public.financial_statement_documents
  (upload_id, file_name, file_size, page_count, source_hash, parser_version, source_text, warnings, validation, parsed_snapshot)
select u.id, u.file_name, least(u.file_size, 20971520), least(u.page_count, 400), u.source_hash, u.parser_version, u.source_text,
       u.warnings, u.validation,
       jsonb_build_object('legacy', true, 'metrics', coalesce((select jsonb_agg(to_jsonb(m)) from public.financial_statement_metrics m where m.upload_id = u.id), '[]'::jsonb),
                          'accounts', coalesce((select jsonb_agg(to_jsonb(a)) from public.financial_statement_accounts a where a.upload_id = u.id), '[]'::jsonb))
from public.financial_statement_uploads u
on conflict (upload_id, source_hash) do nothing;

create table if not exists public.financial_statement_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  file_name text not null,
  file_size integer not null check (file_size between 1 and 20971520),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  total_chunks integer not null check (total_chunks between 1 and 10),
  period_id uuid references public.financial_statement_uploads(id),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now()
);
create table if not exists public.financial_statement_upload_chunks (
  session_id uuid not null references public.financial_statement_upload_sessions(id) on delete cascade,
  chunk_index integer not null check (chunk_index between 0 and 9),
  chunk_bytes bytea not null check (octet_length(chunk_bytes) between 1 and 2097152),
  chunk_hash text not null check (chunk_hash ~ '^[0-9a-f]{64}$'),
  primary key (session_id, chunk_index)
);
create index if not exists idx_financial_statement_upload_sessions_expiry on public.financial_statement_upload_sessions(expires_at);

alter table public.financial_statement_documents enable row level security;
alter table public.financial_statement_document_pages enable row level security;
alter table public.financial_statement_supplemental_records enable row level security;
alter table public.financial_statement_upload_sessions enable row level security;
alter table public.financial_statement_upload_chunks enable row level security;
revoke all on public.financial_statement_documents, public.financial_statement_document_pages,
  public.financial_statement_supplemental_records, public.financial_statement_upload_sessions,
  public.financial_statement_upload_chunks from anon, authenticated;

comment on table public.financial_statement_documents is '決算資料一式の機密PDF原本と解析スナップショット。年度内の別資料は追加保存しハッシュで重複防止。';
comment on table public.financial_statement_document_pages is '原本の全ページと座標再構成本文・資料分類。未分類や空ページも削除しない。';
comment on table public.financial_statement_supplemental_records is '税務・借入・在庫・固定資産等の資料明細と原文根拠。曖昧な数値はamount=null。';
comment on table public.financial_statement_upload_sessions is 'Vercel body上限を回避する認証済みPDF分割アップロード。tokenはhashのみ、2時間で期限切れ。';
