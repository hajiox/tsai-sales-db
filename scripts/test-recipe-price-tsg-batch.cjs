const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'recipe-price-tsg-notification.ts'),
  'utf8',
)
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText
const loaded = { exports: {} }
new Function('module', 'exports', 'require', output)(loaded, loaded.exports, require)

const body = loaded.exports.buildRecipePriceTsgBatchRequest('batch-id', [
  {
    id: 'revision-1',
    recipe_id: 'recipe-1',
    previous_price_ex_tax: '1000',
    new_price_ex_tax: '1100',
    previous_price_incl_tax: 1080,
    new_price_incl_tax: 1188,
    recipe_snapshot: { recipeName: '商品A', ecProductName: 'EC商品A' },
    tsg_batch_id: 'batch-id',
    created_at: '2026-08-24T00:00:00.000Z',
  },
  {
    id: 'revision-2',
    recipe_id: 'recipe-2',
    previous_price_ex_tax: 2000,
    new_price_ex_tax: 2100,
    previous_price_incl_tax: 2160,
    new_price_incl_tax: 2268,
    recipe_snapshot: { recipeName: '商品B' },
    tsg_batch_id: 'batch-id',
    created_at: '2026-08-24T00:01:00.000Z',
  },
])

assert.equal(body.sourceKey, 'batch:batch-id')
assert.equal(body.batchId, 'batch-id')
assert.equal(body.items.length, 2)
assert.deepEqual(body.items.map(item => item.revisionId), ['revision-1', 'revision-2'])
assert.equal(body.items[0].ecProductName, 'EC商品A')
assert.equal(body.items[1].recipeName, '商品B')

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260824120000_batch_recipe_price_tsg_notifications.sql'),
  'utf8',
)
assert.match(migration, /release_recipe_ec_price_batch_jobs/)
assert.match(migration, /claim_recipe_price_tsg_batch_notifications/)
assert.match(migration, /revision\.tsg_batch_id IS NULL/)

console.log('TSA batch recipe price TSG notification checks passed.')
