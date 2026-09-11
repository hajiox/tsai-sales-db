import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCarrierJob,loadCarrierAdapter,carrierMonitorPayload} from '../tools/tsa-codex-bridge/carrier-local-job.mjs';
test('local request only accepts fixed task and compact identity',()=>{
 assert.deepEqual(validateCarrierJob({id:'run-123',period:'2026-08',task_key:'carrier_monthly_import',path:'evil',prompt:'evil'}),{id:'run-123',period:'2026-08',task_key:'carrier_monthly_import',parameters:{target:'2026-08'}});
 for(const change of [{id:'../x'},{period:'2026-13'},{task_key:'arbitrary'}]) assert.throws(()=>validateCarrierJob({id:'run-123',period:'2026-08',task_key:'carrier_monthly_import',...change}));
});
test('headless workers never load local executable; configured absolute module only',async()=>{
 assert.equal(await loadCarrierAdapter('untrusted-relative','headless-prelogin'),null);
 await assert.rejects(loadCarrierAdapter('untrusted-relative','interactive'));
 const dir=mkdtempSync(join(tmpdir(),'carrier-adapter-'));
 try {mkdirSync(join(dir,'scripts'));writeFileSync(join(dir,'scripts','carrier-bridge-job.mjs'),'export function peekCarrierJob(){return null};export function runCarrierJob(){}');const a=await loadCarrierAdapter(dir,'interactive');assert.equal(a.peekCarrierJob(),null);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('monitor strips all raw and unexpected source data',()=>{
 const p=carrierMonitorPayload({status:'needs_operator',progress:900,currentStep:'private',summary:'private',reason:'private',csv:'private'});
 assert.equal(p.status,'waiting_for_user');assert.equal(p.progress,100);assert.ok(!JSON.stringify(p).includes('private'));
});
test('integration is same worker, fixed Astra medium, no cloud local IDs or separate process',()=>{
 const s=readFileSync(new URL('../tools/tsa-codex-bridge/bridge.mjs',import.meta.url),'utf8');
 assert.ok(s.indexOf('await adapter.runCarrierJob')<s.indexOf('const claimed = await api'));
 assert.match(s,/currentJobId: currentJobIsLocal \? null : currentJobId/);
 assert.match(s,/lastDesktopTerminalState\?\.taskKey === CARRIER_TASK_KEY \? null/);
 assert.match(s,/if \(currentJobIsLocal\) return \{ok:true\}/);
 assert.match(s,/spawnSkillCodex\(CARRIER_TASK_KEY, carrierPrompt, args/);
 assert.match(s,/schema: schemaPath, model: "gpt-6-astra", reasoningEffort: "medium"/);
});
import { EventEmitter } from 'node:events';
import { waitForCarrierChildClose } from '../tools/tsa-codex-bridge/carrier-local-job.mjs';
test('watchdog stop retains worker serialization until actual child close',async()=>{
 const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null});let waiting=0;let nextJob=false;
 const held=waitForCarrierChildClose(child,()=>waiting++).then(()=>{nextJob=true});
 await Promise.resolve();assert.equal(waiting,1);assert.equal(nextJob,false);
 child.exitCode=1;child.emit('close',1);await held;assert.equal(nextJob,true);
});
test('shared CLI builder forces Astra medium even without per-job model',()=>{
 const s=readFileSync(new URL('../tools/tsa-codex-bridge/bridge.mjs',import.meta.url),'utf8');
 const builder=s.slice(s.indexOf('function buildIsolatedCodexArgs('),s.indexOf('function emptyCodexUsage('));
 assert.match(builder,/args.push\("--model", "gpt-6-astra"\)/);
 assert.match(builder,/const reasoningEffort = "medium"/);
 assert.doesNotMatch(builder,/if \(options.model\)/);
});
import vm from 'node:vm';
test('CLI arguments preserve isolated focused execution while overriding stale model options',()=>{
 const s=readFileSync(new URL('../tools/tsa-codex-bridge/bridge.mjs',import.meta.url),'utf8');
 const builder=s.slice(s.indexOf('function buildIsolatedCodexArgs('),s.indexOf('function emptyCodexUsage('));
 const build=vm.runInNewContext(builder+';buildIsolatedCodexArgs',{config:{workspace:'C:/fixture',codexHome:'C:/fixture',reasoningEffort:'low'},RESULT_SCHEMA:'fixture.schema.json',uniquePaths:items=>items.filter(Boolean),appendUnifiedCuaMcpArgs:args=>args.push('-c','mcp_fixture=true')});
 for(const options of [{},{model:'gpt-5.6-sol',reasoningEffort:'ultra',focusedContext:true,ephemeral:true},{focusedContext:true,userAuthorizedBrowser:true,ephemeral:true}]){
  const args=build('result.json',[],options);assert.equal(args[args.indexOf('--model')+1],'gpt-6-astra');assert.ok(args.includes('model_reasoning_effort="medium"'));
  if(options.focusedContext){assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ephemeral'));assert.ok(args.includes('mcp_fixture=true'));}
  if(options.userAuthorizedBrowser){assert.ok(!args.includes('--approve-for-me'));assert.ok(!args.includes('--ask-for-approval'));assert.ok(args.includes('approval_policy="never"'));assert.equal(args[args.indexOf('--sandbox')+1],'workspace-write');}
 }
});
test('carrier invocation enables human relay and exposes only bounded confirmation state',()=>{
 const s=readFileSync(new URL('../tools/tsa-codex-bridge/bridge.mjs',import.meta.url),'utf8');
 const fn=s.slice(s.indexOf('async function runCarrierCodex('),s.indexOf('async function executeJob('));
 assert.match(fn,/snsConfirmation: \{statePath:confirmationStatePath/);
 assert.match(fn,/onBrowserConfirmation\?\.\(status, details\)/);
 assert.match(fn,/\["waiting", "accepted", "cancelled", "unavailable"\]/);
 const pending=carrierMonitorPayload({status:'running',browserConfirmation:'waiting',browserConfirmationDetails:{presentation:'shown'},summary:'private'});
 assert.match(pending.currentStep,/確認画面/);assert.match(pending.operatorWaitReason,/回答待ち/);assert.equal(pending.status,'running');
 assert.equal(carrierMonitorPayload({status:'running',browserConfirmation:'accepted'}).operatorWaitReason,null);
 for (const details of [undefined,{presentation:'requested'},{presentation:'unknown',reason:'private'}]) {
  const unshown=carrierMonitorPayload({status:'running',browserConfirmation:'waiting',browserConfirmationDetails:details});
  assert.match(unshown.currentStep,/未確認/);assert.equal(unshown.operatorWaitReason,null);assert.doesNotMatch(JSON.stringify(unshown),/private|回答してください/);
 }
});
