const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const bridge = fs.readFileSync('tools/tsa-codex-bridge/bridge.mjs', 'utf8');
const id = '7f182aec-a243-4501-b7db-ccb8f515d4d8';
const previous = { jobId: id, taskLabel: 'SNS投稿', status: 'waiting_for_user', summary: '古い確認待ち', finishedAt: '2026-09-07T05:40:00Z' };
const context = vm.createContext({ currentJobId: null, lastDesktopTerminalState: { ...previous }, desktopMonitorState: { ...previous }, FINAL_DESKTOP_MONITOR_STATUSES: new Set(['completed','failed','cancelled','waiting_for_user','needs_review']), sanitizeMonitorText: s => String(s).slice(0,300), monitorBaseState() { return { status: 'idle', lastTerminal: context.lastDesktopTerminalState }; } });
vm.runInContext(bridge.slice(bridge.indexOf('function reconcileDesktopTerminal('), bridge.indexOf('function publishDesktopMonitorIdle(')), context);
const remote = { jobId: id, status: 'completed', summary: '4媒体への投稿を確認しました', finishedAt: '2026-09-07T06:10:00Z' };
context.reconcileDesktopTerminal(remote);
assert.equal(context.lastDesktopTerminalState.status, 'completed');
assert.equal(context.desktopMonitorState.status, 'idle');
assert.equal(context.desktopMonitorState.lastTerminal.summary, remote.summary);
assert.equal(context.lastDesktopTerminalState.taskLabel, 'SNS投稿');
for (const invalid of [null, { ...remote, jobId: 'other' }, { ...remote, status: 'running' }, { ...remote, finishedAt: 'invalid' }, { ...remote, status: 'waiting_for_user', finishedAt: '2026-09-07T05:00:00Z' }]) {
  const before = JSON.stringify(context.lastDesktopTerminalState);
  context.reconcileDesktopTerminal(invalid);
  assert.equal(JSON.stringify(context.lastDesktopTerminalState), before);
}
context.currentJobId = 'active-job';
context.reconcileDesktopTerminal({ ...remote, status: 'failed' });
assert.equal(context.lastDesktopTerminalState.status, 'completed', 'An active job must not be overwritten by a delayed heartbeat');

let authorized = true;
let selects = 0;
const filters = [];
const db = { from(table) {
  if (table === 'web_sales_codex_workers') return { upsert: async () => ({ error: null }) };
  assert.equal(table, 'web_sales_codex_jobs');
  const q = {
    select(columns) { selects++; assert.equal(columns, 'id,status,current_step,completed_at,updated_at'); return q; },
    eq(k,v) { filters.push([k,v]); return q; },
    in(k,v) { assert.equal(k,'status'); assert(!v.includes('running')); return q; },
    async maybeSingle() { return { data: { id, status: 'completed', current_step: remote.summary, completed_at: remote.finishedAt } }; },
  }; return q;
} };
const source = ts.transpileModule(fs.readFileSync('app/api/web-sales/codex-bridge/heartbeat/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleContext = vm.createContext({ exports: {}, require(name) {
  if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } };
  if (name.endsWith('/sync')) return { getWebSalesAutomationServiceClient: () => db };
  if (name.endsWith('/server')) return { isCodexBridgeAuthorized: () => authorized, normalizeWorkerId: s => s };
  if (name.endsWith('/bridge-version')) return { isRetiredLegacyTsaCodexBridge: () => false, REQUIRED_TSA_CODEX_BRIDGE_VERSION: 'test' };
  throw Error(name);
} });
vm.runInContext(source, moduleContext);
(async () => {
  const post = body => moduleContext.exports.POST({ json: async () => ({ workerId: 'office', version: 'test', ...body }) });
  const result = await post({ lastTerminalJobId: id });
  assert.equal(result.data.lastTerminal.status, 'completed');
  assert(filters.some(([k,v]) => k === 'worker_id' && v === 'office'));
  assert(filters.some(([k,v]) => k === 'id' && v === id));
  await post({ lastTerminalJobId: 'invalid' });
  await post({});
  assert.equal(selects, 1, 'Old clients and malformed IDs must not trigger a job lookup');
  authorized = false;
  assert.equal((await post({ lastTerminalJobId: id })).status, 401);
  assert.equal(selects, 1);
  console.log('Monitor result sync: waiting→completed, idle persistence, active-job race, worker scoping, authorization and legacy clients passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
