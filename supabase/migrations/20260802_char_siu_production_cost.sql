-- Char siu production actuals and administrator-only cost allocation.

create table if not exists public.char_siu_production_settings (
  id smallint primary key default 1 check (id = 1),
  hourly_wage numeric(12, 2) not null default 0 check (hourly_wage >= 0),
  block_unit_weight_g numeric(12, 2) not null default 1000 check (block_unit_weight_g > 0),
  lard_unit_weight_g numeric(12, 2) not null default 50 check (lard_unit_weight_g > 0),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.char_siu_production_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.char_siu_production_runs (
  id uuid primary key default gen_random_uuid(),
  production_date date not null,
  worker_count integer not null check (worker_count > 0),
  work_hours numeric(10, 2) not null check (work_hours >= 0),
  hourly_wage numeric(12, 4) not null default 0 check (hourly_wage >= 0),
  total_person_hours numeric(12, 2) not null default 0 check (total_person_hours >= 0),
  material_cost numeric(14, 4) not null default 0 check (material_cost >= 0),
  labor_cost numeric(14, 4) not null default 0 check (labor_cost >= 0),
  total_cost numeric(14, 4) not null default 0 check (total_cost >= 0),
  total_output_quantity integer not null default 0 check (total_output_quantity >= 0),
  total_output_weight_g numeric(14, 2) not null default 0 check (total_output_weight_g >= 0),
  average_cost_per_item numeric(14, 4),
  average_cost_per_kg numeric(14, 4),
  notes text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.char_siu_production_materials (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.char_siu_production_runs(id) on delete cascade,
  material_key text not null check (material_key in ('pork_belly', 'green_onion', 'ginger', 'soy_sauce', 'sake', 'haimi')),
  ingredient_id uuid references public.ingredients(id) on delete set null,
  material_name text not null,
  usage_amount numeric(14, 3) not null default 0 check (usage_amount >= 0),
  usage_unit text not null check (usage_unit in ('g', 'ml')),
  purchase_unit_quantity numeric(14, 4) not null check (purchase_unit_quantity > 0),
  purchase_price_tax_included numeric(14, 4) not null check (purchase_price_tax_included >= 0),
  unit_cost numeric(14, 8) not null check (unit_cost >= 0),
  material_cost numeric(14, 4) not null default 0 check (material_cost >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, material_key)
);

create table if not exists public.char_siu_production_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.char_siu_production_runs(id) on delete cascade,
  output_key text not null check (output_key in ('chashu_wakeari_800', 'chashu_slice_700', 'retort_thick_600', 'retort_medium_380', 'retort_cut_600', 'block', 'lard')),
  recipe_id uuid references public.recipes(id) on delete set null,
  output_name text not null,
  quantity integer not null default 0 check (quantity >= 0),
  unit_weight_g numeric(12, 2) not null check (unit_weight_g > 0),
  output_weight_g numeric(14, 2) not null default 0 check (output_weight_g >= 0),
  allocation_ratio numeric(12, 8) not null default 0 check (allocation_ratio >= 0 and allocation_ratio <= 1),
  allocated_cost numeric(14, 4) not null default 0 check (allocated_cost >= 0),
  unit_cost numeric(14, 4),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, output_key)
);

create index if not exists char_siu_production_runs_date_idx
  on public.char_siu_production_runs(production_date desc, created_at desc);

create index if not exists char_siu_production_materials_run_idx
  on public.char_siu_production_materials(run_id, sort_order);

create index if not exists char_siu_production_outputs_run_idx
  on public.char_siu_production_outputs(run_id, sort_order);

alter table public.char_siu_production_settings enable row level security;
alter table public.char_siu_production_runs enable row level security;
alter table public.char_siu_production_materials enable row level security;
alter table public.char_siu_production_outputs enable row level security;

revoke all on table public.char_siu_production_settings from anon, authenticated;
revoke all on table public.char_siu_production_runs from anon, authenticated;
revoke all on table public.char_siu_production_materials from anon, authenticated;
revoke all on table public.char_siu_production_outputs from anon, authenticated;

create or replace function public.set_char_siu_production_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_char_siu_production_settings_updated_at on public.char_siu_production_settings;
create trigger update_char_siu_production_settings_updated_at
  before update on public.char_siu_production_settings
  for each row execute function public.set_char_siu_production_updated_at();

drop trigger if exists update_char_siu_production_runs_updated_at on public.char_siu_production_runs;
create trigger update_char_siu_production_runs_updated_at
  before update on public.char_siu_production_runs
  for each row execute function public.set_char_siu_production_updated_at();

drop trigger if exists update_char_siu_production_materials_updated_at on public.char_siu_production_materials;
create trigger update_char_siu_production_materials_updated_at
  before update on public.char_siu_production_materials
  for each row execute function public.set_char_siu_production_updated_at();

drop trigger if exists update_char_siu_production_outputs_updated_at on public.char_siu_production_outputs;
create trigger update_char_siu_production_outputs_updated_at
  before update on public.char_siu_production_outputs
  for each row execute function public.set_char_siu_production_updated_at();
