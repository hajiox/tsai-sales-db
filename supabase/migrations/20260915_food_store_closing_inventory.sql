create table if not exists public.food_store_closing_inventories (
  id uuid primary key default gen_random_uuid(),
  fiscal_year integer not null unique check (fiscal_year between 2000 and 2100),
  inventory_date date not null,
  status text not null default 'draft' check (status in ('draft','completed')),
  revision integer not null default 1 check (revision > 0),
  source_filename text not null,
  source_sha256 text not null,
  original_workbook jsonb not null,
  workbook jsonb not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(workbook->'sheets') = 'array'),
  check (jsonb_typeof(original_workbook->'sheets') = 'array')
);
create table if not exists public.food_store_closing_inventory_history (
  id bigint generated always as identity primary key,
  inventory_id uuid not null references public.food_store_closing_inventories(id),
  revision integer not null,
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  unique(inventory_id, revision)
);
alter table public.food_store_closing_inventories enable row level security;
alter table public.food_store_closing_inventory_history enable row level security;
revoke all on public.food_store_closing_inventories, public.food_store_closing_inventory_history from anon, authenticated;
grant select, insert, update on public.food_store_closing_inventories to service_role;
grant select, insert on public.food_store_closing_inventory_history to service_role;
grant usage, select on sequence public.food_store_closing_inventory_history_id_seq to service_role;

create or replace function public.audit_food_store_closing_inventory() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.original_workbook is distinct from old.original_workbook or new.source_sha256 <> old.source_sha256 or new.source_filename <> old.source_filename or new.fiscal_year <> old.fiscal_year then
    raise exception '取込原本と年度は変更できません';
  end if;
  if old.status = 'completed' and (new.workbook is distinct from old.workbook or new.inventory_date <> old.inventory_date) then
    raise exception '確定済み棚卸しは編集に戻してから変更してください';
  end if;
  insert into public.food_store_closing_inventory_history(inventory_id, revision, snapshot) values(old.id, old.revision, to_jsonb(old));
  new.revision = old.revision + 1;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.audit_food_store_closing_inventory() from public, anon, authenticated;
drop trigger if exists food_store_closing_inventory_audit on public.food_store_closing_inventories;
create trigger food_store_closing_inventory_audit before update on public.food_store_closing_inventories for each row execute function public.audit_food_store_closing_inventory();
