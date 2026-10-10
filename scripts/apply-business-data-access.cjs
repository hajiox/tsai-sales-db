const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { Client } = require('pg');
require('@next/env').loadEnvConfig(path.join(__dirname, '..'), false, { info() {}, error() {} });

const migrationPath = path.join(__dirname, '../supabase/migrations/20261010140000_business_data_access.sql');
const helperPath = path.join(__dirname, '../supabase/migrations/20261010133000_business_cost_sync.sql');
const masterPath = path.join(__dirname, '../supabase/migrations/20261010141000_data_access_master_values.sql');
const signature = 'public.tsa_business_access_v1(text,text,jsonb)';

async function verify(db) {
  const row = (await db.query("select has_function_privilege('anon',$1,'execute') anon_rpc,has_function_privilege('authenticated',$1,'execute') authenticated_rpc,has_function_privilege('service_role',$1,'execute') service_rpc,has_table_privilege('anon','public.business_data_access_changes','select') anon_plans,has_table_privilege('authenticated','public.business_data_access_audit','select') authenticated_audit", [signature])).rows[0];
  assert.deepEqual(row, { anon_rpc: false, authenticated_rpc: false, service_rpc: true, anon_plans: false, authenticated_audit: false });
  const rls = (await db.query("select count(*)::int n from pg_class where oid=any(array['public.business_data_access_changes'::regclass,'public.business_data_access_audit'::regclass]) and relrowsecurity")).rows[0].n;
  assert.equal(rls, 2);
  return { publicPrivilegesClosed: true, rlsEnabled: true };
}

