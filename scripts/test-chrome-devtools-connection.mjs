import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareChromeConnection, CHROME_CONNECTION_WAIT } from "../tools/tsa-codex-bridge/chrome-devtools-connection.mjs";

function fixture(running = false, probe = { success: true, result: JSON.stringify({ content: [{ type: "text", text: "private page title" }] }) }) {
  const calls = [];
  return { calls, utils: { isDaemonRunning: () => running }, client: {
    async startDaemon(args) { calls.push({ method: "start", args }); running = true; },
    async sendCommand(command) {
      calls.push(command);
      if (command.method === "status") return { success: true, result: JSON.stringify({ pid: 123, startDate: "now", version: "1.9.0" }) };
      return probe;
    },
  } };
}
const stopped = fixture();
const ready = await prepareChromeConnection({ ...stopped, workspace: process.cwd() });
assert.equal(ready.ready, true);
assert.equal(ready.started, true);
assert.deepEqual(stopped.calls.map(c => c.method), ["start", "status", "invoke_tool"]);
assert.equal(stopped.calls[2].tool, "list_pages");
assert.doesNotMatch(JSON.stringify(ready), /private page/);
await prepareChromeConnection({ ...stopped, workspace: process.cwd() });
assert.equal(stopped.calls.filter(c => c.method === "start").length, 1, "Subsequent sessions must reuse the daemon");
for (const response of [{ success: false, error: "Request timed out" }, { success: true, result: JSON.stringify({ isError: true, content: [] }) }]) {
  const failed = fixture(true, response);
  await assert.rejects(prepareChromeConnection({ ...failed, workspace: process.cwd() }), { message: CHROME_CONNECTION_WAIT });
  assert.deepEqual(failed.calls.map(c => c.method), ["status", "invoke_tool"], "No restart/retry of a live connection or pending permission");
}
const bridge = readFileSync(new URL("../tools/tsa-codex-bridge/bridge.mjs", import.meta.url), "utf8");
const job = bridge.slice(bridge.indexOf("async function executeRecipeSnsPublishJob"), bridge.indexOf("async function executeAnalysisJob"));
assert.ok(job.indexOf("await prepareChromeConnection") < job.indexOf("await executeRecipeSnsPublishTarget"));
assert.match(job, /if \(connectionFailure\) \{[\s\S]*?continue;/);
const relay = readFileSync(new URL("../tools/tsa-codex-bridge/chrome-devtools-daemon-relay.mjs", import.meta.url), "utf8");
assert.doesNotMatch(relay, /startDaemon|stopDaemon/);
console.log("Chrome connection ownership, reuse, single preflight, private metadata and fail-closed contracts passed.");
