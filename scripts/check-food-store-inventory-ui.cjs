const assert = require('node:assert/strict');
const { Client } = require('pg');
const { encode } = require('next-auth/jwt');
const puppeteer = require('puppeteer');
const path = require('node:path');
const os = require('node:os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
async function main() {
  const base = process.argv[2] || 'http://localhost:3033';
  const production = base.startsWith('https:');
  const cookieName = '__Secure-next-auth.session-token';
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { email: 'aizubrandhall@gmail.com' }, maxAge: 600 });
  const cookie = `${cookieName}=${token}`;
  const request = async (method, body) => {
    const response = await fetch(base + '/api/food-store/inventory', { method, headers: { Cookie: cookie, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await fetch(base + '/api/food-store/inventory')).status, 401);
  const actual = await request('GET');
  assert.equal(actual.status, 200);
  assert.equal(actual.data.inventory.workbook.sheets.length, 8);
  assert.equal(actual.data.inventory.fiscal_year, 2026);
  if (!production) {
    const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    let id;
    try {
      const workbook = { sheets: [{ name: '検証専用', rows: 3, cols: 4, cells: { A1: { value: '一時検証' }, B3: { value: 10 }, C3: { value: 2 }, D3: { value: 20, formula: '=B3*C3' } } }] };
      const row = await client.query("insert into public.food_store_closing_inventories(fiscal_year,inventory_date,source_filename,source_sha256,original_workbook,workbook,created_by,updated_by) values(2099,'2099-07-31','automated-test','temporary-test',$1,$1,'test','test') returning id", [JSON.stringify(workbook)]);
      id = row.rows[0].id;
      const saved = await request('PATCH', { id, revision: 1, action: 'save', changes: [{ sheet: '検証専用', address: 'C3', value: 3.5 }] });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.inventory.workbook.sheets[0].cells.D3.value, 35);
      assert.equal((await request('PATCH', { id, revision: 1, action: 'complete' })).status, 409);
      const complete = await request('PATCH', { id, revision: 2, action: 'complete' });
      assert.equal(complete.data.inventory.status, 'completed');
      assert.equal((await request('PATCH', { id, revision: 3, action: 'save', changes: [{ sheet: '検証専用', address: 'C3', value: 1 }] })).status, 400);
      assert.equal((await request('PATCH', { id, revision: 3, action: 'reopen' })).data.inventory.status, 'draft');
      const preserved = await client.query('select original_workbook from public.food_store_closing_inventories where id=$1',[id]);
      assert.deepEqual(preserved.rows[0].original_workbook, workbook);
      console.log('API: authorization, save/recalculate, stale revision, complete/reopen and original retention passed');
    } finally {
      if (id) {
        await client.query('BEGIN');
        await client.query('delete from public.food_store_closing_inventory_history where inventory_id=$1',[id]);
        await client.query("delete from public.food_store_closing_inventories where id=$1 and source_sha256='temporary-test'",[id]);
        await client.query('COMMIT');
      }
      await client.end();
    }
  }
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setCookie({ name: cookieName, value: token, url: base, secure: true, httpOnly: true }, { name: 'next-auth.session-token', value: token, url: base, httpOnly: true });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(base + '/food-store-analysis/inventory', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('[role="tab"]', { timeout: 60000 });
    assert.equal(await page.$$eval('[role="tab"]', tabs => tabs.length), 8);
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find(e => e.textContent === '道の駅食材在庫').click());
    await page.waitForFunction(() => document.querySelector('h2')?.textContent === '道の駅食材在庫');
    assert.ok((await page.$eval('main', e => e.innerText)).includes('793,960'));
    const file = path.join(os.tmpdir(), production ? 'tsa-food-inventory-production.png' : 'tsa-food-inventory-desktop.png');
    await page.screenshot({ path: file });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'tsa-food-inventory-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'page must fit mobile viewport');
    assert.deepEqual(errors, []);
    console.log(`UI: eight sheets, source subtotal, desktop/mobile, no page errors passed. Screenshot: ${file}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
