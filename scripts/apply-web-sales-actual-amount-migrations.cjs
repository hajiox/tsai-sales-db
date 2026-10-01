const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
const migrations = ['20261001101000_web_sales_actual_amounts.sql','20261001102000_web_sales_actual_amount_consumers.sql'];
const assert = (value, message) => { if (!value) throw new Error(message); };
async function main() {
  const apply = process.argv.includes('--apply');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false } });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
    const functionsBefore = (await db.query(`SELECT oid::regprocedure::text signature, proacl::text acl, prosecdef, proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('replace_web_sales_channel_summary','get_monthly_financial_summary','get_monthly_series_summary','get_period_financial_summary','get_period_series_summary','get_previous_year_sales','get_product_trend_data','get_series_trend_data','get_site_trend_data','get_total_trend_data','get_web_sales_monthly') ORDER BY signature`)).rows;
    for (const name of migrations) await db.query(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));
    const table = (await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.web_sales_summary'::regclass")).rows[0];
    assert(table.relrowsecurity, 'Summary RLS must stay enabled');
    const access = (await db.query("SELECT has_function_privilege('anon','public.replace_web_sales_channel_summary(text,date,jsonb)','EXECUTE') anon, has_function_privilege('authenticated','public.replace_web_sales_channel_summary(text,date,jsonb)','EXECUTE') authenticated, has_function_privilege('service_role','public.replace_web_sales_channel_summary(text,date,jsonb)','EXECUTE') service")).rows[0];
    assert(!access.anon && !access.authenticated && access.service, 'Import RPC privileges differ from required allowlist');
    const functionsAfter = (await db.query(`SELECT oid::regprocedure::text signature, proacl::text acl, prosecdef, proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('replace_web_sales_channel_summary','get_monthly_financial_summary','get_monthly_series_summary','get_period_financial_summary','get_period_series_summary','get_previous_year_sales','get_product_trend_data','get_series_trend_data','get_site_trend_data','get_total_trend_data','get_web_sales_monthly') ORDER BY signature`)).rows;
    assert(JSON.stringify(functionsBefore)===JSON.stringify(functionsAfter), 'Existing RPC ACL/security attributes changed');
    const helper = (await db.query('SELECT web_sales_reported_amount(2,80) actual, web_sales_reported_amount(2,NULL) missing, web_sales_reported_amount(0,NULL) unsold, web_sales_reported_profit(2,80,30,50,40) profit, web_sales_reported_profit(2,80,NULL,50,40) unknown_cost')).rows[0];
    assert(Number(helper.actual)===80 && helper.missing===null && Number(helper.unsold)===0 && Number(helper.profit)===20 && helper.unknown_cost===null, 'Actual amount/profit regression');
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ status:apply?'applied':'dry_run_rolled_back', migrations, rls:true, existingFunctionSecurityPreserved:true, strictAmountAndCost:true }));
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
}
main().catch(error=>{ console.error(error.message);process.exitCode=1; });
