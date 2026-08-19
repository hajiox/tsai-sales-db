create table if not exists public.pc_backup_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  backup_type text not null check (backup_type in ('daily_data', 'weekly_system_image', 'manual_test')),
  status text not null check (status in ('running', 'success', 'warning', 'failed')),
  worker_id text not null default 'tsa-office-01',
  host_name text,
  started_at timestamptz not null,
  completed_at timestamptz,
  bytes_total bigint not null default 0,
  file_count integer not null default 0,
  nas_path text,
  cloud_path text,
  usb_path text,
  database_checks jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pc_backup_runs_started_at_idx
  on public.pc_backup_runs (started_at desc);

create index if not exists pc_backup_runs_type_status_idx
  on public.pc_backup_runs (backup_type, status, started_at desc);

alter table public.pc_backup_runs enable row level security;

revoke all on table public.pc_backup_runs from anon, authenticated;
grant all on table public.pc_backup_runs to service_role;

