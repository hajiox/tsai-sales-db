const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { randomBytes } = require("node:crypto");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function loadTs(relative, stubs = {}) {
  const filename = path.join(root, relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = Module.createRequire(filename);
  instance.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  instance._compile(compiled, filename);
  return instance.exports;
}

async function main() {
  const crypto = loadTs("lib/finance-acquisition/credential-crypto.ts");
  const key = randomBytes(32).toString("base64");
  const name = "BASE_REFRESH_TOKEN";
  const secret = "test-only-日本語-token";
  const first = crypto.encryptApiCredential(name, secret, key);
  const second = crypto.encryptApiCredential(name, secret, key);
  assert.notEqual(first, second, "Encryption must use a fresh IV for each saved credential");
  assert.equal(crypto.decryptApiCredential(name, first, key), secret);
  assert.equal(first.includes(secret), false);
  assert.throws(() => crypto.decryptApiCredential("META_ACCESS_TOKEN", first, key), /復号/, "Ciphertext is bound to the setting name");
  assert.throws(() => crypto.decryptApiCredential(name, first, randomBytes(32).toString("base64")), /復号/);
  const fields = first.split(":");
  const bytes = Buffer.from(fields[3], "base64");
  bytes[0] ^= 1;
  fields[3] = bytes.toString("base64");
  assert.throws(() => crypto.decryptApiCredential(name, fields.join(":"), key), /復号/, "Tampering must fail authentication");
  assert.throws(() => crypto.encryptApiCredential(name, secret, ""), /暗号化キー/);
  assert.throws(() => crypto.decryptApiCredential(name, `${first}:extra`, key), /形式/);

  const provenance = loadTs("lib/finance-acquisition/provenance.ts");
  assert.equal(provenance.salesAcquisitionRoute({ acquisitionPath: "api" }), "api");
  assert.equal(provenance.salesAcquisitionRoute({ codex_job_id: "job", import_source: "csv" }), "bridge");
  assert.equal(provenance.salesAcquisitionRoute({ import_source: "csv" }), "manual");
  assert.equal(provenance.salesAcquisitionRoute({ source: "codex_app_manual", codex_job_id: "saved-job" }), "manual");
  assert.equal(provenance.financeAcquisitionRoute({ execution_route: "google_ads_api" }), "api");
  assert.equal(provenance.financeAcquisitionRoute({}, "saved-job"), "bridge");
  assert.equal(provenance.salesAcquisitionRoute({ source: "unverified" }), "unknown");
  assert.equal(provenance.isPersistedAcquisition({ persisted: true }), true);
  for (const value of [null, {}, { persisted: "true" }, { status: "completed" }]) assert.equal(provenance.isPersistedAcquisition(value), false);
  for (const message of ["https://example.invalid/report?signature=test", "Bearer test-secret", "access_token=test-secret", "A".repeat(40)]) {
    const safe = provenance.safeAcquisitionError(new Error(message));
    assert.equal(safe.includes(message), false, "Remote credentials/URLs must not reach job status");
  }
  assert.equal(provenance.safeAcquisitionError(Object.assign(new Error("private remote body"), { code: "account_verification_required" })), "公式API確認: account_verification_required");

  const capabilities = loadTs("lib/finance-acquisition/capabilities.ts", { "./credential-store": { getConfiguredApiCredentialNames: async () => new Set() } });
  const configured = new Set(["BASE_ACCESS_TOKEN"]);
  const noIdentity = capabilities.financeCapability("sales", "base", configured);
  assert.equal(noIdentity.api_ready, false, "A token alone must not skip account verification");
  assert.deepEqual(noIdentity.missing_config, ["BASE_SHOP_ID"]);
  configured.add("BASE_SHOP_ID");
  assert.equal(capabilities.financeCapability("sales", "base", configured).preferred_route, "api");
  for (const [channel, token, identity] of [["amazon", "AMAZON_SP_API_ACCESS_TOKEN", "AMAZON_SP_API_SELLER_ID"], ["yahoo", "YAHOO_SHOPPING_ACCESS_TOKEN", "YAHOO_SHOPPING_SELLER_ID"]]) {
    assert.equal(capabilities.financeCapability("sales", channel, new Set([token])).api_ready, false);
    assert.equal(capabilities.financeCapability("sales", channel, new Set([token, identity])).api_ready, true);
  }
  assert.equal(capabilities.financeCapability("ec_profit", "rakuten", new Set()).preferred_route, "bridge");
  for (const channel of ["mercari", "tiktok", "qoo10"]) {
    const retired = capabilities.financeCapability("sales", channel, configured);
    assert.equal(retired.preferred_route, "none");
    assert.equal(retired.api_ready, false);
  }

  let session = null;
  const auth = loadTs("lib/finance-acquisition/auth.ts", {
    "next-auth": { getServerSession: async () => session },
    "@/app/api/auth/[...nextauth]/route": { authOptions: {} },
  });
  assert.equal(await auth.isFinanceAdmin(), false);
  session = { user: { email: "different@example.invalid" } };
  assert.equal(await auth.isFinanceAdmin(), false);
  session = { user: { email: "AIZUBRANDHALL@gmail.com" } };
  assert.equal(await auth.isFinanceAdmin(), true);
  assert.equal(auth.isSameOriginFinanceRequest(new Request("https://tsa.example.invalid/api", { headers: { origin: "https://other.example.invalid" } })), false);
  assert.equal(auth.isSameOriginFinanceRequest(new Request("https://tsa.example.invalid/api", { headers: { origin: "https://tsa.example.invalid" } })), true);
  let allowed = false;
  let dispatched = 0;
  const runRoute = loadTs("app/api/web-sales/acquisition/run/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/finance-acquisition/auth": { isFinanceAdmin: async () => allowed, isSameOriginFinanceRequest: auth.isSameOriginFinanceRequest },
    "@/lib/finance-acquisition/dispatch": { TASK_KIND: { web_sales_import: "sales" }, enqueueFinanceAcquisitions: async () => { dispatched++; return { ok: true }; } },
    "@/lib/web-sales-automation/date": { validatePeriod: () => ({ startDate: "2026-09-01", endDate: "2026-09-30", reportMonth: "2026-09-01" }) },
  });
  const newRequest = (origin = "https://tsa.example.invalid") => new Request("https://tsa.example.invalid/api", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ taskKey: "web_sales_import", channels: ["base"], startDate: "2026-09-01", endDate: "2026-09-30" }) });
  assert.equal((await runRoute.POST(newRequest())).status, 401);
  assert.equal(dispatched, 0, "Unauthenticated requests must not enqueue acquisitions");
  allowed = true;
  assert.equal((await runRoute.POST(newRequest("https://other.example.invalid"))).status, 403);
  assert.equal(dispatched, 0, "Cross-origin requests must not enqueue acquisitions");
  assert.equal((await runRoute.POST(newRequest())).status, 200);
  assert.equal(dispatched, 1);
  // Security boundary scans supplement behavioral crypto/auth tests. These
  // ensure new handlers call authorization before consuming untrusted input.
  for (const relative of ["app/api/web-sales/acquisition/run/route.ts", "app/api/web-sales/acquisition/connections/route.ts"]) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    const authorizationIndex = source.indexOf("isFinanceAdmin()");
    const bodyIndex = source.indexOf("request.text()");
    assert(authorizationIndex >= 0 && bodyIndex >= 0 && authorizationIndex < bodyIndex, `${relative} requires admin before body read`);
    assert(source.includes("isSameOriginFinanceRequest(request)"), `${relative} requires an origin check`);
    assert(source.includes("Buffer.byteLength(text)"), `${relative} bounds its payload`);
  }
  console.log("Finance acquisition security: authenticated encryption, secret-safe provenance, account requirements and route authorization passed");
}

main().catch(() => { console.error("Finance acquisition security tests failed"); process.exitCode = 1; });
