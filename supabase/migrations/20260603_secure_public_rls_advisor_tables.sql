-- Supabase Security Advisor: rls_disabled_in_public
-- Date: 2026-06-03
--
-- Scope:
--   Fix the four public tables currently reported with RLS disabled.
--
-- Safety:
--   - No data changes.
--   - trial_balance_* is used only from server-side API routes through the
--     database connection pool, not directly from the browser anon key.
--   - app_data_migrations and the recipe price backup table are operational
--     tables and should not be reachable through the public API.
--   - service_role keeps full access for server-side integrations.

begin;

-- Prevent newly created public tables from automatically receiving broad
-- anon/authenticated privileges. Existing table grants are handled explicitly
-- below, so this does not change current application access paths.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Note: the Supabase-managed supabase_admin default privileges cannot be
-- changed from the application database user. If future objects are created by
-- that owner, add explicit grants/RLS in the same migration that creates them.

-- Internal migration ledger.
alter table public.app_data_migrations enable row level security;
revoke all on table public.app_data_migrations from anon, authenticated;
grant all privileges on table public.app_data_migrations to service_role;

-- One-time recipe selling price backup created by the tax-excluded migration.
alter table public.recipes_selling_price_tax_included_backup_20260531 enable row level security;
revoke all on table public.recipes_selling_price_tax_included_backup_20260531 from anon, authenticated;
grant all privileges on table public.recipes_selling_price_tax_included_backup_20260531 to service_role;

-- Trial balance statement import data. The UI accesses these through
-- /api/finance/trial-balance-statement routes backed by the DB pool.
alter table public.trial_balance_uploads enable row level security;
alter table public.trial_balance_accounts enable row level security;
revoke all on table public.trial_balance_uploads from anon, authenticated;
revoke all on table public.trial_balance_accounts from anon, authenticated;
grant all privileges on table public.trial_balance_uploads to service_role;
grant all privileges on table public.trial_balance_accounts to service_role;

commit;
