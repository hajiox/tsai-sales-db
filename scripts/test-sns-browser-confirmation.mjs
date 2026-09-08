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
// Cancellation, denial, timeout and unfamiliar forms must never manufacture approval.
assert.deepEqual(await requestBrowserConfirmation({mode:'form',requestedSchema:schema},async()=>({action:'accept',content:{decision:'deny'}})),{action:'accept',content:{decision:'deny'}});
assert.equal((await requestBrowserConfirmation({mode:'form',requestedSchema:schema},async()=>({action:'cancel',content:null}))).action,'cancel');
for(const malformed of [{type:'object',properties:[],required:[]},{type:'object',properties:{decision:{type:'boolean'}},required:'decision'},{type:'object',properties:{decision:{type:'boolean'}},required:['absent']},{type:'object',properties:{decision:{type:'boolean',const:true}}},{type:'object',properties:{},oneOf:[]}]){
 assert.equal((await requestBrowserConfirmation({requestedSchema:malformed},()=>{throw Error('must not display')})).action,'cancel');
}
const abortedController=new AbortController();
const abortWait=requestBrowserConfirmation({requestedSchema:schema},()=>new Promise(()=>{}),abortedController.signal);
abortedController.abort();assert.equal((await abortWait).action,'cancel');
assert.equal((await requestBrowserConfirmation({requestedSchema:schema},()=>new Promise(()=>{}),undefined,10)).action,'cancel');

const cancelInput=new PassThrough();const cancelOutput=new PassThrough();let cancelWire='';cancelOutput.on('data',d=>{cancelWire+=d});
let signalShown;const cancelShown=new Promise(resolve=>{signalShown=resolve});
const cancelPeer=`const rl=require('readline').createInterface({input:process.stdin});rl.on('line',s=>{const x=JSON.parse(s);if(x.method==='tools/call'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:999,method:'elicitation/create',params:{mode:'form',requestedSchema:${JSON.stringify(schema)}}})+'\\n')}else if(x.id===999){process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancel-result',params:x.result})+'\\n')}})`;
const cancelServer=startConfirmationRelay({command:process.execPath,args:['-e',cancelPeer],env:process.env,input:cancelInput,output:cancelOutput,showDialog:async()=>{signalShown();return new Promise(()=>{})}});
cancelInput.write(JSON.stringify({jsonrpc:'2.0',id:77,method:'tools/call',params:{}})+'\n');await cancelShown;
cancelInput.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:77}})+'\n');
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('parent tool cancellation was not relayed')),2000);const check=()=>{if(cancelWire.includes('notifications/cancel-result')){clearTimeout(timer);cancelOutput.off('data',check);resolve()}};cancelOutput.on('data',check);check()});
assert(cancelWire.includes('"action":"cancel"'));assert(!cancelWire.includes('"allow_once"'));
cancelInput.end();await new Promise(resolve=>cancelServer.once('close',resolve));
console.log('Browser confirmation: denial preserved, cancellation, timeout, unknown schemas and parent tools/call cancellation passed');
// A normal browser call flows through automatically without inventing a form.
const autoInput=new PassThrough();const autoOutput=new PassThrough();let autoWire='';let autoForms=0;const autoStates=[];
autoOutput.on('data',d=>{autoWire+=d});
const autoPeer=`require('readline').createInterface({input:process.stdin}).on('line',s=>{const x=JSON.parse(s);if(x.method==='tools/call')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:x.id,result:{content:[{type:'text',text:'normal-operation-completed'}]}})+'\\n')})`;
const autoServer=startConfirmationRelay({command:process.execPath,args:['-e',autoPeer],env:process.env,input:autoInput,output:autoOutput,state:s=>autoStates.push(s),showDialog:async()=>{autoForms++;throw Error('normal operation must not ask')}});
autoInput.write(JSON.stringify({jsonrpc:'2.0',id:88,method:'tools/call',params:{name:'js'}})+'\n');
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('ordinary operation failed')),2000);const check=()=>{if(autoWire.includes('normal-operation-completed')){clearTimeout(timer);autoOutput.off('data',check);resolve()}};autoOutput.on('data',check);check()});
assert.equal(autoForms,0);assert.equal(autoStates.includes('waiting'),false);
autoInput.end();await new Promise(resolve=>autoServer.once('close',resolve));
console.log('Normal browser operation passes through automatically with zero forms and zero waiting states');