async function fixtures(db) {
  const suffix = randomUUID();
  const tokenHash = createHash('sha256').update(suffix).digest('hex');
  const connectionId = (await db.query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by,max_limit) values($1,$2,array['business:full'],now()+interval '1 hour','fixture',100) returning id", [`__business_fixture_${suffix}`, tokenHash])).rows[0].id;
  const call = async (action, payload, hash = tokenHash) => (await db.query('select public.tsa_business_access_v1($1,$2,$3::jsonb) result', [hash, action, JSON.stringify(payload)])).rows[0].result;
  let denialIndex = 0;
  const denied = async (run, message) => {
    const savepoint = `business_denial_${denialIndex++}`;
    await db.query(`savepoint ${savepoint}`);
    let failure;
    try { await run(); } catch (error) { failure = error; }
    await db.query(`rollback to savepoint ${savepoint}`);
    await db.query(`release savepoint ${savepoint}`);
    assert.ok(failure, `Expected ${message}`);
    assert.equal(failure.message, message);
  };
  const prepare = (table, operation, values, item, idempotencyKey) => call('prepare', {
    table, operation, ...(item ? { key: { id: item.id }, expectedVersion: item._version } : {}),
    ...(values ? { values } : {}), idempotencyKey,
  });
  const create = async (table, values, key) => call('apply', { id: (await prepare(table, 'create', values, null, key)).id });
  await denied(() => call('catalog', {}, 'f'.repeat(64)), 'DA_UNAUTHORIZED');
  const catalog = await call('catalog', {});
  assert.ok(catalog.tables.some(table => table.table === 'recipes' && table.writable));
  assert.ok(catalog.tables.some(table => table.table === 'recipe_items' && table.writable));
  assert.ok(catalog.tables.some(table => table.table === 'wholesale_customers' && table.writable));
  assert.ok(catalog.tables.some(table => table.type === 'view' && !table.writable));
  for (const excluded of ['ai_tools', 'data_access_connections', 'business_data_access_changes', 'web_sales_api_credentials', 'web_sales_api_runtime', 'web_sales_codex_jobs', 'push_subscriptions', 'recipe_ec_product_registrations']) {
    assert.ok(!catalog.tables.some(table => table.table === excluded), `${excluded} cannot enter the business registry`);
    await denied(() => call('read', { table: excluded }), 'DA_FORBIDDEN');
  }
  await denied(() => call('read', { table: 'recipes; drop table recipes' }), 'DA_FORBIDDEN');
  await denied(() => call('read', { table: 'recipes', sql: 'select 1' }), 'DA_INVALID_INPUT');
  await denied(() => call('read', { table: 'recipes', limit: 101 }), 'DA_INVALID_INPUT');
  await denied(() => call('read', { table: 'recipes', limit: 1.5 }), 'DA_INVALID_INPUT');
  await denied(() => call('read', { table: 'recipes', offset: -1 }), 'DA_INVALID_INPUT');
  await denied(() => call('read', { table: 'recipes', filters: { missing_column: 'x' } }), 'DA_INVALID_INPUT');
  await denied(() => call('read', { table: 'recipes', columns: ['token_hash'] }), 'DA_INVALID_INPUT');

  // Limited legacy connections remain denied even if someone adds the full scope incorrectly.
  for (const bounded of [false, true]) {
    const hash = createHash('sha256').update(randomUUID()).digest('hex');
    await db.query("insert into public.data_access_connections(label,token_hash,scopes,resource_ids,expires_at,created_by) values('limited fixture',$1,$2,$3::jsonb,now()+interval '1 hour','fixture')", [hash, bounded ? ['business:full'] : ['recipes:read','recipes:write'], JSON.stringify(bounded ? { recipes: [randomUUID()] } : {})]);
    await denied(() => call('catalog', {}, hash), 'DA_FORBIDDEN');
  }

  const created = await create('company_links', { title: `__business_link_${suffix}`, url: 'https://example.invalid/business-fixture', memo: 'before' }, 'business-create-link');
  assert.equal(created.status, 'applied');
  const item = created.record;
  assert.match(item._version, /^[a-f0-9]{32}$/);
  assert.deepEqual(await call('apply', { id: created.id }), created);
  const read = await call('read', { table: 'company_links', filters: { id: item.id }, columns: ['id', 'title'], limit: 1 });
  assert.equal(read.items.length, 1);
  assert.equal(read.items[0]._version, item._version);
  assert.deepEqual(Object.keys(read.items[0]).sort(), ['_version', 'id', 'title']);
  await denied(() => prepare('company_links', 'update', { id: randomUUID() }, item, 'business-pk-denial'), 'DA_INVALID_INPUT');
  await denied(() => prepare('company_links', 'update', { created_at: '2020-01-01' }, item, 'business-system-denial'), 'DA_INVALID_INPUT');
  await denied(() => prepare('company_links', 'update', { sort_order: 'wrong type' }, item, 'business-type-denial'), 'DA_INVALID_INPUT');
  const updateInput = { table: 'company_links', operation: 'update', key: { id: item.id }, expectedVersion: item._version, values: { memo: 'after' }, idempotencyKey: 'business-update-link' };
  const plan = await call('prepare', updateInput);
  assert.equal(plan.requiresApproval, false);
  assert.equal((await call('prepare', updateInput)).id, plan.id);
  await denied(() => call('prepare', { ...updateInput, values: { memo: 'different' } }), 'DA_IDEMPOTENCY_CONFLICT');
  await denied(() => call('apply', { id: plan.id, values: { memo: 'replace' } }), 'DA_INVALID_INPUT');
  const applied = await call('apply', { id: plan.id });
  assert.equal(applied.record.memo, 'after');
  assert.deepEqual(await call('apply', { id: plan.id }), applied);
  assert.equal((await db.query('select count(*)::int n from public.business_data_access_audit where change_id=$1', [plan.id])).rows[0].n, 1);
  await denied(() => db.query('update public.business_data_access_audit set actor=$1 where change_id=$2', ['tamper', plan.id]), 'DA_INVALID_INPUT');
  await denied(() => db.query('delete from public.business_data_access_audit where change_id=$1', [plan.id]), 'DA_INVALID_INPUT');
  await denied(() => db.query("update public.business_data_access_changes set values='{}'::jsonb where id=$1", [plan.id]), 'DA_INVALID_INPUT');
  await denied(() => call('prepare', { ...updateInput, idempotencyKey: 'business-stale-prepare' }), 'DA_CONFLICT');
  const stale = await prepare('company_links', 'update', { memo: 'must not apply' }, applied.record, 'business-stale-apply');
  await db.query("update public.company_links set memo='concurrent' where id=$1", [item.id]);
  await denied(() => call('apply', { id: stale.id }), 'DA_CONFLICT');

  // Natural and composite primary keys are supported without exposing generated identifiers.
  const accountCode = `__fixture_${suffix}`;
  const account = await create('account_master', { account_code: accountCode, account_name: 'fixture account' }, 'business-natural-key');
  assert.deepEqual(account.key, { account_code: accountCode });
  const naturalUpdate = await call('prepare', { table: 'account_master', operation: 'update', key: account.key, expectedVersion: account.record._version, values: { account_name: 'updated fixture account' }, idempotencyKey: 'business-natural-update' });
  assert.equal((await call('apply', { id: naturalUpdate.id })).record.account_name, 'updated fixture account');
  const view = catalog.tables.find(table => table.type === 'view');
  await denied(() => call('prepare', { table: view.table, operation: 'create', values: { arbitrary: 'x' }, idempotencyKey: 'business-readonly-view' }), 'DA_FORBIDDEN');

  // The full gateway must preserve normal recipe/master price propagation, atomically.
  const ingredient = (await create('ingredients', { name: `__business_ingredient_${suffix}`, price: 100, unit_quantity: 100, tax_included: false }, 'business-create-ingredient')).record;
  const recipe = (await create('recipes', { name: `__business_recipe_${suffix}`, category: 'OEM', selling_price: 100, amazon_fee_enabled: true }, 'business-create-recipe')).record;
  const recipeItem = (await create('recipe_items', { recipe_id: recipe.id, item_type: 'ingredient', item_name: ingredient.name, ingredient_id: ingredient.id, usage_amount: 50, unit_price: 100, unit_quantity: 100, tax_included: false }, 'business-create-recipe-item')).record;
  assert.equal(recipeItem.cost, 54, 'Recipe-item create derives cost from its linked master');
  const masterPlan = await prepare('ingredients', 'update', { price: 200 }, ingredient, 'business-master-price-update');
  await call('apply', { id: masterPlan.id });
  assert.equal((await call('read', { table: 'recipe_items', filters: { id: recipeItem.id } })).items[0].cost, 108);
  const currentRecipe = (await call('read', { table: 'recipes', filters: { id: recipe.id } })).items[0];
  assert.equal(currentRecipe.total_cost, 119, 'Master price propagation retains the current Amazon fee');
  const recipePricePlan = await prepare('recipes', 'update', { selling_price: 200 }, currentRecipe, 'business-recipe-price-update');
  const recipePriceApplied = await call('apply', { id: recipePricePlan.id });
  assert.equal(recipePriceApplied.record.selling_price, 200);
  assert.equal(recipePriceApplied.record.total_cost, 130, 'Selling-price updates recalculate the Amazon fee before returning');
  assert.equal(recipePriceApplied.record._version, (await call('read', { table: 'recipes', filters: { id: recipe.id } })).items[0]._version, 'Apply returns the final synchronized version');
  assert.ok(Object.hasOwn(recipePriceApplied.related, 'before') && Object.hasOwn(recipePriceApplied.related, 'after'));
  for (const [table, values] of [
    ['recipes', { selling_price: -1 }], ['recipes', { selling_price: 1000000001 }], ['recipes', { yield_rate: 0 }],
    ['recipes', { lot_size: 1.5 }], ['recipes', { case_quantity: -1 }],
    ['ingredients', { price: -1 }], ['ingredients', { unit_quantity: 0 }], ['ingredients', { calories: -1 }],
    ['materials', { price: -1 }], ['expenses', { unit_price: -1 }], ['expenses', { unit_quantity: 0 }],
  ]) {
    await denied(() => db.query('select public.tsa_business_validate_values($1,$2,$3::jsonb,$4::jsonb)', [table, 'update', JSON.stringify(values), JSON.stringify({ id: randomUUID() })]), 'DA_INVALID_INPUT');
  }
  for (const [table, values] of [['general_ledger', { debit_amount: -100 }], ['brand_store_sales_adjustments', { adjustment_amount: -100 }], ['recipe_items', { unit_quantity: -1 }]]) {
    await db.query('select public.tsa_business_validate_values($1,$2,$3::jsonb,$4::jsonb)', [table, 'update', JSON.stringify(values), JSON.stringify({ id: randomUUID() })]);
  }

  // The legacy tools gain price fields only on explicitly full connections.
  await db.query("update public.data_access_connections set scopes=array['business:full','recipes:read','recipes:write','ingredients:read','ingredients:write'] where id=$1", [connectionId]);
  const legacy = async (action, payload, hash = tokenHash) => (await db.query('select public.tsa_data_access_v1($1,$2,$3::jsonb) result', [hash, action, JSON.stringify(payload)])).rows[0].result;
  const legacyRecipe = (await legacy('read', { resource: 'recipes', id: recipe.id })).items[0];
  const legacyPricePlan = await legacy('prepare', { resource: 'recipes', operation: 'update', id: recipe.id, expectedVersion: legacyRecipe._version, values: { selling_price: 300 }, idempotencyKey: 'legacy-full-price-update' });
  const legacyPriceApplied = await legacy('apply', { id: legacyPricePlan.id });
  assert.equal(legacyPriceApplied.record.selling_price, 300);
  assert.equal(legacyPriceApplied.record.total_cost, 140);
  assert.equal(legacyPriceApplied.record._version, (await legacy('read', { resource: 'recipes', id: recipe.id })).items[0]._version);
  const legacyIngredient = (await legacy('read', { resource: 'ingredients', id: ingredient.id })).items[0];
  const legacyMasterPlan = await legacy('prepare', { resource: 'ingredients', operation: 'update', id: ingredient.id, expectedVersion: legacyIngredient._version, values: { price: 300, name: `__legacy_full_${suffix}` }, idempotencyKey: 'legacy-full-master-price' });
  assert.equal((await legacy('apply', { id: legacyMasterPlan.id })).record.price, 300);
  assert.equal((await call('read', { table: 'recipe_items', filters: { recipe_id: recipe.id } })).items[0].item_name, `__legacy_full_${suffix}`);
  const limitedHash = createHash('sha256').update(randomUUID()).digest('hex');
  await db.query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by) values('legacy partial fixture',$1,array['recipes:read','recipes:write'],now()+interval '1 hour','fixture')", [limitedHash]);
  const limitedRecipe = (await legacy('read', { resource: 'recipes', id: recipe.id }, limitedHash)).items[0];
  await denied(() => legacy('prepare', { resource: 'recipes', operation: 'update', id: recipe.id, expectedVersion: limitedRecipe._version, values: { selling_price: 400 }, idempotencyKey: 'legacy-partial-price-denial' }, limitedHash), 'DA_INVALID_INPUT');

  // A failed audit must roll back the principal data, related data and plan status together.
  const current = (await call('read', { table: 'company_links', filters: { id: item.id } })).items[0];
  const atomic = await prepare('company_links', 'update', { memo: 'must rollback' }, current, 'business-atomic-update');
  await db.query("create function pg_temp.fail_business_audit() returns trigger language plpgsql as $$ begin raise exception 'fixture_business_audit_failure'; end $$");
  await db.query('create trigger fixture_business_audit_failure before insert on public.business_data_access_audit for each row execute function pg_temp.fail_business_audit()');
  await denied(() => call('apply', { id: atomic.id }), 'fixture_business_audit_failure');
  assert.equal((await call('read', { table: 'company_links', filters: { id: item.id } })).items[0].memo, 'concurrent');
  assert.equal((await db.query('select status from public.business_data_access_changes where id=$1', [atomic.id])).rows[0].status, 'pending');
  await db.query('drop trigger fixture_business_audit_failure on public.business_data_access_audit');
  const deleted = await prepare('company_links', 'delete', null, current, 'business-delete-link');
  assert.equal((await call('apply', { id: deleted.id })).record, null);
  assert.equal((await call('read', { table: 'company_links', filters: { id: item.id } })).items.length, 0);
  const crossHash = createHash('sha256').update(randomUUID()).digest('hex');
  await db.query("insert into public.data_access_connections(label,token_hash,scopes,expires_at,created_by) values('other full fixture',$1,array['business:full'],now()+interval '1 hour','fixture')", [crossHash]);
  await denied(() => call('apply', { id: plan.id }, crossHash), 'DA_NOT_FOUND');
  await db.query('update public.data_access_connections set revoked_at=now() where id=$1', [connectionId]);
  await denied(() => call('apply', { id: plan.id }), 'DA_UNAUTHORIZED');
  await db.query("update public.data_access_connections set revoked_at=null,expires_at=now()-interval '1 second' where id=$1", [connectionId]);
  await denied(() => call('catalog', {}), 'DA_UNAUTHORIZED');
  return { catalogTables: catalog.tables.length, writableTables: catalog.tables.filter(table => table.writable).length, readOnlyTables: catalog.tables.filter(table => !table.writable).length, scopedDenial: true, generatedAndPrimaryKeysProtected: true, typedValues: true, establishedMasterNumericRules: true, registration: true, updates: true, deletes: true, naturalPrimaryKey: true, recipeMasterCostPropagation: true, finalSynchronizedVersion: true, immutablePlans: true, immutableAudit: true, optimisticConflict: true, idempotency: true, auditAtomicity: true, revocationAndExpiry: true };
}

