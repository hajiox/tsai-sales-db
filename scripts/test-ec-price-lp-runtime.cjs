const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../tools/tsa-codex-bridge/bridge.mjs'), 'utf8');
function section(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).replace(/async\s*$/, '');
}
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tsa-lp-runtime-'));
const config = {workspace: path.join(fixture, 'workspace'), codexHome: path.join(fixture, 'codex-home')};
fs.mkdirSync(config.workspace, {recursive:true});
const resolver = path.join(config.codexHome, 'skills/update-aizu-ec-prices/scripts/find-lp-source.ps1');
const publicReader = path.join(config.codexHome, 'skills/update-aizu-ec-prices/scripts/read-lp-public-page.cjs');
fs.mkdirSync(path.dirname(resolver), {recursive:true});
fs.writeFileSync(resolver, '# fixture only');
fs.writeFileSync(publicReader, 'module.exports={readLpPublicPage:async url=>({final_url:url.endsWith("/redirect")?"https://example.invalid/other":url})};');
const builder = new Function('config', 'RESULT_SCHEMA', 'uniquePaths', 'appendUnifiedCuaMcpArgs', 'appendChromeDevtoolsMcpArgs', 'BROWSER_ROUTE_POLICY',
  `${section('buildIsolatedCodexArgs', 'emptyCodexUsage')} return buildIsolatedCodexArgs;`)(config, 'schema.json', values=>[...new Set(values.filter(Boolean))], ()=>{}, ()=>{}, 'route policy');
