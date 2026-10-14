-- Existing aggregate labor snapshots remain unchanged and have no inferred stage split.
alter table public.char_siu_production_runs
  add column if not exists cooking_worker_count integer,
  add column if not exists cooking_work_hours numeric,
  add column if not exists packaging_worker_count integer,
  add column if not exists packaging_work_hours numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.char_siu_production_runs'::regclass
      and conname = 'char_siu_production_runs_stage_labor_check'
  ) then
    alter table public.char_siu_production_runs
      add constraint char_siu_production_runs_stage_labor_check check (
        (cooking_worker_count is null and cooking_work_hours is null
          and packaging_worker_count is null and packaging_work_hours is null)
        or
        (cooking_worker_count is not null and cooking_worker_count > 0
          and cooking_work_hours is not null and cooking_work_hours > 0 and cooking_work_hours < 'Infinity'::numeric
          and packaging_worker_count is not null and packaging_worker_count > 0
          and packaging_work_hours is not null and packaging_work_hours > 0 and packaging_work_hours < 'Infinity'::numeric)
      );
  end if;
end;
$$;

comment on column public.char_siu_production_runs.cooking_worker_count is
  'Cooking-stage worker count. All four stage labor fields are NULL for legacy aggregate records.';
comment on column public.char_siu_production_runs.cooking_work_hours is
  'Cooking hours per worker. Stage hours are not independently rounded before person-hour summation.';
comment on column public.char_siu_production_runs.packaging_worker_count is
  'Packaging-stage worker count, independent of cooking-stage worker count.';
comment on column public.char_siu_production_runs.packaging_work_hours is
  'Packaging hours per worker. total_person_hours sums both stages before existing final rounding.';
