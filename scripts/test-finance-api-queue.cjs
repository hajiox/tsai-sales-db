const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseOptions, drainQueue } = require("./run-finance-api-queue.cjs");
const { createFinanceApiMonitor } = require("./finance-api-monitor.cjs");
assert.deepEqual(parseOptions(["--once", "--max-runs=3"]), { poll: false, maxRuns: 3, intervalMs: 30000, help: false });
assert.equal(parseOptions(["--poll"]).poll, true);
assert.throws(() => parseOptions(["--max-runs=0"]), /limits/);
assert.throws(() => parseOptions(["--interval-ms=1"]), /limits/);
assert.throws(() => parseOptions(["--bogus"]), /Unknown/);
async function main() {
  const queue = ["run-1", "run-2", "run-3"], calls = [], emitted = [];
  const client = { from(table) {
    assert.equal(table, "web_sales_acquisition_runs");
    const query = { select() { return query; }, eq(key, value) { calls.push([key, value]); return query; }, order(key) { assert.equal(key, "started_at"); return query; }, limit() { return query; },
      async maybeSingle() { return { data: queue.length ? { id: queue[0] } : null, error: null }; } };
    return query;
  } };
  let active = 0;
  const executed = [];
  const execute = async (id) => {
    active++; assert.equal(active, 1, "acquisitions are serial");
    executed.push(id); queue.shift(); active--;
    return { status: id === "run-2" ? "needs_review" : "success", secret: "must-not-be-logged" };
  };
  assert.equal(await drainQueue(client, execute, 2, (entry) => emitted.push(entry)), 2);
  assert.deepEqual(executed, ["run-1", "run-2"]);
  assert.deepEqual(queue, ["run-3"], "one pass stays within its limit");
  assert.ok(calls.some(([key, value]) => key === "route" && value === "api"));
  assert.ok(calls.some(([key, value]) => key === "status" && value === "queued"));
  assert.ok(!JSON.stringify(emitted).includes("must-not-be-logged"));
  assert.equal(await drainQueue(client, execute, 2), 1);
  queue.push("run-4");
  await assert.rejects(drainQueue(client, execute, 1, () => {}, { onTransition: async () => { throw new Error("presence missing"); } }), /presence missing/);
  assert.equal(queue[0], "run-4", "presence failure stops before acquiring money data");
  assert.equal(await drainQueue(client, execute, 1, () => {}, { shouldStop: () => true }), 0);
  const monitorDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tsa-finance-api-monitor-test-"));
  const monitorPath = path.join(monitorDirectory, "tsa-finance-api.json");
  try {
    const monitor = createFinanceApiMonitor({ path: monitorPath });
    assert.equal(monitor.transition("running", "run-4", { channel: "楽天", kind: "精算" }), true);
    const bytes = fs.readFileSync(monitorPath);
    const monitorState = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    assert.equal(monitorState.workerName, "TSA公式API取得");
    assert.equal(monitorState.codexPid, null);
    assert.equal(monitorState.codexSessionCount, 0);
    assert.equal(monitorState.jobId, "run-4");
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "../tools/tsa-codex-bridge/bridge-monitor-state.schema.json"), "utf8"));
    for (const key of schema.required) assert.ok(Object.hasOwn(monitorState, key), `monitor schema requires ${key}`);
    for (const [key, value] of Object.entries(monitorState)) {
      assert.ok(Object.hasOwn(schema.properties, key));
      if (schema.properties[key].enum) assert.ok(schema.properties[key].enum.includes(value));
    }
    fs.unlinkSync(monitorPath); // Closing/restarting the observer does not stop the worker.
    assert.equal(monitor.publish(), true);
    assert.equal(JSON.parse(fs.readFileSync(monitorPath, "utf8")).jobId, "run-4");
    monitor.terminal("run-4", "needs_review");
    monitor.transition("stopped", null);
    const stopped = JSON.parse(fs.readFileSync(monitorPath, "utf8"));
    assert.equal(stopped.status, "offline");
    assert.equal(stopped.lastTerminal.status, "needs_review");
  } finally {
    if (fs.existsSync(monitorPath)) fs.unlinkSync(monitorPath);
    fs.rmdirSync(monitorDirectory);
  }
  console.log("Finance API queue limits, serial dispatch, and sanitized output checks passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
