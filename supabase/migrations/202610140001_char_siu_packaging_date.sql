-- Preserve production_date as the cooking date used by existing scans and cost reports.
alter table public.char_siu_production_runs
  add column if not exists packaging_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.char_siu_production_runs'::regclass
      and conname = 'char_siu_production_runs_packaging_date_check'
  ) then
    alter table public.char_siu_production_runs
      add constraint char_siu_production_runs_packaging_date_check
      check (packaging_date is null or packaging_date >= production_date);
  end if;
end;
$$;

comment on column public.char_siu_production_runs.production_date is
  'Cooking date; retained as the delivery-note, labor-rate and monthly-report reference date.';
comment on column public.char_siu_production_runs.packaging_date is
  'Packaging date, no earlier than cooking. NULL means not registered; existing dates are not inferred.';