async function main() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL not configured');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='10s'");
    if (process.argv.includes('--apply')) {
      const index = process.argv.indexOf('--backup-dir');
      if (index < 0 || !process.argv[index + 1]) throw Error('--backup-dir required');
      const backupDir = path.resolve(process.argv[index + 1]);
      assert.ok(fs.statSync(backupDir).isDirectory());
      const previous = await db.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'tsa_business_%' or p.proname in ('tsa_data_access_v1','tsa_data_access_validate_full_values'))");
      const constraints = await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.data_access_connections'::regclass and contype='c'");
      fs.writeFileSync(path.join(backupDir, 'business-access-before.json'), JSON.stringify({ functions: previous.rows, constraints: constraints.rows }, null, 2), { flag: 'wx', mode: 0o600 });
      await db.query(fs.readFileSync(helperPath, 'utf8'));
      await db.query(fs.readFileSync(migrationPath, 'utf8'));
      await db.query(fs.readFileSync(masterPath, 'utf8'));
      const result = await verify(db);
      await db.query('commit');
      console.log(JSON.stringify({ applied: true, ...result }));
    } else {
      await db.query(fs.readFileSync(helperPath, 'utf8'));
      await db.query(fs.readFileSync(migrationPath, 'utf8'));
      await db.query(fs.readFileSync(masterPath, 'utf8'));
      const result = { ...await verify(db), ...await fixtures(db) };
      await db.query(fs.readFileSync(migrationPath, 'utf8'));
      await db.query(fs.readFileSync(masterPath, 'utf8'));
      await verify(db);
      await db.query('rollback');
      console.log(JSON.stringify({ dryRun: true, rolledBack: true, migrationIdempotent: true, ...result }));
    }
  } catch (error) { await db.query('rollback').catch(() => {}); throw error; }
  finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { migrationPath, helperPath, verify, fixtures };
