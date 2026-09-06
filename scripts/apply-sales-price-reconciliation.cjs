const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local', quiet: true });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('BEGIN');
  try {
    const before = (await client.query(`SELECT product_id, report_month::text, unit_price, unit_profit_rate, unit_cost_ex_ec
      FROM public.web_sales_summary ORDER BY product_id, report_month`)).rows;
    await client.query(fs.readFileSync('supabase/migrations/20260906160000_sales_price_reconciliation.sql', 'utf8'));
    const after = (await client.query(`SELECT product_id, report_month::text, unit_price, unit_profit_rate, unit_cost_ex_ec
      FROM public.web_sales_summary ORDER BY product_id, report_month`)).rows;
    assert.deepEqual(after, before, 'repair must not change price/cost snapshots');
    const checks = (await client.query("SELECT * FROM public.recipe_sales_price_checks('e84d1db2-4c0c-46cf-924e-8faa8fa2b0b2')")).rows;
    assert.ok(checks.some((row) => row.channel === 'yahoo' && Number(row.quantity) === 31));
    await client.query('SAVEPOINT reimport_test');
    const target = before.find((row) => row.report_month === '2026-08-01');
    await client.query('SELECT public.replace_web_sales_channel_summary($1,$2,$3)', ['yahoo', '2026-08-01', JSON.stringify([
      { product_id: target.product_id, quantity: 1, unit_price: 999999, unit_profit_rate: 99 },
    ])]);
    const kept = (await client.query('SELECT unit_price, unit_profit_rate, unit_cost_ex_ec FROM public.web_sales_summary WHERE product_id=$1 AND report_month=$2', [target.product_id, '2026-08-01'])).rows[0];
    for (const key of ['unit_price', 'unit_profit_rate', 'unit_cost_ex_ec']) assert.equal(kept[key], target[key], key);
    await client.query('ROLLBACK TO SAVEPOINT reimport_test');
    await client.query(fs.readFileSync('supabase/migrations/20260906160000_sales_price_reconciliation.sql', 'utf8'));
    const apply = process.argv.includes('--apply');
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ applied: apply, snapshotsPreserved: before.length, reimportPreserved: true, idempotent: true, correctedYahooQuantity: 31 }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
