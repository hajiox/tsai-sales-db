import assert from "node:assert/strict";
import { compactCodexEventLine } from "../tools/tsa-codex-bridge/codex-event-log.mjs";

const short = JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", status: "completed" } });
assert.equal(compactCodexEventLine(short), short);

const oversized = JSON.stringify({
  type: "item.completed",
  item: {
    id: "42",
    type: "mcp_tool_call",
    server: "cua_repl",
    tool: "js",
    status: "failed",
    result: `private page text ${"x".repeat(5_000)} permission request was dismissed before a decision was made ${"y".repeat(5_000)}`,
  },
});
const compact = compactCodexEventLine(oversized);
assert.ok(compact.length <= 4_000);
const parsed = JSON.parse(compact);
assert.equal(parsed.type, "item.completed");
assert.equal(parsed.item.type, "mcp_tool_call");
assert.equal(parsed.truncated, true);
assert.match(JSON.stringify(parsed), /permission request was dismissed/);

const malformed = JSON.parse(compactCodexEventLine(`not-json ${"z".repeat(8_000)}`));
assert.equal(malformed.type, "codex.unparsed");

console.log("Codex event logs remain valid JSON when oversized diagnostics are compacted.");
