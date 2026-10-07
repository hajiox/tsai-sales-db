const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const url = "https://tsa.example.test/api/data-access/connections";
const recordId = "aaaa1111-bbbb-4ccc-8ddd-eeee22223333";
let session = null;
let reads = 0;
let operations = [];
let failure = false;
let savedConnection = null;

function query(table) {
  const state = { table, columns: null, action: "select", single: false };
  const chain = new Proxy({}, {
    get: (_target, method) => {
      if (method === "then") return (resolve) => {
        let rows = table === "data_access_connections" && savedConnection ? [savedConnection] : [];
        if (state.action === "update") rows = [{ id: recordId }];
        if (state.columns && state.columns !== "*") rows = rows.map((row) => Object.fromEntries(state.columns.split(",").filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])));
        return Promise.resolve({ data: state.single ? rows[0] : rows, error: failure ? { message: "sensitive database error" } : null }).then(resolve);
      };
      return (...args) => {
        operations.push({ table, method, args });
        if (method === "select") state.columns = args[0];
        if (method === "single") state.single = true;
        if (method === "insert") { state.action = "insert"; savedConnection = args[0]; }
        if (method === "update") state.action = "update";
        return chain;
      };
    },
  });
  return chain;
}

const db = {
  from(table) { operations.push({ method: "from", table }); return query(table); },
  async rpc(name, args) {
    operations.push({ method: "rpc", name, args });
    return { data: { id: args.p_id, status: args.p_decision === "approve" ? "approved" : "rejected" }, error: null };
  },
};
function load(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const requireStub = (name) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name === "node:crypto") return crypto;
    if (name === "next/server") return { NextResponse: { json: Response.json } };
    if (name === "next-auth") return { getServerSession: async () => session };
    if (name === "@/app/api/auth/[...nextauth]/route") return { authOptions: {} };
    if (name === "@supabase/supabase-js") return { createClient: () => db };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function("require", "module", "exports", "process", code)(requireStub, loaded, loaded.exports, { env: {} });
  return loaded.exports;
}
function post(body, headers = {}) {
  const request = new Request(url, { method: "POST", headers: { origin: new URL(url).origin, "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const text = request.text.bind(request);
  request.text = () => { reads += 1; return text(); };
  return request;
}

async function main() {
  const admin = load("lib/data-access-admin.ts");
  const route = load("app/api/data-access/connections/route.ts", { "@/lib/data-access-admin": admin });
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(post({ action: "create" }))).status, 401);
  assert.equal(reads, 0, "Anonymous callers cannot submit bodies");
  assert.equal(operations.length, 0, "Anonymous callers cannot access admin records");
  session = { user: { email: "someone@example.test" } };
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(post({ action: "revoke", id: recordId }))).status, 401);
  session = { user: { email: "AIZUBRANDHALL@GMAIL.COM" } };
  for (const origin of ["https://other.example.test", "null", "https://tsa.example.test.evil.test"]) {
    assert.equal((await route.POST(post({ action: "create" }, { origin }))).status, 403);
  }
  const originless = post({ action: "create" });
  originless.headers.delete("origin");
  assert.equal((await route.POST(originless)).status, 403);
  assert.equal(reads, 0, "Origin checks run before body reads");
  assert.equal(operations.length, 0);
  assert.equal((await route.POST(post({}, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await route.POST(post("not json"))).status, 400);
  assert.equal((await route.POST(post("x".repeat(32001)))).status, 413);
  for (const value of [
    { label: "", scopes: ["recipes:read"] },
    { label: "test", scopes: ["admin:write"] },
    { label: "test", scopes: ["sales:write"] },
    { label: "test", scopes: ["recipes:write"] },
    { label: "test", scopes: ["recipes:read", "ingredients:write"] },
    { label: "test", scopes: ["recipes:read"], resourceIds: { arbitrary_table: [recordId] } },
    { label: "test", scopes: ["recipes:read"], resourceIds: { recipes: ["not-uuid"] } },
    { label: "test", scopes: ["recipes:read"], expiresInDays: 0 },
    { label: "test", scopes: ["recipes:read"], expiresInDays: 91 },
  ]) {
    assert.equal((await route.POST(post({ action: "create", ...value }))).status, 400);
  }
  assert.equal(operations.length, 0, "Invalid management inputs cannot change the database");
  const valid = { label: "test", scopes: ["ingredients:read", "ingredients:write"] };
  for (const expiresInDays of [1, 90]) {
    const start = Date.now();
    const connection = admin.validateDataConnection({ ...valid, expiresInDays }).connection;
    const end = Date.now();
    assert.ok(Date.parse(connection.expires_at) >= start + expiresInDays * 86400000);
    assert.ok(Date.parse(connection.expires_at) <= end + expiresInDays * 86400000);
    assert.deepEqual(connection.scopes, valid.scopes, "Explicit paired read/write scopes are preserved");
  }
  const defaultStart = Date.now();
  const defaultExpiry = Date.parse(admin.validateDataConnection(valid).connection.expires_at);
  assert.ok(defaultExpiry >= defaultStart + 30 * 86400000);
  assert.ok(defaultExpiry <= Date.now() + 30 * 86400000);
  for (const expiresInDays of [-1, 0, 1.5, 91, Infinity, NaN, "30"]) {
    assert.throws(() => admin.validateDataConnection({ ...valid, expiresInDays }));
  }
  assert.throws(() => admin.validateDataConnection({ ...valid, resourceIds: { ingredients: Array(201).fill(recordId) } }));
  const normalized = admin.validateDataConnection({ ...valid, resourceIds: { ingredients: [recordId.toUpperCase(), recordId] } });
  assert.deepEqual(normalized.connection.resource_ids, { ingredients: [recordId] }, "ID case normalization precedes duplicate removal");
  const created = await route.POST(post({ action: "create", label: "  other Codex  ", scopes: ["recipes:read", "recipes:read"], resourceIds: { recipes: [recordId.toUpperCase()] }, created_by: "forged@example.test" }));
  assert.equal(created.status, 200);
  const payload = await created.json();
  assert.match(payload.data.token, /^tsa_data_[A-Za-z0-9_-]{43}$/);
  assert.equal(savedConnection.token_hash, crypto.createHash("sha256").update(payload.data.token).digest("hex"));
  assert.equal(savedConnection.created_by, session.user.email, "The authenticated actor replaces client-supplied identity");
  assert.equal(savedConnection.label, "other Codex");
  assert.deepEqual(savedConnection.scopes, ["recipes:read"]);
  assert.deepEqual(savedConnection.resource_ids, { recipes: [recordId] });
  assert.equal(savedConnection.max_limit, 50);
  assert.equal(payload.data.connection.token_hash, undefined, "Even the hash is excluded from API responses");
  assert.equal(created.headers.get("cache-control"), "no-store");
  assert.equal(created.headers.get("referrer-policy"), "no-referrer");
  const listed = await route.GET();
  const listing = await listed.json();
  assert.equal(listed.status, 200);
  assert.equal(JSON.stringify(listing).includes(payload.data.token), false, "Tokens are shown only at creation");
  assert.equal(JSON.stringify(listing).includes(savedConnection.token_hash), false);

  operations = [];
  assert.equal((await route.POST(post({ action: "revoke", id: recordId }))).status, 200);
  assert.ok(operations.some((entry) => entry.method === "eq" && entry.args[0] === "id" && entry.args[1] === recordId));
  assert.ok(operations.some((entry) => entry.method === "is" && entry.args[0] === "revoked_at" && entry.args[1] === null));
  operations = [];
  const reviewed = await route.POST(post({ action: "review", id: recordId, decision: "approve", actor: "forged@example.test", values: { name: "replacement" } }));
  assert.equal(reviewed.status, 200);
  assert.deepEqual(operations.find((entry) => entry.method === "rpc"), {
    method: "rpc", name: "tsa_data_access_review_plan", args: { p_id: recordId, p_decision: "approve", p_actor: session.user.email },
  }, "Review binds actor and immutable plan ID without accepting replacement values");
  operations = [];
  assert.equal((await route.POST(post({ action: "review", id: recordId, decision: "delete_all" }))).status, 400);
  assert.equal(operations.length, 0);
  failure = true;
  const failed = await route.GET();
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes("sensitive database error"), false);
  console.log("Data access administration authentication and management checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
