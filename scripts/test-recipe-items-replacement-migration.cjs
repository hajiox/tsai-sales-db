// Only random synthetic records are written, always inside BEGIN / ROLLBACK.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const { Client } = require('pg');

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  let assertions = 0, savepoint = 0;
  const check = (condition, label) => { if (!condition) throw Error(label); assertions++; };
  const equal = (actual, expected, label) => check(JSON.stringify(actual) === JSON.stringify(expected), label);
  const query = (sql, values = []) => db.query(sql, values);
  const denied = async (fn, code) => {
    const name = `recipe_replace_test_${++savepoint}`;
    await query(`savepoint ${name}`);
    let failed = false;
    try { await fn(); } catch (error) { failed = error.message === code; }
    await query(`rollback to savepoint ${name}`);
    await query(`release savepoint ${name}`);
    check(failed, `expected rejection ${code}`);
  };
  const ids = Object.fromEntries(['recipe', 'otherRecipe', 'intermediate', 'ingredient', 'ingredient2', 'material', 'expense', 'item', 'deletedItem', 'otherItem', 'web'].map(key => [key, crypto.randomUUID()]));
  const hash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
  const call = async (action, payload, tokenHash = hash) => (await query('select public.tsa_recipe_items_replace_v1($1,$2,$3::jsonb) result', [tokenHash, action, JSON.stringify(payload)])).rows[0].result;
  const read = () => call('read', { recipeId: ids.recipe });
  const prepare = async (items, key, expectedVersion) => call('prepare', { recipeId: ids.recipe, expectedVersion: expectedVersion || (await read())._version, items, idempotencyKey: key });
  try {
    await query('begin');
    await query(fs.readFileSync(path.join(root, 'supabase/migrations/20261010150000_recipe_items_replacement.sql'), 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      equal((await query("select has_function_privilege($1,'public.tsa_recipe_items_replace_v1(text,text,jsonb)','EXECUTE') allowed", [role])).rows[0].allowed, false, 'RPC denied outside service');
      equal((await query("select has_table_privilege($1,'public.recipe_items_replacement_changes','SELECT') allowed", [role])).rows[0].allowed, false, 'plan read denied');
    }
    equal((await query("select has_function_privilege('service_role','public.tsa_recipe_items_replace_v1(text,text,jsonb)','EXECUTE') allowed")).rows[0].allowed, true, 'service RPC');
    equal((await query("select has_table_privilege('service_role','public.recipe_items_replacement_changes','UPDATE') allowed")).rows[0].allowed, false, 'service cannot mutate plans directly');
    equal((await query("select bool_and(relrowsecurity) enabled from pg_class where oid in ('public.recipe_items_replacement_changes'::regclass,'public.recipe_items_replacement_audit'::regclass)")).rows[0].enabled, true, 'RLS enabled');
    equal((await query("select 'recipe_items_replacement_changes'=any(public.tsa_business_tables()) allowed")).rows[0].allowed, false, 'new plans not business registry');
    equal(Number((await query("select count(*) n from pg_constraint where conrelid='public.recipe_items'::regclass and confrelid='public.recipes'::regclass and contype='f' and conkey=array[(select attnum from pg_attribute where attrelid='public.recipe_items'::regclass and attname='recipe_id')]::smallint[]")).rows[0].n), 1, 'parent recipe FK protects concurrent insertion');
    const connectionId = (await query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by) values('synthetic replacement fixture',$1,array['business:full'],now()+interval '1 hour','fixture') returning id", [hash])).rows[0].id;
    await query("insert into public.products(id,name,price,profit_rate) values($1,'__replacement_test__',777,10)", [ids.web]);
    await query("insert into public.recipes(id,name,category,selling_price,total_cost,total_weight,amazon_fee_enabled,linked_product_id) values($1,'__replacement_test__','自社',1000,0,0,true,$2)", [ids.recipe, ids.web]);
    await query("insert into public.recipes(id,name,category,total_cost,total_weight,yield_rate) values($1,'__replacement_other__','自社',0,0,1),($2,'__replacement_intermediate__','中間部品',80,200,0.5)", [ids.otherRecipe, ids.intermediate]);
    await query("insert into public.ingredients(id,name,price,unit_quantity,tax_included) values($1,'__replacement_ingredient__',300,1000,false),($2,'__replacement_ingredient2__',200,100,true)", [ids.ingredient, ids.ingredient2]);
    await query("insert into public.materials(id,name,price,tax_included) values($1,'__replacement_material__',10,false)", [ids.material]);
    await query("insert into public.expenses(id,name,unit_price,tax_included) values($1,'__replacement_expense__',20,false)", [ids.expense]);
    await query("insert into public.recipe_items(id,recipe_id,item_name,item_type,ingredient_id,unit_price,unit_quantity,usage_amount,tax_included,cost) values($1,$2,'__replacement_ingredient__','ingredient',$3,300,1000,100,false,32.4),($4,$2,'delete me','ingredient',null,1,1,1,true,1),($5,$6,'other recipe row','ingredient',null,1,1,1,true,1)", [ids.item, ids.recipe, ids.ingredient, ids.deletedItem, ids.otherItem, ids.otherRecipe]);
    const before = await read();
    equal(before.items.length, 2, 'whole composition read');
    check(/^[a-f0-9]{32}$/.test(before._version), 'whole snapshot version');
    const expectedDate = before.items.find(item => item.id === ids.item).created_at;
    const inputItems = [
      { id: ids.item, ingredient_id: ids.ingredient2, usage_amount: 50 },
      { item_type: 'material', material_id: ids.material, usage_amount: 2 },
      { item_type: 'expense', expense_id: ids.expense, usage_amount: 1 },
      { item_type: 'intermediate', intermediate_recipe_id: ids.intermediate, usage_amount: 50, unit_quantity: -1 },
      { item_type: 'product', item_name: 'manual product', usage_amount: 2, unit_price: 30 },
    ];
    const payload = { recipeId: ids.recipe, expectedVersion: before._version, items: inputItems, idempotencyKey: 'replacement-first-0001' };
    const plan = await call('prepare', payload);
    equal(plan.requiresApproval, false, 'no extra approval');
    equal(plan.status, 'pending', 'pending plan');
    equal(plan.items.length, 5, 'normalized whole composition');
    equal(plan.items[0].item_name, '__replacement_ingredient2__', 'source change refreshes name');
    equal(plan.items[0].unit_price, 200, 'source change refreshes price');
    equal(plan.items[0].tax_included, true, 'source change refreshes tax');
    equal((await read())._version, before._version, 'prepare makes no business write');
    equal(await call('prepare', payload), plan, 'idempotent preparation assigns same new IDs');
    await denied(() => call('prepare', { ...payload, items: [] }), 'DA_IDEMPOTENCY_CONFLICT');
    const applied = await call('apply', { id: plan.id });
    equal(applied.items.length, 5, 'all rows replaced atomically');
    equal(applied.items.find(item => item.id === ids.item).created_at, expectedDate, 'retained row creation timestamp');
    equal(applied.items.some(item => item.id === ids.deletedItem), false, 'omitted existing row deleted');
    equal(applied.items.find(item => item.id === ids.item).cost, 100, 'ingredient canonical cost');
    equal(applied.items.find(item => item.item_type === 'material').cost, 22, 'material tax');
    equal(applied.items.find(item => item.item_type === 'expense').cost, 22, 'expense tax');
    equal(applied.items.find(item => item.item_type === 'intermediate').unit_weight, 100, 'intermediate selected weight includes yield rate');
    equal(applied.items.find(item => item.item_type === 'intermediate').cost, 40, 'weight cost mode');
    equal(applied.recipe.total_cost, 352, 'final cost including Amazon fee');
    equal(applied.recipe.total_weight, 100, 'gram-mode weight counted once');
    const linked = (await query('select price,profit_rate from public.products where id=$1', [ids.web])).rows[0];
    equal(Number(linked.price), 1080, 'linked product price synchronized');
    equal(Number(linked.profit_rate), 67.4, 'linked product profit synchronized');
    equal(Number((await query('select count(*) n from public.product_price_history where product_id=$1', [ids.web])).rows[0].n), 1, 'only final product state enters price history');
    equal(Number((await query('select count(*) n from public.recipe_ec_price_revisions where recipe_id=$1', [ids.recipe])).rows[0].n), 0, 'cost edit does not invent EC price revisions');
    equal(await call('apply', { id: plan.id }), applied, 'idempotent apply');
    equal((await read())._version, applied._version, 'final committed snapshot version');
    const audit = (await query('select before_data,after_data,related from public.recipe_items_replacement_audit where change_id=$1', [plan.id])).rows[0];
    equal(audit.before_data.items.length, 2, 'whole previous audit');
    equal(audit.after_data.items.length, 5, 'whole resulting audit');
    check(Object.hasOwn(audit.related.before, 'products:' + ids.web), 'related product audit');
    equal(Number((await query('select count(*) n from public.recipe_items_replacement_audit where change_id=$1', [plan.id])).rows[0].n), 1, 'one audit for duplicate apply');
    await denied(() => query("update public.recipe_items_replacement_changes set items='[]'::jsonb where id=$1", [plan.id]), 'DA_INVALID_INPUT');
    await denied(() => query('delete from public.recipe_items_replacement_changes where id=$1', [plan.id]), 'DA_INVALID_INPUT');
    await denied(() => query("update public.recipe_items_replacement_audit set actor='tampered' where change_id=$1", [plan.id]), 'DA_INVALID_INPUT');
    await denied(() => query('delete from public.recipe_items_replacement_audit where change_id=$1', [plan.id]), 'DA_INVALID_INPUT');
    await denied(() => prepare([], 'replacement-stale-prepare', before._version), 'DA_CONFLICT');
    for (const [index, items] of [
      [{ id: ids.otherItem }], [{ id: crypto.randomUUID() }], [{ id: ids.item }, { id: ids.item }],
      [{ item_type: 'sql', item_name: 'bad', usage_amount: 1 }], [{ item_type: 'ingredient', usage_amount: 1 }],
      [{ item_type: 'ingredient', ingredient_id: crypto.randomUUID(), usage_amount: 1 }],
      [{ item_type: 'ingredient', material_id: ids.material, usage_amount: 1 }],
      [{ item_type: 'ingredient', ingredient_id: ids.ingredient, material_id: ids.material, usage_amount: 1 }],
      [{ item_type: 'intermediate', intermediate_recipe_id: ids.recipe, usage_amount: 1 }],
      [{ item_type: 'ingredient', item_name: 'bad', usage_amount: '1' }],
      [{ id: ids.item, recipe_id: ids.otherRecipe }], [{ id: ids.item, cost: 1 }],
      [{ id: ids.item, created_at: '2026-01-01' }], [{ id: ids.item, unit_price: 1000000001 }],
    ].entries()) await denied(() => prepare(items, `replacement-invalid-${index}`), index === 5 ? 'DA_CONFLICT' : 'DA_INVALID_INPUT');
    await denied(() => call('apply', { id: plan.id, items: [] }), 'DA_INVALID_INPUT');
    await denied(() => call('sql', { recipeId: ids.recipe }), 'DA_INVALID_INPUT');
    await denied(() => call('read', { recipeId: ids.recipe }, 'bad'), 'DA_UNAUTHORIZED');
    for (const [scopes, resources, expired, revoked] of [
      [['recipes:read', 'recipes:write'], {}, false, false], [['business:full'], { recipes: [ids.recipe] }, false, false],
      [['business:full'], {}, true, false], [['business:full'], {}, false, true],
    ]) {
      const tokenHash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
      await query("insert into public.data_access_connections(label,token_hash,scopes,resource_ids,expires_at,revoked_at,created_by) values('synthetic limited fixture',$1,$2,$3::jsonb,now()+$4::interval,case when $5 then now() else null end,'fixture')", [tokenHash, scopes, JSON.stringify(resources), expired ? '-1 hour' : '1 hour', revoked]);
      await denied(() => call('read', { recipeId: ids.recipe }, tokenHash), expired || revoked ? 'DA_UNAUTHORIZED' : 'DA_FORBIDDEN');
    }
    const otherHash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
    await query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by) values('synthetic other full fixture',$1,array['business:full'],now()+interval '1 hour','fixture')", [otherHash]);
    await denied(() => call('apply', { id: plan.id }, otherHash), 'DA_NOT_FOUND');
    // All types of concurrent composition/header change invalidate the plan.
    for (const [index, statement, params] of [
      [0, 'update public.recipe_items set usage_amount=usage_amount+1 where id=$1', [ids.item]],
      [1, "update public.recipes set name=name||' concurrent' where id=$1", [ids.recipe]],
      [2, "insert into public.recipe_items(recipe_id,item_name,item_type,usage_amount) values($1,'concurrent row','expense',1)", [ids.recipe]],
      [3, 'delete from public.recipe_items where id=$1', [ids.item]],
    ]) {
      await query('savepoint concurrent_change');
      const pending = await prepare([], `replacement-cas-${index}`);
      await query(statement, params);
      await denied(() => call('apply', { id: pending.id }), 'DA_CONFLICT');
      await query('rollback to savepoint concurrent_change');
      await query('release savepoint concurrent_change');
    }
    const expiredId = crypto.randomUUID();
    await query("insert into public.recipe_items_replacement_changes(id,connection_id,recipe_id,expected_version,items,before_data,request_hash,idempotency_key,expires_at) select $1,connection_id,recipe_id,expected_version,items,before_data,request_hash,'replacement-expired',now()-interval '1 second' from public.recipe_items_replacement_changes where id=$2", [expiredId, plan.id]);
    await denied(() => call('apply', { id: expiredId }), 'DA_EXPIRED');
    // Simulate a disappearing source after preparation; even deletion of the old
    // composition must roll back and no audit may survive the failed insertion.
    const disappearing = crypto.randomUUID();
    await query("insert into public.materials(id,name,price) values($1,'disappearing synthetic source',10)", [disappearing]);
    const failurePlan = await prepare([{ item_type: 'material', material_id: disappearing, usage_amount: 1 }], 'replacement-rollback-failure');
    const stable = await read();
    await query('delete from public.materials where id=$1', [disappearing]);
    await denied(() => call('apply', { id: failurePlan.id }), 'DA_CONFLICT');
    equal((await read())._version, stable._version, 'failed batch preserves entire old composition');
    equal(Number((await query('select count(*) n from public.recipe_items_replacement_audit where change_id=$1', [failurePlan.id])).rows[0].n), 0, 'failed batch has no audit');
    const auditFailure = await prepare([], 'replacement-audit-failure');
    await query("create function pg_temp.fail_recipe_replacement_audit() returns trigger language plpgsql as $$begin raise exception 'fixture_audit_failure'; end$$");
    await query('create trigger fixture_recipe_replacement_audit_failure before insert on public.recipe_items_replacement_audit for each row execute function pg_temp.fail_recipe_replacement_audit()');
    await denied(() => call('apply', { id: auditFailure.id }), 'fixture_audit_failure');
    equal((await read())._version, stable._version, 'audit failure rolls back composition, totals and linked products');
    equal((await query('select status from public.recipe_items_replacement_changes where id=$1', [auditFailure.id])).rows[0].status, 'pending', 'audit failure keeps plan retryable');
    await query('drop trigger fixture_recipe_replacement_audit_failure on public.recipe_items_replacement_audit');
    // Explicit scalar snapshots remain editable; omitted values are retained.
    const current = await read();
    const retained = current.items.map(item => ({ id: item.id }));
    retained.find(item => item.id === ids.item).unit_price = 123;
    const manualPlan = await prepare(retained, 'replacement-manual-snapshot');
    const manualApplied = await call('apply', { id: manualPlan.id });
    equal(manualApplied.items.find(item => item.id === ids.item).unit_price, 123, 'manual price snapshot preserved');
    equal(manualApplied.items.find(item => item.id === ids.item).usage_amount, 50, 'omitted snapshot retained');
    const modes = await prepare([
      { item_type: 'product', intermediate_recipe_id: ids.intermediate, usage_amount: 30, unit_quantity: -1 },
      { item_type: 'intermediate', intermediate_recipe_id: ids.intermediate, usage_amount: 2 },
    ], 'replacement-product-gram-mode');
    const modeApplied = await call('apply', { id: modes.id });
    equal(modeApplied.items.find(item => item.item_type === 'product').cost, 12, 'product gram mode canonical cost');
    equal(modeApplied.items.find(item => item.item_type === 'intermediate').cost, 160, 'intermediate multiplier mode canonical cost');
    equal(modeApplied.items.find(item => item.item_type === 'product').unit_weight, 200, 'product selected weight does not apply intermediate yield');
    equal(modeApplied.recipe.total_weight, 230, 'product grams plus intermediate multiplier weight');
    equal(modeApplied.recipe.total_cost, 280, 'weight update preserved by final related sync');
    const clearPlan = await prepare([], 'replacement-explicit-clear');
    const cleared = await call('apply', { id: clearPlan.id });
    equal(cleared.items, [], 'empty array explicitly removes all rows');
    equal(cleared.recipe.total_cost, 108, 'empty composition keeps configured Amazon fee');
    equal(cleared.recipe.total_weight, 0, 'empty weight');
    equal(Number((await query('select count(*) n from public.recipe_items where id=$1', [ids.otherItem])).rows[0].n), 1, 'other recipe untouched');
    equal(connectionId, (await query('select connection_id from public.recipe_items_replacement_audit where change_id=$1', [plan.id])).rows[0].connection_id, 'audit connection attribution');
    await query(fs.readFileSync(path.join(root, 'supabase/migrations/20261010150000_recipe_items_replacement.sql'), 'utf8'));
    equal((await read()).items.length, 0, 'migration can be reapplied without changing business data');
    console.log(`recipe-items replacement migration: ${assertions} assertions passed; synthetic writes rolled back`);
  } finally {
    await query('rollback');
    await db.end();
  }
}
if (require.main === module) main().catch(error => { console.error('recipe-items replacement migration failed:', error.code || '', error.message); process.exitCode = 1; });
module.exports = { main };
