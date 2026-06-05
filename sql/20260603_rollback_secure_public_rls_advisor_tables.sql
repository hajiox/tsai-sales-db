-- Rollback for supabase/migrations/20260603_secure_public_rls_advisor_tables.sql
--
-- Use only if the 2026-06-03 RLS hardening unexpectedly breaks production.
-- This restores the previous broad public grants and disables RLS on the four
-- tables that were reported by Supabase Security Advisor.

begin;

alter default privileges for role postgres in schema public
  grant all privileges on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated;

alter table if exists public.app_data_migrations disable row level security;
alter table if exists public.recipes_selling_price_tax_included_backup_20260531 disable row level security;
alter table if exists public.trial_balance_uploads disable row level security;
alter table if exists public.trial_balance_accounts disable row level security;

grant all privileges on table public.app_data_migrations to anon, authenticated, service_role;
grant all privileges on table public.recipes_selling_price_tax_included_backup_20260531 to anon, authenticated, service_role;
grant all privileges on table public.trial_balance_uploads to anon, authenticated, service_role;
grant all privileges on table public.trial_balance_accounts to anon, authenticated, service_role;

commit;
