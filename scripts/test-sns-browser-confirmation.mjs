import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { confirmationFields, validateConfirmationResponse, requestBrowserConfirmation, startConfirmationRelay } from "../tools/tsa-codex-bridge/sns-browser-confirmation.mjs";

const schema = { type: "object", properties: { decision: { type: "string", enum: ["allow_once", "deny"] } }, required: ["decision"] };
const fields = confirmationFields(schema);
assert.deepEqual(validateConfirmationResponse({ action: "accept", content: { decision: "allow_once" } }, fields), { action: "accept", content: { decision: "allow_once" } });
for (const response of [null, {}, { action: "accept", content: {} }, { action: "accept", content: { decision: "allow_always" } }, { action: "decline" }]) {
  assert.equal(validateConfirmationResponse(response, fields).action, "cancel");
}
let displayed = 0;
const show = async () => { displayed++; return { action: "accept", content: { decision: "allow_once" } }; };
assert.equal((await requestBrowserConfirmation({ mode: "form", message: "Upload this image?", requestedSchema: schema }, show)).action, "accept");
assert.equal(displayed, 1);
for (const params of [{ mode: "url" }, { requestedSchema: { type: "object", properties: { secret: { type: "string" } } } }, { requestedSchema: { type: "object", properties: { nested: { type: "object" } } } }]) {
  assert.equal((await requestBrowserConfirmation(params, show)).action, "cancel");
}
assert.equal(displayed, 1, "Unsupported forms must not get fabricated responses");

// Exercise the actual stdio transport with a synthetic MCP peer; no social network writes.
const input = new PassThrough();
const output = new PassThrough();
let wire = ""; output.on("data", d => { wire += d; });
let answer;
let formShown;
const shown = new Promise(resolve => { formShown = resolve; });
const peer = `const rl=require('readline').createInterface({input:process.stdin});let n=0;rl.on('line',s=>{const x=JSON.parse(s);if(x.method==='initialize'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:x.id,result:x.params.capabilities})+'\\n');process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:999,method:'elicitation/create',params:{mode:'form',message:'確認',requestedSchema:${JSON.stringify(schema)}}})+'\\n')}else if(x.id===999){process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/test',params:x.result})+'\\n')}});`;
const states = [];
const server = startConfirmationRelay({ command: process.execPath, args: ["-e", peer], env: process.env, input, output, state: s => states.push(s), showDialog: async () => { formShown(); return new Promise(resolve => { answer = resolve; }); } });
input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } }) + "\n");
await shown;
assert(!wire.includes("notifications/test"), "A pending form cannot auto-accept");
answer({ action: "accept", content: { decision: "allow_once" } });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("MCP response was not relayed")), 3000);
  const check = () => { if (wire.includes("notifications/test")) { clearTimeout(timer); output.off("data", check); resolve(); } };
  output.on("data", check); check();
});
assert(wire.includes('"elicitation":{"form":{}}'));
assert(wire.includes('"decision":"allow_once"'));
assert.deepEqual(states.slice(0, 2), ["waiting", "accepted"]);
input.end();
await new Promise(resolve => server.once("close", resolve));
console.log("SNS browser confirmation: schema validation, fail-closed forms, pending approval, and stdio continuation passed");
