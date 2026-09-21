import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {BROWSER_ROUTE_POLICY,startBrowserConnectionSupervisor} from '../tools/tsa-codex-bridge/chrome-devtools-connection.mjs';
const bridge=fs.readFileSync(new URL('../tools/tsa-codex-bridge/bridge.mjs',import.meta.url),'utf8');
const builder=bridge.slice(bridge.indexOf('function buildIsolatedCodexArgs('),bridge.indexOf('function emptyCodexUsage('));
for(const missing of ['none','chrome','debug','both']){
 const seen=[];const build=vm.runInNewContext(builder+';buildIsolatedCodexArgs',{config:{workspace:'C:/job',codexHome:'C:/home'},RESULT_SCHEMA:'schema',BROWSER_ROUTE_POLICY,uniquePaths:x=>x,appendUnifiedCuaMcpArgs:args=>{seen.push('chrome');if(['chrome','both'].includes(missing))throw Error('missing');args.push('-c','chrome=true');},appendChromeDevtoolsMcpArgs:args=>{seen.push('debug');if(['debug','both'].includes(missing))throw Error('missing');args.push('-c','debug=true');}});
 const args=build('result',[],{focusedContext:true,ephemeral:true});assert.deepEqual(seen,['chrome','debug']);assert.ok(args.some(a=>a.includes('developer_instructions=')));assert.ok(args.includes('gpt-6-astra'));assert.ok(args.includes('model_reasoning_effort="medium"'));if(missing==='chrome')assert.ok(args.includes('debug=true'));
 seen.length=0;build('result',[],{minimalContext:true,sandbox:'read-only'});assert.equal(seen.length,0);
}
assert.match(bridge,/CUA_REPL_ENABLED_SURFACES: "browser,computer"/);
assert.match(bridge,/sky: "@oai\/sky\/service"/);
assert.match(BROWSER_ROUTE_POLICY,/first-route failure is NOT a terminal/);
assert.match(BROWSER_ROUTE_POLICY,/possibly successful submission/);
assert.match(BROWSER_ROUTE_POLICY,/genuine operator wait/);
for(const fail of [false,true]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-route-'));let calls=0;
 const stop=startBrowserConnectionSupervisor({workspace:dir,intervalMs:5,prepare:async()=>{calls++;if(fail)throw Error('unavailable');return{ready:true};}});
 await sleep(25);assert.equal(calls,0,'no eager debugger connection');
 const id=randomUUID();fs.writeFileSync(path.join(dir,'.bridge-chrome-request.json'),JSON.stringify({id,kind:'devtools_fallback'}));
 for(let i=0;i<50&&!fs.existsSync(path.join(dir,'.bridge-chrome-response.json'));i++)await sleep(10);
 const response=JSON.parse(fs.readFileSync(path.join(dir,'.bridge-chrome-response.json'),'utf8'));assert.equal(response.id,id);assert.equal(response.ready,!fail);assert.equal(calls,1);
 fs.writeFileSync(path.join(dir,'.bridge-chrome-request.json'),JSON.stringify({id:randomUUID(),kind:'devtools_fallback'}));await sleep(25);assert.equal(calls,1,'no permission/reconnect loop');stop();assert.equal(fs.existsSync(path.join(dir,'.bridge-chrome-response.json')),false);
}
console.log('PASS: independent route availability, no eager debugger, one bounded transition, permission/duplicate safety, AI-only isolation');
