import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Cannot check Supabase RLS state.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function aclIncludesPublicRoles(acl) {
  return typeof acl === 'string' && /\b(anon|authenticated)=/.test(acl);
}

try {
  await client.connect();

  const disabledResult = await client.query(`
    select c.relname as table_name,
           coalesce(s.n_live_tup, 0)::bigint as approx_rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname not like 'pg_%'
       and c.relrowsecurity = false
     order by c.relname
  `);

  const defaultAclResult = await client.query(`
    select r.rolname as owner,
           d.defaclobjtype as object_type,
           d.defaclacl::text as acl
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
      join pg_roles r on r.oid = d.defaclrole
     where n.nspname = 'public'
       and r.rolname = 'postgres'
       and d.defaclobjtype in ('r', 'S', 'f')
     order by d.defaclobjtype
  `);

  const insecureDefaults = defaultAclResult.rows.filter((row) => aclIncludesPublicRoles(row.acl));

  if (disabledResult.rows.length > 0 || insecureDefaults.length > 0) {
    if (disabledResult.rows.length > 0) {
      console.error('RLS check failed. Public tables with RLS disabled:');
      for (const row of disabledResult.rows) {
        console.error(`- ${row.table_name} (${row.approx_rows} rows)`);
      }
    }

    if (insecureDefaults.length > 0) {
      console.error('Default privilege check failed. Future postgres-owned public objects grant anon/authenticated access:');
      for (const row of insecureDefaults) {
        console.error(`- owner=${row.owner} object_type=${row.object_type} acl=${row.acl}`);
      }
    }

    process.exit(1);
  }

  console.log('RLS check passed. All public tables have RLS enabled and postgres default public grants are closed.');
} finally {
  await client.end().catch(() => {});
}
