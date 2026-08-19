-- Cost-source snapshots for char siu production.

alter table public.char_siu_production_settings
  add column if not exists labor_rate_staff_count integer not null default 0 check (labor_rate_staff_count >= 0),
  add column if not exists labor_rate_excluded_count integer not null default 0 check (labor_rate_excluded_count >= 0),
  add column if not exists labor_rate_effective_date date,
  add column if not exists labor_rate_synced_at timestamptz,
  add column if not exists labor_rate_source text not null default 'not_synced';

alter table public.char_siu_production_runs
  add column if not exists labor_rate_staff_count integer not null default 0 check (labor_rate_staff_count >= 0),
  add column if not exists labor_rate_excluded_count integer not null default 0 check (labor_rate_excluded_count >= 0),
  add column if not exists labor_rate_source text not null default 'legacy',
  add column if not exists labor_rate_synced_at timestamptz;

alter table public.char_siu_production_materials
  add column if not exists price_source text not null default 'legacy',
  add column if not exists source_reference text,
  add column if not exists source_confidence numeric(5, 4),
  add column if not exists source_note text;

create table if not exists public.char_siu_delivery_note_scans (
  id uuid primary key default gen_random_uuid(),
  document_date date,
  file_names text[] not null default '{}',
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'needs_review', 'used', 'error')),
  extracted_items jsonb not null default '[]'::jsonb,
  error_message text,
  used_run_id uuid references public.char_siu_production_runs(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists char_siu_delivery_note_scans_created_idx
  on public.char_siu_delivery_note_scans(created_at desc);

create index if not exists char_siu_delivery_note_scans_run_idx
  on public.char_siu_delivery_note_scans(used_run_id)
  where used_run_id is not null;

alter table public.char_siu_delivery_note_scans enable row level security;
revoke all on table public.char_siu_delivery_note_scans from anon, authenticated;

drop trigger if exists update_char_siu_delivery_note_scans_updated_at on public.char_siu_delivery_note_scans;
create trigger update_char_siu_delivery_note_scans_updated_at
  before update on public.char_siu_delivery_note_scans
  for each row execute function public.set_char_siu_production_updated_at();
