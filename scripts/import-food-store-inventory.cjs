const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { load } = require('./food-store-inventory-loader.cjs');
const { parseInventoryExcel } = load('food-store-inventory-import');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
async function main() {
  const [source, yearText, mode] = process.argv.slice(2);
  const year = Number(yearText);
  if (!source || !Number.isInteger(year) || year < 2000 || year > 2100 || !['--dry-run','--apply'].includes(mode)) throw new Error('Usage: node scripts/import-food-store-inventory.cjs FILE FISCAL_YEAR --dry-run|--apply');
  const buffer = fs.readFileSync(source);
  const workbook = parseInventoryExcel(buffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260915_food_store_closing_inventory.sql'), 'utf8'));
    const existing = await client.query('select id, source_sha256, original_workbook from public.food_store_closing_inventories where fiscal_year=$1', [year]);
    let id;
    if (existing.rows.length) {
      assert.equal(existing.rows[0].source_sha256, hash, 'Saved fiscal year has a different source; will not overwrite');
      assert.deepEqual(existing.rows[0].original_workbook, workbook);
      id = existing.rows[0].id;
    } else {
      const result = await client.query('insert into public.food_store_closing_inventories(fiscal_year,inventory_date,source_filename,source_sha256,original_workbook,workbook,created_by,updated_by) values($1,$2,$3,$4,$5,$5,$6,$6) returning id', [year, `${year}-07-31`, path.basename(source), hash, JSON.stringify(workbook), 'aizubrandhall@gmail.com']);
      id = result.rows[0].id;
      const saved = await client.query('select workbook from public.food_store_closing_inventories where id=$1', [id]);
      assert.deepEqual(saved.rows[0].workbook, workbook, 'Every cell/formula must survive DB roundtrip');
    }
    if (mode === '--dry-run') {
      await client.query('savepoint test_edits');
      const update = await client.query("update public.food_store_closing_inventories set status='completed' where id=$1 returning revision", [id]);
      assert.equal(update.rows[0].revision, 2);
      assert.equal((await client.query('select count(*)::int n from public.food_store_closing_inventory_history where inventory_id=$1',[id])).rows[0].n, 1);
      await client.query('savepoint locked');
      await assert.rejects(client.query("update public.food_store_closing_inventories set workbook='{}'::jsonb where id=$1", [id]), /確定済み/);
      await client.query('rollback to savepoint locked');
      await client.query('rollback to savepoint test_edits');
    }
    const rls = await client.query("select relname,relrowsecurity from pg_class where relname in ('food_store_closing_inventories','food_store_closing_inventory_history') and relnamespace='public'::regnamespace");
    assert.equal(rls.rows.length, 2); assert.ok(rls.rows.every(row => row.relrowsecurity));
    await client.query(mode === '--apply' ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ mode, id, fiscalYear: year, sheets: workbook.sheets.length, cells: workbook.sheets.reduce((n,s) => n + Object.keys(s.cells).length,0), originalPreserved: true }));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
