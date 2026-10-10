const path = require('node:path');
const root = path.join(__dirname, '..');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  let assertions = 0;
  const eq = (actual, expected, label) => {
    // Never include rows or business amounts in a failed assertion output.
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label);
    assertions++;
  };
  const query = (sql, params = []) => db.query(sql, params);
  const row = async (table, id) => (await query(`select to_jsonb(t) row from public.${table} t where id=$1`, [id])).rows[0]?.row;
  const sync = async (table, before, after) => (await query('select public.tsa_business_sync_related($1,$2::jsonb,$3::jsonb) result', [table, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null])).rows[0].result;
  const ids = Object.fromEntries(['recipe', 'recipe2', 'web', 'wholesale', 'oem', 'ingredient', 'ingredient2', 'material', 'expense', 'item', 'materialItem', 'expenseItem', 'createdItem'].map(n => [n, crypto.randomUUID()]));
  try {
    await query('begin');
    await query(fs.readFileSync(path.join(root, 'supabase/migrations/20261010133000_business_cost_sync.sql'), 'utf8'));
    const formulaCases = [
      [{ item_type: 'ingredient', usage_amount: 200, unit_price: 500, unit_quantity: 1000, tax_included: false }, 108],
      [{ item_type: 'material', usage_amount: 2, unit_price: 12, tax_included: false }, 26.4],
      [{ item_type: 'expense', usage_amount: 1, unit_price: 30, tax_included: false }, 33],
      [{ item_type: 'intermediate', usage_amount: 3, unit_price: 2 }, 6],
      [{ item_type: 'product', usage_amount: 100, unit_price: 80, unit_quantity: -1, unit_weight: 200 }, 40],
      [{ item_type: 'ingredient', usage_amount: 1, unit_price: -0.00005, unit_quantity: 1 }, 0],
    ];
    for (const [input, expected] of formulaCases) eq(Number((await query('select public.tsa_business_recipe_item_cost($1) cost', [input])).rows[0].cost), expected, 'cost formula');
    eq((await query("select has_function_privilege('anon','public.tsa_business_sync_related(text,jsonb,jsonb)','EXECUTE') p")).rows[0].p, false, 'anonymous helper execution');
    eq((await query("select has_function_privilege('authenticated','public.tsa_business_sync_related(text,jsonb,jsonb)','EXECUTE') p")).rows[0].p, false, 'authenticated helper execution');
    eq((await query("select has_function_privilege('service_role','public.tsa_business_sync_related(text,jsonb,jsonb)','EXECUTE') p")).rows[0].p, true, 'service helper execution');
    await query('insert into public.products(id,name,price,profit_rate) values($1,$2,777,10)', [ids.web, '__business_sync_test__']);
    await query('insert into public.wholesale_products(id,product_code,product_name,price,profit_rate) values($1,$3,$3,777,10),($2,$4,$4,777,10)', [ids.wholesale, ids.oem, ids.wholesale, ids.oem]);
    await query('insert into public.oem_products(id,product_code,product_name,price) values($1,$2,$2,777)', [ids.oem, ids.oem]);
    await query('insert into public.recipes(id,name,category,selling_price,total_cost,amazon_fee_enabled,linked_product_id,linked_wholesale_product_id,linked_oem_product_id) values($1,$2,$3,1000,0,true,$4,$5,$6)', [ids.recipe, '__business_sync_test__', '自社', ids.web, ids.wholesale, ids.oem]);
    await query('insert into public.recipes(id,name,category,selling_price,total_cost) values($1,$2,$3,1000,0)', [ids.recipe2, '__business_sync_test_2__', '自社']);
    await query('insert into public.ingredients(id,name,price,unit_quantity,tax_included) values($1,$3,300,1000,false),($2,$4,200,100,true)', [ids.ingredient, ids.ingredient2, '__business_sync_ingredient__', '__business_sync_ingredient2__']);
    await query("insert into public.materials(id,name,price,unit_quantity,tax_included) values($1,'__business_sync_material__',10,'100枚',false)", [ids.material]);
    await query("insert into public.expenses(id,name,unit_price,unit_quantity,tax_included) values($1,'__business_sync_expense__',20,1,false)", [ids.expense]);
    await query("insert into public.recipe_items(id,recipe_id,item_name,item_type,ingredient_id,usage_amount,unit_quantity,unit_price,tax_included,cost) values($1,$2,'__business_sync_ingredient__','ingredient',$3,200,1000,300,false,64.8)", [ids.item, ids.recipe, ids.ingredient]);
    let before = await row('ingredients', ids.ingredient);
    await query('update public.ingredients set price=500 where id=$1', [ids.ingredient]);
    let audit = await sync('ingredients', before, await row('ingredients', ids.ingredient));
    eq(Number((await row('recipe_items', ids.item)).cost), 108, 'master price item propagation');
    eq(Number((await row('recipes', ids.recipe)).total_cost), 216, 'recipe Amazon fee total');
    eq(Number((await row('products', ids.web)).price), 1080, 'linked WEB price');
    eq(Number((await row('products', ids.web)).profit_rate), 80, 'linked WEB profit');
    eq(Number((await row('wholesale_products', ids.wholesale)).price), 756, 'linked wholesale price');
    eq(Number((await row('wholesale_products', ids.oem)).price), 1080, 'linked OEM wholesale price');
    eq(Number((await row('oem_products', ids.oem)).price), 1080, 'linked OEM price');
    eq(Object.keys(audit.before).length, 6, 'bounded related audit');
    eq(Object.keys(audit.before).sort(), Object.keys(audit.after).sort(), 'related audit sides');
    eq(Object.hasOwn(audit.before['recipes:' + ids.recipe], 'web_description'), false, 'audit projection');
    before = await row('recipes', ids.recipe);
    await query('update public.recipes set selling_price=1200 where id=$1', [ids.recipe]);
    await sync('recipes', before, await row('recipes', ids.recipe));
    eq(Number((await row('recipes', ids.recipe)).total_cost), 238, 'price change Amazon fee');
    eq(Number((await row('products', ids.web)).price), 1296, 'price change linked WEB');
    eq(Number((await row('wholesale_products', ids.wholesale)).price), 907, 'price change linked wholesale');
    eq(Number((await query('select count(*) n from public.recipe_ec_price_revisions where recipe_id=$1', [ids.recipe])).rows[0].n), 1, 'native EC revision preserved');
    eq(Number((await query('select count(*) n from public.product_price_history where product_id=$1', [ids.web])).rows[0].n), 2, 'native WEB price history preserved');
    await query("insert into public.recipe_items(id,recipe_id,item_name,item_type,material_id,usage_amount,unit_quantity,unit_price,tax_included,cost) values($1,$2,'__business_sync_material__','material',$3,2,100,10,false,22)", [ids.materialItem, ids.recipe, ids.material]);
    before = await row('materials', ids.material);
    await query('update public.materials set price=12 where id=$1', [ids.material]);
    await sync('materials', before, await row('materials', ids.material));
    eq(Number((await row('recipe_items', ids.materialItem)).cost), 26.4, 'descriptive pack material cost');
    eq(Number((await row('recipe_items', ids.materialItem)).unit_quantity), 100, 'material item pack preserved');
    await query("insert into public.recipe_items(id,recipe_id,item_name,item_type,expense_id,usage_amount,unit_quantity,unit_price,tax_included,cost) values($1,$2,'__business_sync_expense__','expense',$3,1,1,20,false,22)", [ids.expenseItem, ids.recipe, ids.expense]);
    before = await row('expenses', ids.expense);
    await query('update public.expenses set unit_price=30 where id=$1', [ids.expense]);
    await sync('expenses', before, await row('expenses', ids.expense));
    eq(Number((await row('recipe_items', ids.expenseItem)).cost), 33, 'expense cost');
    before = await row('recipe_items', ids.item);
    await query('update public.recipe_items set ingredient_id=$1 where id=$2', [ids.ingredient2, ids.item]);
    await sync('recipe_items', before, await row('recipe_items', ids.item));
    eq(Number((await row('recipe_items', ids.item)).unit_price), 200, 'source link snapshot refresh');
    eq(Number((await row('recipe_items', ids.item)).unit_quantity), 100, 'source link pack refresh');
    eq(Number((await row('recipe_items', ids.item)).cost), 400, 'source link cost');
    before = await row('recipe_items', ids.item);
    await query('update public.recipe_items set ingredient_id=$1,unit_price=123 where id=$2', [ids.ingredient, ids.item]);
    await sync('recipe_items', before, await row('recipe_items', ids.item));
    eq(Number((await row('recipe_items', ids.item)).unit_price), 123, 'simultaneous explicit price preserved');
    eq(Number((await row('recipe_items', ids.item)).cost), 26.568, 'simultaneous override canonical cost');
    await query("insert into public.recipe_items(id,recipe_id,item_name,item_type,ingredient_id,usage_amount,tax_included) values($1,$2,'','ingredient',$3,10,null)", [ids.createdItem, ids.recipe, ids.ingredient]);
    await sync('recipe_items', null, await row('recipe_items', ids.createdItem));
    eq(Number((await row('recipe_items', ids.createdItem)).unit_price), 500, 'create source missing price fill');
    eq(Number((await row('recipe_items', ids.createdItem)).cost), 5.4, 'create source canonical cost');
    before = await row('recipe_items', ids.createdItem);
    await query('update public.recipe_items set recipe_id=$1 where id=$2', [ids.recipe2, ids.createdItem]);
    await sync('recipe_items', before, await row('recipe_items', ids.createdItem));
    eq(Number((await row('recipes', ids.recipe2)).total_cost), 5.4, 'move recalculates new recipe');
    before = await row('recipe_items', ids.createdItem);
    await query('delete from public.recipe_items where id=$1', [ids.createdItem]);
    await sync('recipe_items', before, null);
    eq(Number((await row('recipes', ids.recipe2)).total_cost), 0, 'delete recalculates recipe');
    before = await row('ingredients', ids.ingredient);
    await query("update public.ingredients set name='__business_sync_renamed__' where id=$1", [ids.ingredient]);
    audit = await sync('ingredients', before, await row('ingredients', ids.ingredient));
    eq((await row('recipe_items', ids.item)).item_name, '__business_sync_renamed__', 'stable master ID name sync');
    eq(Object.keys(audit.before).length, 1, 'name only no unrelated total recompute');
    before = await row('ingredients', ids.ingredient);
    await query('update public.ingredients set calories=100 where id=$1', [ids.ingredient]);
    audit = await sync('ingredients', before, await row('ingredients', ids.ingredient));
    eq(Object.keys(audit.before).length, 0, 'nutrition remains live master data');
    await query('update public.recipes set total_cost=999 where id=$1', [ids.recipe2]);
    before = await row('recipes', ids.recipe2);
    await query("update public.recipes set manufacturing_notes='note-only' where id=$1", [ids.recipe2]);
    audit = await sync('recipes', before, await row('recipes', ids.recipe2));
    eq(Number((await row('recipes', ids.recipe2)).total_cost), 999, 'note-only preserves cost');
    eq(Object.keys(audit.before).length, 0, 'note-only has no related writes');
    console.log(JSON.stringify({ helperSql: 'valid', assertions, syntheticOnly: true, transaction: 'rollback' }));
  } finally {
    await query('rollback');
    await db.end();
  }
}
main().catch(error => { console.error(error.code || error.message || 'cost_sync_test_failed'); process.exitCode = 1; });
