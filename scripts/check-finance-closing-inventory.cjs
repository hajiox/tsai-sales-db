const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encode } = require('next-auth/jwt');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
async function main() {
  const base = process.argv[2] || 'http://localhost:3045';
  const secure = base.startsWith('https:');
  const cookieName = secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { email: 'aizubrandhall@gmail.com' }, maxAge: 600 });
  const get = async url => {
    const response = await fetch(base + url, { headers: { Cookie: `${cookieName}=${token}`, Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200, `${url}: ${response.status}`); return response.json();
  };
  assert.equal((await fetch(base + '/api/finance/closing-inventory')).status, 401);
  const forbidden = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { email: 'unauthorized@example.invalid' }, maxAge: 60 });
  assert.equal((await fetch(base + '/api/finance/closing-inventory', { headers: { Authorization: `Bearer ${forbidden}` } })).status, 401);
  assert.equal((await fetch(base + '/api/finance/closing-inventory?fiscalYear=abc', { headers: { Authorization: `Bearer ${token}` } })).status, 400);
  const report = await get('/api/finance/closing-inventory?fiscalYear=2026');
  assert.equal(report.fiscalYear, 2026); assert.equal(report.rows.length, 8);
  assert.equal(report.total, report.rows.reduce((sum, r) => sum + (r.amount ?? 0), 0));
  const empty = await get('/api/finance/closing-inventory?fiscalYear=2099');
  assert.ok(empty.rows.every(r => r.amount === null && r.status === 'missing'));
  const endpoints = ['/api/brand-store/inventory', '/api/recipe/inventory', '/api/wholesale/inventory', '/api/wholesale/inventory/other-stores'];
  const [brand, manufacturing, warehouse, partner] = await Promise.all(endpoints.map(endpoint => get(endpoint + '?fiscalYear=2026')));
  const truncate = value => Math.trunc(Math.abs(value - Math.round(value)) < Number.EPSILON * Math.max(1, Math.abs(value)) * 2 ? Math.round(value) : value);
  const expected = [
    brand.items.reduce((s, i) => s + truncate(Math.round(Number(i.selling_price || 0) * .7 * 100) / 100 * Number(i.quantity || 0)), 0),
    ...['ingredient', 'material'].map(type => manufacturing.items.filter(i => i.item_type === type).reduce((s, i) => s + truncate(Number(i.tax_included_cost || 0) * Number(i.stock_count || 0)), 0)),
    warehouse.items.filter(i => i.review_status !== 'excluded').reduce((s, i) => s + truncate(Math.round(Number(i.wholesale_price || 0) * 100) * Math.round(Number(i.quantity || 0) * 1000) / 100000), 0),
    partner.items.reduce((s, i) => s + truncate(Number(i.inventory_value || 0)), 0),
    857476, 134756, 120863,
  ];
  assert.deepEqual(report.rows.map(r => r.amount), expected);
  const brandEx = i => Math.round(Number(i.selling_price || 0) * .7 * 100) / 100 * Number(i.quantity || 0);
  const expectedExcluded = [expected[0],
    ...['ingredient', 'material'].map(type => manufacturing.items.filter(i => i.item_type === type).reduce((s, i) => {
      const rate = i.tax_rate ?? (i.item_type === 'material' || ['本みりん','本料理清酒','HEIKO OPPシート #25 100×100 無地'].includes(String(i.item_name).normalize('NFKC').trim()) ? 10 : 8);
      return s + truncate(Number(i.tax_included_cost || 0) * Number(i.stock_count || 0) * 100 / (100 + rate));
    }, 0)), expected[3],
    partner.items.reduce((s, i) => s + truncate(Number(i.inventory_value || 0) * 100 / 108), 0),
    793960, 122506, 109876,
  ];
  const expectedIncluded = [brand.items.reduce((s, i) => s + truncate(brandEx(i) * (100 + Number(i.tax_rate)) / 100), 0), expected[1], expected[2],
    warehouse.items.filter(i => i.review_status !== 'excluded').reduce((s, i) => s + truncate(Math.round(Number(i.wholesale_price || 0) * 100) * Math.round(Number(i.quantity || 0) * 1000) / 100000 * (100 + Number(i.tax_rate)) / 100), 0),
    expected[4], ...expected.slice(5),
  ];
  assert.deepEqual(report.rows.map(r => r.amountExcluded), expectedExcluded);
  assert.deepEqual(report.rows.map(r => r.amountIncluded), expectedIncluded);
  assert.equal(report.totalExcluded, expectedExcluded.reduce((a,b)=>a+b,0));
  assert.equal(report.totalIncluded, expectedIncluded.reduce((a,b)=>a+b,0));
  console.log(JSON.stringify({taxExcluded:report.totalExcluded,taxIncluded:report.totalIncluded,validation:'All 8 categories independently reconciled in both tax bases'}));
  console.log(JSON.stringify({ fiscalYear: report.fiscalYear, amounts: report.rows.map(r => ({ label: r.label, amount: r.amount, status: r.status })), total: report.total, validation: 'source API amounts match; auth and missing-year checks passed' }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsa-finance-inventory-'));
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setCookie({ name: cookieName, value: token, url: base, httpOnly: true, secure });
    const errors = []; page.on('pageerror', err => errors.push(err.message));
    await page.setViewport({ width: 1440, height: 1050 });
    await page.goto(base + '/finance/closing-inventory', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('tbody tr', { timeout: 60000 });
    await page.select('select[aria-label="決算年度"]', '2026');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 8 && !document.querySelector('[role="status"]'));
    assert.equal(await page.$$eval('tbody tr', rows => rows.length), 8);
    const client = await page.createCDPSession();
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    await page.$$eval('button', buttons => buttons.find(b => b.textContent === 'Excel作成').click());
    const target = path.join(directory, '決算棚卸し一覧_2026年度.xlsx');
    for (let i = 0; i < 100 && !fs.existsSync(target); i++) await new Promise(resolve => setTimeout(resolve, 300));
    assert.ok(fs.existsSync(target), 'Excel downloaded');
    const book = XLSX.readFile(target);
    assert.equal(book.SheetNames.length, 9);
    assert.equal(book.Sheets['決算棚卸し一覧'].F15.v, report.totalExcluded);
    assert.equal(book.Sheets['決算棚卸し一覧'].G15.v, report.totalIncluded);
    await page.screenshot({ path: path.join(directory, 'desktop.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(directory, 'mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'mobile page overflow');
    assert.deepEqual(errors, []);
    console.log(`UI and downloaded Excel passed: ${directory}`);
  } finally { await browser.close(); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
