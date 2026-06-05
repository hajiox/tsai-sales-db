-- Supabase Security Advisor: rls_disabled_in_public
-- Date: 2026-05-27
--
-- Scope:
--   Only tables currently reported with RLS disabled in public schema.
--
-- Safety:
--   - No data changes.
--   - Server-side APIs using service_role keep full access.
--   - Existing browser flows that currently depend on anon access keep the
--     minimum access they need:
--       * jan_codes: read rows and edit visible product metadata.
--       * recipe_print_logs: insert print events for DocScanner pickup.

begin;

-- JAN management page reads all rows in the browser and currently edits
-- product metadata inline. Keep that path working, but remove public insert
-- and delete.
alter table public.jan_codes enable row level security;
drop policy if exists "jan_codes_anon_select" on public.jan_codes;
drop policy if exists "jan_codes_anon_update_metadata" on public.jan_codes;
drop policy if exists "jan_codes_authenticated_all" on public.jan_codes;

revoke all on table public.jan_codes from anon, authenticated;
grant select on table public.jan_codes to anon, authenticated;
grant update (product_name, category, price_excl_tax, ingredients, memo) on table public.jan_codes to anon, authenticated;
grant all privileges on table public.jan_codes to service_role;

create policy "jan_codes_anon_select"
  on public.jan_codes
  for select
  to anon, authenticated
  using (true);

create policy "jan_codes_anon_update_metadata"
  on public.jan_codes
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- Recipe print button inserts a log from the TSA browser; DocScanner reads and
-- marks processed via service_role.
alter table public.recipe_print_logs enable row level security;
drop policy if exists "recipe_print_logs_anon_insert" on public.recipe_print_logs;
drop policy if exists "recipe_print_logs_authenticated_all" on public.recipe_print_logs;

revoke all on table public.recipe_print_logs from anon, authenticated;
grant insert on table public.recipe_print_logs to anon, authenticated;
grant all privileges on table public.recipe_print_logs to service_role;

create policy "recipe_print_logs_anon_insert"
  on public.recipe_print_logs
  for insert
  to anon, authenticated
  with check (true);

-- LP tracking management is accessed through service-role API routes.
alter table public.lp_tracking_targets enable row level security;
alter table public.lp_tracking_links enable row level security;
revoke all on table public.lp_tracking_targets from anon, authenticated;
revoke all on table public.lp_tracking_links from anon, authenticated;
grant all privileges on table public.lp_tracking_targets to service_role;
grant all privileges on table public.lp_tracking_links to service_role;

-- DocScanner/TSA delivery-note sync and TSA mobile delivery notes use
-- service-role API routes.
alter table public.wholesale_delivery_note_sales enable row level security;
revoke all on table public.wholesale_delivery_note_sales from anon, authenticated;
grant all privileges on table public.wholesale_delivery_note_sales to service_role;

commit;
