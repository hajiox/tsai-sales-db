const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const fixtures = path.join(root, '.vercel', `staff-setup-fixtures-${crypto.randomUUID()}`);
const pwsh = process.env.STAFF_SETUP_TEST_PWSH || execFileSync('where.exe', ['pwsh.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/).find(candidate => fs.existsSync(candidate));
assert(fs.existsSync(pwsh), 'This owner-PC test requires the installed PowerShell 7.');
execFileSync(pwsh, ['-NoProfile', '-NonInteractive', '-File',
  path.join(__dirname, 'create-staff-setup-test-certificates.ps1'), '-OutputDirectory', fixtures],
{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const certificates = Object.fromEntries(['valid', 'expired', 'future', 'leaf', 'subordinate']
  .map(name => [name, fs.readFileSync(path.join(fixtures, `${name}.cer`))]));
let content = certificates.valid;
let mode = 'regular';
let closed = 0;
const opens = [];
const publicAsset = path.join(root, 'assets', 'docscanner-staff', 'staff-root-ca.cer');
const fakeFs = {
  async open(filePath, flags) {
    opens.push({ filePath, flags });
    if (mode === 'missing') throw new Error('private/path and sensitive error detail');
    return {
      async stat() { return { isFile: () => mode !== 'directory', size: mode === 'growth' ? content.length - 1 : content.length }; },
      async read(buffer, offset, length) {
        const count = Math.min(length, content.length);
        content.copy(buffer, offset, 0, count);
        return { bytesRead: count };
      },
      async close() { closed += 1; },
    };
  },
};

function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  const context = {
    module: compiledModule, exports: compiledModule.exports, Buffer, Uint8Array, Response, URL,
    process: { cwd: () => root },
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
  };
  vm.runInNewContext(source, context, { filename });
  return compiledModule.exports;
}

async function main() {
  const helper = load('lib/docscanner-staff-setup.ts', { 'node:fs/promises': fakeFs });
  const validate = helper.validateDocscannerStaffCertificate;
  const accepted = validate(certificates.valid);
  assert.deepEqual(accepted.der, certificates.valid);
  assert.equal(accepted.fingerprint256, new crypto.X509Certificate(certificates.valid).fingerprint256);
  assert(accepted.subject.includes('Test Only'));
  // A valid small root is accepted without an arbitrary 1 KiB minimum.
  assert(certificates.valid.length < 1024);
  const reject = (bytes, now) => assert.throws(() => validate(bytes, now), /証明書の配布準備/);
  for (const name of ['expired', 'future', 'leaf', 'subordinate']) reject(certificates[name]);
  reject(Buffer.alloc(0));
  reject(Buffer.alloc(16 * 1024 + 1));
  reject(Buffer.from('not a certificate'));
  reject(Buffer.concat([certificates.valid, Buffer.from('private payload must never be returned')]));
  reject(Buffer.from(new crypto.X509Certificate(certificates.valid).toString()));
  const forged = Buffer.from(certificates.valid); forged[forged.length - 1] ^= 1;
  reject(forged);
  reject(certificates.valid, NaN);
  reject(certificates.valid, Date.parse(accepted.validFrom) - 1);
  reject(certificates.valid, Date.parse(accepted.validTo));

  const loaded = await helper.loadDocscannerStaffCertificate();
  assert.deepEqual(loaded.der, certificates.valid);
  assert.equal(closed, 1);
  for (const next of ['missing', 'directory', 'growth']) {
    mode = next;
    assert.equal(await helper.loadDocscannerStaffCertificate(), null);
  }
  mode = 'regular'; content = forged;
  assert.equal(await helper.loadDocscannerStaffCertificate(), null);
  content = Buffer.alloc(16 * 1024 + 1);
  assert.equal(await helper.loadDocscannerStaffCertificate(), null);
  content = certificates.valid;

  const routeOverride = { '@/lib/docscanner-staff-setup': helper };
  const page = load('app/api/docscanner-staff-setup/route.ts', routeOverride);
  const download = load('app/api/docscanner-staff-setup/certificate/route.ts', routeOverride);
  for (const route of [page, download]) {
    assert.equal(route.runtime, 'nodejs');
    assert.equal(route.dynamic, 'force-dynamic');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(route[method], undefined);
  }
  const query = '?path=private/root.pfx&file=../../private/server.key&token=must-not-be-echoed';
  const opensBeforePage = opens.length;
  const htmlResponse = await page.GET(new Request(`https://v0-tsa-19.vercel.app/api/docscanner-staff-setup${query}`));
  assert.equal(htmlResponse.status, 200);
  assert.equal(opens.length, opensBeforePage, 'The simple entry page does not read certificates or other files.');
  const html = await htmlResponse.text();
  for (const phrase of ['DocScanner チャーシュー製造入力', '社内Wi-Fiで開く', '証明書追加・VPN設定不要', '未登録/期限切れ端末は管理者が登録']) assert(html.includes(phrase));
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), [
    'http://192.168.110.200:8444/staff/char-siu-production', 'http://192.168.110.200:8444/staff/register',
  ]);
  for (const removed of [accepted.fingerprint256, 'CA証明書', 'VPNとデバイス管理', 'インストール', '証明書信頼設定', '/api/docscanner-staff-setup/certificate', 'https://192.168.110.200:8444']) assert(!html.includes(removed));
  assert(!html.includes('must-not-be-echoed'));
  assert(!/<(?:script|iframe|form|img)\b/i.test(html));
  assert(!/TSAシステム|財務分析システム/.test(html));
  const fixed = helper.renderDocscannerStaffSetupPage({ ...accepted,
    subject: '<script>alert("unexpected")</script>', fingerprint256: "<>&\"'", validFrom: '<unsafe>', validTo: '<unsafe>' });
  assert.equal(fixed, html, 'The entry page ignores request and certificate metadata.');

  const certificateResponse = await download.GET(new Request(`https://v0-tsa-19.vercel.app/api/docscanner-staff-setup/certificate${query}`));
  assert.equal(certificateResponse.status, 200);
  assert.deepEqual(Buffer.from(await certificateResponse.arrayBuffer()), certificates.valid);
  assert.equal(certificateResponse.headers.get('Content-Type'), 'application/pkix-cert');
  assert.equal(certificateResponse.headers.get('Content-Disposition'), 'attachment; filename="staff-root-ca.cer"');
  for (const response of [htmlResponse, certificateResponse]) {
    assert(response.headers.get('Cache-Control').includes('no-store'));
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
    assert(response.headers.get('Content-Security-Policy').includes("script-src 'none'"));
  }
  mode = 'missing';
  const opensBeforeMissingPage = opens.length;
  const missingPage = await page.GET();
  assert.equal(missingPage.status, 200); assert.equal(await missingPage.text(), html);
  assert.equal(opens.length, opensBeforeMissingPage, 'A missing certificate cannot block the entry page.');
  const unavailable = await download.GET();
  assert.equal(unavailable.status, 503);
  const body = await unavailable.text();
  assert(body.includes(helper.DOCSCANNER_STAFF_SETUP_UNAVAILABLE));
  assert(!body.includes('private/path'));
  mode = 'regular'; content = certificates.leaf;
  assert.equal((await download.GET()).status, 503);
  assert(opens.every(row => row.filePath === publicAsset && row.flags === 'r'));
  const config = (await import(require('node:url').pathToFileURL(path.join(root, 'next.config.mjs')).href)).default;
  for (const name of ['/api/docscanner-staff-setup', '/api/docscanner-staff-setup/certificate']) {
    assert.deepEqual(config.outputFileTracingIncludes[name], ['./assets/docscanner-staff/staff-root-ca.cer']);
  }
  fs.writeFileSync(path.join(fixtures, 'result.json'), JSON.stringify({
    publicFixtureOnly: true, certificateValidation: 'pass', fixedReadOnlyRoutes: 'pass',
    privatePayloadRejected: true, responseHeaders: 'pass', fixedLanEntry: 'pass', pageCertificateReads: 0, businessWrites: 0,
  }, null, 2));
  console.log('DocScanner staff entry: fixed LAN links, certificate-independent page, retained safe certificate GET and headers PASS; business writes 0.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