const explicit = builder('output.json', ['job-artifacts', 'lp-workspace'], {
  cwd: 'lp-workspace', schema: 'schema.json', focusedContext:true, ephemeral:true,
  sandbox:'workspace-write', autoReview:true, sandboxNetworkAccess:true,
});
assert.equal(explicit[explicit.indexOf('--sandbox')+1], 'workspace-write');
assert.ok(!explicit.includes('--approve-for-me'), 'CLI rejects combining the shortcut with --sandbox');
assert.ok(explicit.includes('approval_policy="on-request"'));
assert.ok(explicit.includes('approvals_reviewer="auto_review"'));
assert.ok(explicit.includes('sandbox_workspace_write.network_access=true'));
assert.ok(explicit.includes('--ignore-user-config') && explicit.includes('--ignore-rules') && explicit.includes('--ephemeral'));
assert.equal(explicit[explicit.indexOf('--model')+1], 'gpt-6-luna');
const ec = builder('output.json', ['job-artifacts'], {});
assert.ok(ec.includes('--approve-for-me'));
assert.ok(!ec.includes('--sandbox') && !ec.some(v=>v.includes('network_access')));
const readOnly = builder('output.json', ['job-artifacts'], {sandbox:'read-only'});
assert.ok(!readOnly.includes('--approve-for-me') && !readOnly.some(v=>v.includes('auto_review')||v.includes('network_access')));
const summarize = new Function(`${section('summarizeSequentialEcPriceResult', 'ecPriceTargetLabel')} return summarizeSequentialEcPriceResult;`)();
assert.doesNotMatch(summarize({sites:[],lp:{status:'blocked'}},{targets:[],lpUpdate:true}), /EC反映済み0件/);
assert.match(summarize({sites:[{status:'updated'}],lp:{status:'updated'}},{targets:['rakuten'],lpUpdate:true}), /EC反映済み1件/);
const calls=[];
let planTabPolicyViolation=null;
let writeTabPolicyViolation=null;
let publicReadIssue=null;
const publicBlock={block_id:'LPB_0123456789abcdef',text:'Exact soup product, five servings, 1750円',prices:[1750]};
const publicEvidence={http_status:200,final_url:'https://example.invalid/',product_blocks:[publicBlock]};
const bindPublicPlan = new Function(`${section('bindEcPriceLpPublicPlan', 'verifyRegisteredEcPriceLp')} return bindEcPriceLpPublicPlan;`)();
const publicUpdate={occurrence_evidence:`${publicBlock.block_id}: exact soup product and five servings`,observed_price:1750,target_price:1944};
const blockedLpResult = new Function(`${section('blockedLpResult', 'validateEcProductNameGenerateJobParameters')} return blockedLpResult;`)();
const blockedEcPriceLpPlan = new Function(`${section('blockedEcPriceLpPlan', 'ecPriceLpCurrentTargetPrices')} return blockedEcPriceLpPlan;`)();
const bindings={
  config, join:path.join, realpathSync:fs.realpathSync, mkdirSync:fs.mkdirSync, existsSync:fs.existsSync,
  scopeEcPriceLpParameters:p=>({...p,targets:[]}),
  updateJob:async()=>{}, uploadArtifact:async()=>{},
  EC_PRICE_PLAN_SCHEMA:'plan-schema', EC_PRICE_RESULT_SCHEMA:'result-schema',
  buildEcPricePlanPrompt:p=>JSON.stringify(p), buildEcPriceWritePrompt:p=>JSON.stringify(p),
  validateEcPricePlan:()=>null, validateEcPriceResultV2:()=>null,
  assertEcPriceRecipeSnapshot:async()=>{}, ecPriceLpCurrentTargetPrices:()=>[],
  positiveEcPriceInteger:v=>v, verifyRegisteredEcPriceLp:async()=>null,
  browserPermissionRequired:()=>false,
  readRegisteredEcPriceLp:async()=>{if(publicReadIssue)throw new Error(publicReadIssue);return publicEvidence;},
  bindEcPriceLpPublicPlan:bindPublicPlan,
  blockedLpResult, blockedEcPriceLpPlan, summarizeCodexPhaseFailure:(_stderr,fallback)=>fallback,
  runEcPriceCodexPhase:async options=>{
    calls.push(options);
    if(calls.length===1){
      const root=path.join(options.workspaceDir,'.lp-price-jobs/fresh-repo');
      fs.mkdirSync(root,{recursive:true});
      return {exitCode:0,tabPolicyViolation:planTabPolicyViolation,result:{status:'ready',reference_standard_price:1944,lp:{project_root:root,source_commit:'a'.repeat(40),updates:[publicUpdate],message:'Fresh clone verified'}}};
    }
    return {exitCode:0,tabPolicyViolation:writeTabPolicyViolation,result:{status:'completed',lp:{status:'updated',final_prices:[1944]}}};
  },
};
const lpFunction = new Function(...Object.keys(bindings), `async ${section('executeSingleEcPriceLp', 'scopeEcPriceSiteParameters')} return executeSingleEcPriceLp;`)(...Object.values(bindings));
(async()=>{
  const job={id:'00000000-0000-4000-8000-000000000001'};
  const workDir=path.join(fixture,'job-artifacts'); fs.mkdirSync(workDir);
  const result=await lpFunction({job,workDir,parameters:{targets:[],lpUpdate:true,lpUrl:'https://example.invalid/'},index:0,totalSteps:1,range:{start:5,middle:50,end:95}});
  assert.equal(result.resultLp.status,'updated');
  assert.equal(calls.length,2);
  const task=JSON.parse(calls[0].prompt);
  assert.equal(task.lpResolverPath,resolver);
  assert.equal(task.lpPublicReaderPath,publicReader);
  assert.deepEqual(task.lpPublicEvidence,publicEvidence,'Codex receives parsed public evidence before planning');
  assert.deepEqual(JSON.parse(calls[1].prompt).lpPublicBindings,[{block_id:publicBlock.block_id,observed_price:1750,target_price:1944}]);
  assert.equal(task.lpWorkspaceRoot,path.join(config.workspace,'.lp-price-jobs',job.id));
  assert.equal(calls[0].workspaceDir,task.lpWorkspaceRoot);
  assert.ok(calls[1].workspaceDir.startsWith(task.lpWorkspaceRoot+path.sep));
  for(const call of calls){assert.equal(call.sandbox,'workspace-write');assert.equal(call.autoReview,true);assert.equal(call.sandboxNetworkAccess,true);}
  assert.equal(calls[0].abortOnTabPolicyViolation,false);
  assert.equal(calls[1].abortOnTabPolicyViolation,true);
  for(const call of calls)assert.equal(call.maxTemporaryTabs,0);
  const violation='Forbidden LP browser operation';
  const options={job,workDir,parameters:{targets:[],lpUpdate:true,lpUrl:'https://example.invalid/'},index:0,totalSteps:1,range:{start:5,middle:50,end:95}};
  calls.length=0; planTabPolicyViolation=violation;
  const planBlocked=await lpFunction(options);
  assert.equal(calls.length,1,'A browser-policy violation in a ready plan must prevent the write phase');
  assert.equal(planBlocked.resultLp.status,'blocked');
  assert.match(planBlocked.resultLp.message,/Forbidden LP browser operation/,'Show the actual failure rather than the ready-plan message');
  assert.doesNotMatch(planBlocked.resultLp.message,/^Fresh clone verified$/);
  calls.length=0; planTabPolicyViolation=null; writeTabPolicyViolation=violation;
  const writeBlocked=await lpFunction(options);
  assert.equal(calls.length,2);
  assert.equal(writeBlocked.resultLp.status,'blocked');
  assert.match(writeBlocked.resultLp.message,/Forbidden LP browser operation/);
  calls.length=0; publicReadIssue='HTTP 404';
  const readBlocked=await lpFunction(options);
  assert.equal(calls.length,0,'A failed public preflight stops before any Codex phase');
  assert.match(readBlocked.resultLp.message,/HTTP 404/);
  assert.equal(bindPublicPlan({lp:{updates:[publicUpdate]}},publicEvidence).issue,null);
  assert.match(bindPublicPlan({lp:{updates:[{...publicUpdate,occurrence_evidence:'price only'}]}},publicEvidence).issue,/公開商品ブロック/);
  assert.match(bindPublicPlan({lp:{updates:[{...publicUpdate,observed_price:790}]}},publicEvidence).issue,/現価格/);
  assert.match(bindPublicPlan({lp:{updates:[publicUpdate]}},{product_blocks:[{...publicBlock,prices:[1750,790]}]}).issue,/価格基準が複数/);
  const shippingBlock={...publicBlock,prices:[790,300],item_prices:[790],shipping_prices:[300]};
  const shippingUpdate={...publicUpdate,observed_price:790,target_price:885};
  const shippingBound=bindPublicPlan({lp:{updates:[shippingUpdate]}},{product_blocks:[shippingBlock]});
  assert.equal(shippingBound.issue,null,'明示された別建て送料を商品単価と混同しない');
  assert.deepEqual(shippingBound.bindings[0].shipping_prices,[300]);
  const bound=[{block_id:publicBlock.block_id,observed_price:1750,target_price:1944}];
  let deployed={product_blocks:[{...publicBlock,prices:[1944]}]};
  const verifyPublic = new Function('readRegisteredEcPriceLp',`async ${section('verifyRegisteredEcPriceLp', 'summarizeSequentialEcPriceResult')} return verifyRegisteredEcPriceLp;`)(async()=>deployed);
  assert.equal(await verifyPublic('https://example.invalid/',[1944],bound),null);
  deployed={product_blocks:[{...shippingBlock,prices:[885,300],item_prices:[885]}]};
  assert.equal(await verifyPublic('https://example.invalid/',[885],shippingBound.bindings),null);
  deployed={product_blocks:[{...shippingBlock,prices:[885,700],item_prices:[885],shipping_prices:[700]}]};
  assert.match(await verifyPublic('https://example.invalid/',[885],shippingBound.bindings),/対象商品ブロック/,'単価が一致しても送料が変わっていれば完了にしない');
  deployed={product_blocks:[publicBlock,{block_id:'LPB_fedcba9876543210',text:'Other product',prices:[1944]}]};
  assert.match(await verifyPublic('https://example.invalid/',[1944],bound),/対象商品ブロック/,'Another product at the target price cannot verify this plan');
  deployed={product_blocks:[{...publicBlock,prices:[1944]},{...publicBlock,prices:[1750]}]};
  assert.match(await verifyPublic('https://example.invalid/',[1944],bound),/対象商品ブロック/,'Every repeated bound card must agree');
  assert.match(await verifyPublic('https://example.invalid/',[1944],[]),/根拠/);
  const readPublic = new Function('config','join','pathToFileURL',`async ${section('readRegisteredEcPriceLp', 'bindEcPriceLpPublicPlan')} return readRegisteredEcPriceLp;`)(config,path.join,require('node:url').pathToFileURL);
  await assert.rejects(readPublic('https://example.invalid/redirect'),/最終URL/);
  console.log('LP phase sandbox, scoped workspace, resolver, browser guards and failure-message tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  // Remove only the unique temporary fixture created by this test.
  if(path.dirname(fixture)===os.tmpdir()&&path.basename(fixture).startsWith('tsa-lp-runtime-'))fs.rmSync(fixture,{recursive:true});
});
