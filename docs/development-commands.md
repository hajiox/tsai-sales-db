# Development Commands

## Security checks

Run these before DB work or deployment.

```bash
npm run security:scan
npm run security:rls
npm run security
```

- `security:scan` fails when hard-coded credentials are found outside `.env*` files.
- `security:rls` fails when a public Supabase table has RLS disabled or future `postgres`-owned public objects would grant `anon` / `authenticated` access by default.
- `security` runs both checks.

## Predeploy

```bash
npm run predeploy
```

This runs:

```bash
npm run security:scan
npm run security:rls
npm run build
```

Do not deploy when this command fails. Fix the failing check first.

## Rollback reference

The current emergency rollback SQL for the 2026-06-03 Supabase RLS hardening is:

```text
sql/20260603_rollback_secure_public_rls_advisor_tables.sql
```

Only run rollback SQL if production actually breaks and the cause is confirmed to be the RLS hardening.
