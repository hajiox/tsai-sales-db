// Read-only ACL/policy audit. May also be called inside a migration's rollback transaction.
const assert = require('node:assert/strict');
const path = require('node:path');
const { Client } = require('pg');
const TABLES = ['recipes','recipe_items','ingredients','materials','expenses','recipe_reviews','web_sales_summary'];
async function verifyReadBoundary(client) {
  const acl = await client.query("select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'select') anon_select,has_table_privilege('authenticated',c.oid,'select') authenticated_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)",[TABLES]);
  assert.equal(acl.rows.length,TABLES.length);
  assert.ok(acl.rows.every(row=>row.relrowsecurity && !row.anon_select),'protected table allows anonymous SELECT');
  assert.ok(acl.rows.filter(row=>row.relname!=='recipe_reviews').every(row=>row.authenticated_select),'browser authenticated SELECT grant is missing');
  const views = await client.query("select distinct v.relname from pg_depend d join pg_rewrite rw on rw.oid=d.objid join pg_class v on v.oid=rw.ev_class join pg_class t on t.oid=d.refobjid join pg_namespace tn on tn.oid=t.relnamespace where v.relkind in ('v','m') and tn.nspname='public' and t.relname=any($1) and v.oid<>t.oid and has_table_privilege('anon',v.oid,'select')",[TABLES]);
  assert.equal(views.rows.length,0,'an anonymous view bypasses the protected table boundary');
  const functions = await client.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype and p.prosrc ~ '(recipes|recipe_items|ingredients|materials|expenses|recipe_reviews|web_sales_summary)' and has_function_privilege('anon',p.oid,'execute')");
  assert.equal(functions.rows.length,0,'an anonymous SECURITY DEFINER function bypasses the protected table boundary');
  return { protectedTables:TABLES.length, rlsEnabled:true, anonymousSelectClosed:true, anonymousViewsClosed:true, anonymousDefinerFunctionsClosed:true };
}
if(require.main===module) {
  require('dotenv').config({path:path.join(__dirname,'..','.env.local'),quiet:true});
  (async()=>{
    if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=disable')?undefined:{rejectUnauthorized:false}});
    await client.connect();try{console.log(JSON.stringify(await verifyReadBoundary(client)))}finally{await client.end()}
  })().catch(error=>{console.error(error.message);process.exitCode=1});
}
module.exports={verifyReadBoundary,TABLES};
