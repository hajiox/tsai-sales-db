const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
const jwt = require("jsonwebtoken");

const secret = crypto.randomBytes(32).toString("hex");
const now = Math.floor(Date.now() / 1000);
const email = "aizubrandhall@gmail.com";
const lifetime = 30 * 24 * 60 * 60;
const refreshWindow = 24 * 60 * 60;
const source = fs.readFileSync(path.join(__dirname, "..", "app", "api", "auth", "[...nextauth]", "route.ts"), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
const requireStub = (name) => {
  if (name === "next-auth") return { default: () => () => {} };
  if (name === "next-auth/providers/google") return { default: (config) => config };
  if (name === "jsonwebtoken") return { default: jwt };
  throw new Error(`Unexpected dependency: ${name}`);
};
new Function("require", "module", "exports", "process", "Date", code)(
  requireStub, loaded, loaded.exports, { env: { SUPABASE_JWT_SECRET: secret } }, { now: () => now * 1000 },
);
const callbacks = loaded.exports.authOptions.callbacks;
const ownToken = (claims = {}, options = {}) => jwt.sign({ email, role: "authenticated", exp: now + 60, ...claims }, secret, options);
const callback = (token, user) => callbacks.jwt({ token, user });

async function main() {
  assert.equal(await callbacks.signIn({ user: { email } }), true);
  assert.equal(await callbacks.signIn({ user: { email: "someone@example.test" } }), false);
  const login = await callback({ email, name: "unchanged" }, { email });
  const loginPayload = jwt.verify(login.supabaseAccessToken, secret, { algorithms: ["HS256"] });
  assert.equal(loginPayload.exp, now + lifetime);
  assert.equal(loginPayload.email, email);
  assert.equal(loginPayload.role, "authenticated");
  assert.equal(login.name, "unchanged");

  for (const expiry of [now - 1, now + 60, now + refreshWindow]) {
    const previous = ownToken({ exp: expiry });
    const refreshed = await callback({ email, supabaseAccessToken: previous });
    assert.notEqual(refreshed.supabaseAccessToken, previous);
    assert.equal(jwt.verify(refreshed.supabaseAccessToken, secret).exp, now + lifetime);
  }
  const fresh = ownToken({ exp: now + refreshWindow + 1 });
  assert.equal((await callback({ email, supabaseAccessToken: fresh })).supabaseAccessToken, fresh, "Tokens outside the refresh window remain unchanged");
  const renewed = await callback({ email, supabaseAccessToken: ownToken() });
  assert.equal((await callback({ ...renewed })).supabaseAccessToken, renewed.supabaseAccessToken, "Session reads do not continuously sign new tokens");

  const noExpiry = jwt.sign({ email, role: "authenticated" }, secret);
  const invalidTokens = [
    "not-a-jwt",
    jwt.sign({ email, role: "authenticated", exp: now + 60 }, "another-signing-key"),
    ownToken({}, { algorithm: "HS384" }),
    ownToken({ role: "service_role" }),
    ownToken({ email: "someone@example.test" }),
    noExpiry,
  ];
  for (const previous of invalidTokens) {
    assert.equal((await callback({ email, supabaseAccessToken: previous })).supabaseAccessToken, previous, "Unverified or foreign tokens must not be renewed from decoded claims");
  }
  for (const token of [{}, { email: "someone@example.test" }, { email: null }]) {
    const previous = ownToken();
    assert.equal((await callback({ ...token, supabaseAccessToken: previous })).supabaseAccessToken, previous, "Unknown or non-admin NextAuth identities cannot renew tokens");
  }
  for (const user of [{}, { email: null }, { email: "someone@example.test" }]) {
    const previous = ownToken();
    assert.equal((await callback({ email, supabaseAccessToken: previous }, user)).supabaseAccessToken, previous, "A supplied unknown or different user cannot fall back to the previous admin identity");
  }
  assert.equal((await callback({ email })).supabaseAccessToken, undefined, "A missing Supabase token requires fresh sign-in instead of creating from partial state");

  const session = { user: { email, name: "admin" } };
  const result = await callbacks.session({ session, token: renewed });
  assert.equal(result.user, session.user, "Existing session user stays intact");
  assert.equal(result.supabaseAccessToken, renewed.supabaseAccessToken);
  console.log("NextAuth Supabase token verification and expiry refresh checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
