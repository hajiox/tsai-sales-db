const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { randomBytes, createHash } = require("node:crypto");
const ts = require("typescript");
const { NextRequest } = require("next/server");
const root = path.resolve(__dirname, "..");
function load(relative, stubs = {}) {
  const filename = path.join(root, relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = Module.createRequire(filename);
  instance.require = name => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return instance.exports;
}

async function main() {
  const crypto = load("lib/finance-acquisition/credential-crypto.ts");
  const oauth = load("lib/finance-acquisition/yahoo-oauth.ts", { "./credential-crypto": crypto });
  const key = randomBytes(32).toString("base64");
  const now = Date.now();
  const user = "aizubrandhall@gmail.com";
  const clientId = "test-only-client";
  const clientSecret = "test-only-secret";
  const start = oauth.createYahooOAuthStart(user, clientId, key, now);
  const authorization = new URL(start.authorizationUrl);
  assert.equal(authorization.origin, "https://auth.login.yahoo.co.jp");
  assert.equal(authorization.searchParams.get("redirect_uri"), oauth.YAHOO_OAUTH_CALLBACK);
  assert.equal(authorization.searchParams.get("scope"), "openid profile");
  assert.equal(authorization.searchParams.get("prompt"), "consent");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.has("client_secret"), false);
  assert.equal(start.cookie.includes(user), false);
  const state = authorization.searchParams.get("state");
  const query = new URLSearchParams({ state, code: "abcdefgh" });
  const verified = oauth.validateYahooOAuthCallback(start.cookie, query, user.toUpperCase(), clientId, key, now + 1000);
  assert.equal(verified.code, "abcdefgh");
  assert.equal(createHash("sha256").update(verified.verifier).digest("base64url"), authorization.searchParams.get("code_challenge"));
  for (const [cookie, params, who, id, at] of [
    [undefined, query, user, clientId, now],
    [start.cookie + "corrupt", query, user, clientId, now],
    [start.cookie, query, "different@example.invalid", clientId, now],
    [start.cookie, query, user, "changed-client", now],
    [start.cookie, query, user, clientId, now + 600001],
    [start.cookie, query, user, clientId, now - 1],
    [start.cookie, new URLSearchParams({ state: "mismatch", code: "abcdefgh" }), user, clientId, now],
    [start.cookie, new URLSearchParams(`state=${state}&state=${state}&code=abcdefgh`), user, clientId, now],
    [start.cookie, new URLSearchParams(`state=${state}&code=abcdefgh&code=ijklmnop`), user, clientId, now],
    [start.cookie, new URLSearchParams({ state, code: "abcdefgh", error: "access_denied" }), user, clientId, now],
    [start.cookie, new URLSearchParams({ state, code: "bad\r\ncode" }), user, clientId, now],
  ]) assert.throws(() => oauth.validateYahooOAuthCallback(cookie, params, who, id, key, at));
  assert.throws(() => oauth.createYahooOAuthStart(user, clientId, undefined));
  let exchangeCalls = 0;
  const tokenResponse = { access_token: "test-only-access", refresh_token: "test-only-refresh", token_type: "Bearer", expires_in: 3600 };
  const fetcher = async (url, options) => {
    exchangeCalls++;
    assert.equal(url, "https://auth.login.yahoo.co.jp/yconnect/v2/token");
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`);
    assert.equal(options.body.get("code_verifier"), verified.verifier);
    assert.equal(options.body.get("redirect_uri"), oauth.YAHOO_OAUTH_CALLBACK);
    return new Response(JSON.stringify(tokenResponse));
  };
  assert.deepEqual(await oauth.exchangeYahooOAuthCode(verified.code, verified.verifier, clientId, clientSecret, fetcher), { accessToken: tokenResponse.access_token, refreshToken: tokenResponse.refresh_token });
  for (const value of [{}, { ...tokenResponse, refresh_token: "" }, { ...tokenResponse, token_type: "other" }, { ...tokenResponse, access_token: "bad\nvalue" }]) {
    await assert.rejects(oauth.exchangeYahooOAuthCode("abcdefgh", verified.verifier, clientId, clientSecret, async () => new Response(JSON.stringify(value))));
  }
  await assert.rejects(oauth.exchangeYahooOAuthCode("abcdefgh", verified.verifier, clientId, clientSecret, async () => new Response("private provider error", { status: 400 })), /Yahooのトークン交換/);

  let allowed = false;
  let credentials = { YAHOO_SHOPPING_CLIENT_ID: clientId, YAHOO_SHOPPING_CLIENT_SECRET: clientSecret, YAHOO_SHOPPING_SELLER_ID: "test-shop" };
  let persistenceAllowed = true;
  let saveAllowed = true;
  let saves = 0;
  let saved;
  const stubs = {
    "next-auth": { getServerSession: async () => ({ user: { email: user } }) },
    "@/app/api/auth/[...nextauth]/route": { authOptions: {} },
    "@/lib/finance-acquisition/auth": { isFinanceAdmin: async () => allowed },
    "@/lib/finance-acquisition/credential-store": {
      getApiCredentials: async () => credentials,
      assertApiCredentialPersistence: async () => { if (!persistenceAllowed) throw new Error("test-only-private-detail"); },
      saveRotatedApiCredentials: async values => { if (!saveAllowed) throw new Error("test-only-private-detail"); saves++; saved = values; },
    },
    "@/lib/finance-acquisition/yahoo-oauth": oauth,
  };
  const originalKey = process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY;
  const originalFetch = global.fetch;
  process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY = key;
  global.fetch = fetcher;
  try {
    const startRoute = load("app/api/web-sales/automation/oauth/yahoo/start/route.ts", stubs);
    const callbackRoute = load("app/api/web-sales/automation/oauth/yahoo/callback/route.ts", stubs);
    const startRequest = origin => new Request(`${oauth.YAHOO_OAUTH_ORIGIN}/api/web-sales/automation/oauth/yahoo/start`, { method: "POST", headers: origin ? { origin } : {} });
    assert.equal((await startRoute.POST(startRequest(oauth.YAHOO_OAUTH_ORIGIN))).status, 401);
    allowed = true;
    assert.equal((await startRoute.POST(startRequest("https://other.example.invalid"))).status, 403);
    assert.equal((await startRoute.POST(startRequest(null))).status, 403);
    const response = await startRoute.POST(startRequest(oauth.YAHOO_OAUTH_ORIGIN));
    assert.equal(response.status, 303);
    const responseCookie = response.cookies.get(oauth.YAHOO_OAUTH_COOKIE).value;
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(response.headers.get("set-cookie"), /Secure/);
    assert.match(response.headers.get("set-cookie"), /SameSite=lax/i);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const responseState = new URL(response.headers.get("location")).searchParams.get("state");
    const callback = (stateValue = responseState, cookie = responseCookie) => new NextRequest(`${oauth.YAHOO_OAUTH_CALLBACK}?code=abcdefgh&state=${stateValue}`, { headers: cookie ? { cookie: `${oauth.YAHOO_OAUTH_COOKIE}=${encodeURIComponent(cookie)}` } : {} });
    global.fetch = async () => { exchangeCalls++; return new Response(JSON.stringify(tokenResponse)); };
    const before = exchangeCalls;
    const failed = await callbackRoute.GET(callback("mismatch"));
    assert.equal(failed.headers.get("location"), `${oauth.YAHOO_OAUTH_ORIGIN}/web-sales/automation/api-connections?yahoo=error`);
    assert.equal(exchangeCalls, before);
    assert.equal(saves, 0);
    assert.match(failed.headers.get("set-cookie"), /Max-Age=0/);
    allowed = false;
    assert.equal((await callbackRoute.GET(callback())).headers.get("location").endsWith("?yahoo=error"), true);
    assert.equal(exchangeCalls, before);
    allowed = true;
    persistenceAllowed = false;
    await callbackRoute.GET(callback());
    assert.equal(exchangeCalls, before, "Durable encrypted storage must be checked before token exchange");
    assert.equal(saves, 0);
    persistenceAllowed = true;
    global.fetch = async () => { exchangeCalls++; return new Response("test-only-private-provider-error", { status: 400 }); };
    assert.equal((await callbackRoute.GET(callback())).headers.get("location"), `${oauth.YAHOO_OAUTH_ORIGIN}/web-sales/automation/api-connections?yahoo=error`);
    assert.equal(saves, 0);
    global.fetch = async () => { exchangeCalls++; return new Response(JSON.stringify(tokenResponse)); };
    saveAllowed = false;
    assert.equal((await callbackRoute.GET(callback())).headers.get("location"), `${oauth.YAHOO_OAUTH_ORIGIN}/web-sales/automation/api-connections?yahoo=error`);
    assert.equal(saves, 0, "A storage failure must never claim a completed connection");
    saveAllowed = true;
    const success = await callbackRoute.GET(callback());
    assert.equal(success.headers.get("location"), `${oauth.YAHOO_OAUTH_ORIGIN}/web-sales/automation/api-connections?yahoo=connected`);
    assert.equal(saves, 1);
    assert.deepEqual(saved, { YAHOO_SHOPPING_ACCESS_TOKEN: tokenResponse.access_token, YAHOO_SHOPPING_REFRESH_TOKEN: tokenResponse.refresh_token });
    assert.equal(success.headers.get("location").includes("abcdefgh"), false);
    credentials = {};
    assert.equal((await startRoute.POST(startRequest(oauth.YAHOO_OAUTH_ORIGIN))).status, 409);
  } finally {
    if (originalKey === undefined) delete process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    global.fetch = originalFetch;
  }
  console.log("Yahoo OAuth tests passed (no network or credentials).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
