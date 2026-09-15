const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { load } = require('./food-store-inventory-loader.cjs');
const { parseInventoryExcel } = load('food-store-inventory-import');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
async function main() {
  const [file, id, revisionText, mode] = process.argv.slice(2);
  const revision = Number(revisionText);
  if (!file || !id || !Number.isInteger(revision) || !['--dry-run', '--apply'].includes(mode)) throw new Error('Usage: FILE ID EXPECTED_REVISION --dry-run|--apply');
  const buffer = fs.readFileSync(file);
  const workbook = parseInventoryExcel(buffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("set local lock_timeout='5s'");
    // The normal API deliberately cannot replace an original. This operator-only
    // correction archives it first, with the trigger suspension and update atomic.
    await client.query('lock table public.food_store_closing_inventories in access exclusive mode');
    const old = (await client.query('select * from public.food_store_closing_inventories where id=$1 for update',[id])).rows[0];
    assert.ok(old, 'Inventory not found');
    assert.equal(old.revision, revision, 'Inventory changed since inspection');
    assert.equal(old.status, 'draft', 'Completed inventory must not be replaced');
    if (old.source_sha256 === hash) throw new Error('This source is already registered; no changes made');
    await client.query('insert into public.food_store_closing_inventory_history(inventory_id,revision,snapshot) values($1,$2,$3)',[id,old.revision,JSON.stringify(old)]);
    await client.query('alter table public.food_store_closing_inventories disable trigger food_store_closing_inventory_audit');
    await client.query('update public.food_store_closing_inventories set workbook=$1,original_workbook=$1,source_filename=$2,source_sha256=$3,revision=revision+1,updated_at=now() where id=$4',[JSON.stringify(workbook),path.basename(file),hash,id]);
    await client.query('alter table public.food_store_closing_inventories enable trigger food_store_closing_inventory_audit');
    const saved = (await client.query('select workbook,original_workbook,revision from public.food_store_closing_inventories where id=$1',[id])).rows[0];
    assert.deepEqual(saved.workbook,workbook);
    assert.deepEqual(saved.original_workbook,workbook);
    const history = (await client.query('select snapshot from public.food_store_closing_inventory_history where inventory_id=$1 and revision=$2',[id,revision])).rows[0].snapshot;
    assert.deepEqual(history.workbook,old.workbook);
    assert.equal((await client.query("select tgenabled from pg_trigger where tgrelid='public.food_store_closing_inventories'::regclass and tgname='food_store_closing_inventory_audit'")).rows[0].tgenabled,'O');
    await client.query(mode === '--apply' ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ mode, fiscalYear:old.fiscal_year, revision:saved.revision, previousSheets:old.workbook.sheets.length, sheets:workbook.sheets.map(s=>s.name), cells:workbook.sheets.reduce((n,s)=>n+Object.keys(s.cells).length,0), previousSourceArchived:true }));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
