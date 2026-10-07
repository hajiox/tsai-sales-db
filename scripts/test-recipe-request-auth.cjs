const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const baseUrl = "https://tsa.example.test";
const admin = { user: { email: "aizubrandhall@gmail.com" } };
let session = null;
let databaseCalls = 0;
let inputReads = 0;

function load(relativePath, additionalModules = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const requireStub = (name) => {
    if (Object.hasOwn(additionalModules, name)) return additionalModules[name];
    if (name === "next/server") return { NextResponse: { json: Response.json } };
    if (name === "next-auth") return { getServerSession: async () => session };
    if (name === "@/app/api/auth/[...nextauth]/route") return { authOptions: {} };
    if (name === "@supabase/supabase-js") return {
      createClient: () => new Proxy({}, {
        get: () => () => {
          databaseCalls += 1;
          throw new Error("A rejected request must never access the database");
        },
      }),
    };
    if (name === "@vercel/blob") return {
      put: () => { throw new Error("A rejected request must never upload"); },
      del: () => { throw new Error("A rejected request must never delete"); },
    };
    if (name === "xlsx" || name.startsWith("@/lib/")) return {};
    throw new Error(`Unexpected test dependency: ${name}`);
  };
  // No real application keys or services are loaded by this test.
  new Function("require", "module", "exports", "process", code)(
    requireStub, loaded, loaded.exports, { env: {} },
  );
  return loaded.exports;
}

const auth = load("lib/recipe-request-auth.ts");
function request(method, headers = {}, body = {}) {
  const value = new Request(`${baseUrl}/api/recipe/test`, {
    method,
    headers,
    ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) }),
  });
  const originalJson = value.json.bind(value);
  const originalFormData = value.formData.bind(value);
  value.json = () => { inputReads += 1; return originalJson(); };
  value.formData = () => { inputReads += 1; return originalFormData(); };
  return value;
}

async function main() {
  const requireAdmin = auth.requireRecipeAdminRequest;
  session = null;
  assert.equal((await requireAdmin(request("GET"))).status, 401, "Anonymous reads require login");
  assert.equal((await requireAdmin(request("POST", { origin: baseUrl }))).status, 401);
  assert.equal((await requireAdmin(request("POST", { authorization: "Bearer unrelated-token", origin: baseUrl }))).status, 401, "Machine tokens cannot grant browser administration");
  session = { user: { email: "someone@example.test" } };
  assert.equal((await requireAdmin(request("GET"))).status, 403, "A different account cannot administer recipes");
  session = admin;
  assert.equal(await requireAdmin(request("GET")), null, "Authenticated history and image reads work without Origin");
  assert.equal(await requireAdmin(request("POST", { origin: baseUrl })), null);
  assert.equal(await requireAdmin(request("POST", { referer: `${baseUrl}/recipe/123` })), null, "Same-origin Referer preserves clients that omit Origin");
  for (const headers of [
    {},
    { origin: "https://other.example.test" },
    { origin: "null", referer: `${baseUrl}/recipe/123` },
    { origin: "https://tsa.example.test.evil.test" },
    { referer: "https://other.example.test/" },
    { referer: "not a valid URL" },
    { origin: baseUrl, "sec-fetch-site": "cross-site" },
  ]) {
    assert.equal((await requireAdmin(request("PATCH", headers))).status, 403, `Rejected origin: ${JSON.stringify(headers)}`);
  }
  session = { user: { email: "AIZUBRANDHALL@GMAIL.COM" } };
  assert.equal(await requireAdmin(request("DELETE", { origin: baseUrl })), null, "Existing allowed account comparison remains case insensitive");

  const routes = [
    "db-write", "save", "versions", "update", "import", "upload-image", "", "[id]", "integration",
    "categories", "database-usages", "dining", "dining/items", "duplicates", "estimates", "estimates/impact",
    "intermediate-usage", "jan-codes", "print-logs", "sync-oem", "sync-product", "sync-wholesale", "web-images", "dev-docs",
  ];
  let checkedHandlers = 0;
  for (const routeName of routes) {
    const handlers = load(`app/api/recipe/${routeName}/route.ts`, { "@/lib/recipe-request-auth": auth });
    for (const [method, handler] of Object.entries(handlers)) {
      if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(method)) continue;
      checkedHandlers += 1;
      session = null;
      inputReads = 0;
      databaseCalls = 0;
      const context = { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }) };
      const anonymous = await handler(request(method, { origin: baseUrl }), context);
      assert.equal(anonymous.status, 401, `${routeName} ${method} rejects anonymous requests`);
      assert.equal(inputReads, 0, "Authentication runs before body parsing");
      assert.equal(databaseCalls, 0, "Authentication runs before database access");
      session = { user: { email: "someone@example.test" } };
      assert.equal((await handler(request(method, { origin: baseUrl }), context)).status, 403);
      session = admin;
      if (method !== "GET") {
        inputReads = 0;
        assert.equal((await handler(request(method, { origin: "https://other.example.test" }), context)).status, 403);
        assert.equal(inputReads, 0, "Cross-origin writes are rejected before reading input");
        assert.equal(databaseCalls, 0);
      }
    }
  }
  assert.equal(checkedHandlers, 56, "Every exported handler in the 24 protected routes was exercised");

  // Exercise the existing UI path beyond the guard without writing any data.
  session = admin;
  for (const [routeName, method] of [["db-write", "POST"], ["save", "POST"], ["update", "PATCH"], ["versions", "GET"], ["upload-image", "GET"]]) {
    const handlers = load(`app/api/recipe/${routeName}/route.ts`, { "@/lib/recipe-request-auth": auth });
    assert.equal((await handlers[method](request(method, { origin: baseUrl }))).status, 400, `${routeName} reaches its existing validation for an authorized request`);
  }
  assert.equal(databaseCalls, 0);

  // Auto cleanup reuses the authorized internal GET instead of an anonymous HTTP request.
  const emptyQuery = new Proxy({}, {
    get: (_target, name) => name === "then"
      ? (resolve) => Promise.resolve({ data: [], error: null }).then(resolve)
      : () => emptyQuery,
  });
  let cleanupReads = 0;
  const duplicates = load("app/api/recipe/duplicates/route.ts", {
    "@/lib/recipe-request-auth": auth,
    "@supabase/supabase-js": { createClient: () => ({ from: () => { cleanupReads += 1; return emptyQuery; } }) },
  });
  const cleanup = await duplicates.POST(request("POST", { origin: baseUrl }, { action: "auto_cleanup" }));
  assert.equal(cleanup.status, 200);
  assert.deepEqual(await cleanup.json(), { success: true, deleted: 0 });
  assert.equal(cleanupReads, 2, "Cleanup executes the authorized recipe and item reads without another HTTP request");
  console.log(`Recipe administration authentication checks passed (${checkedHandlers} handlers).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
