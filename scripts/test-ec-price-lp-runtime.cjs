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
const builderForPlatform = platform => new Function('config', 'RESULT_SCHEMA', 'uniquePaths', 'appendUnifiedCuaMcpArgs', 'appendChromeDevtoolsMcpArgs', 'BROWSER_ROUTE_POLICY', 'process',
  `${section('buildIsolatedCodexArgs', 'emptyCodexUsage')} return buildIsolatedCodexArgs;`)(config, 'schema.json', values=>[...new Set(values.filter(Boolean))], ()=>{}, ()=>{}, 'route policy', {platform});
const builder = builderForPlatform('win32');
const explicitOptions = {
  cwd: 'lp-workspace', schema: 'schema.json', focusedContext:true, ephemeral:true,
  sandbox:'workspace-write', autoReview:true, sandboxNetworkAccess:true,
};
const explicit = builder('output.json', ['job-artifacts', 'lp-workspace'], explicitOptions);
assert.equal(explicit[explicit.indexOf('--sandbox')+1], 'workspace-write');
assert.equal(explicit[explicit.indexOf('--cd')+1], 'lp-workspace');
assert.deepEqual(explicit.flatMap((value,index)=>value==='--add-dir'?[explicit[index+1]]:[]), ['job-artifacts','lp-workspace']);
assert.equal(explicit.filter(value=>value==='windows.sandbox="elevated"').length, 1);
assert.ok(!explicit.includes('--approve-for-me'), 'CLI rejects combining the shortcut with --sandbox');
assert.ok(explicit.includes('approval_policy="on-request"'));
assert.ok(explicit.includes('approvals_reviewer="auto_review"'));
assert.ok(explicit.includes('sandbox_workspace_write.network_access=true'));
assert.ok(explicit.includes('--ignore-user-config') && explicit.includes('--ignore-rules') && explicit.includes('--ephemeral'));
assert.equal(explicit[explicit.indexOf('--model')+1], 'gpt-6-luna');
const ec = builder('output.json', ['job-artifacts'], {});
assert.ok(ec.includes('--approve-for-me'));
assert.ok(!ec.includes('--sandbox') && !ec.some(v=>v.includes('network_access')||v.includes('windows.sandbox')));
const readOnly = builder('output.json', ['job-artifacts'], {sandbox:'read-only'});
assert.ok(!readOnly.includes('--approve-for-me') && !readOnly.some(v=>v.includes('auto_review')||v.includes('network_access')||v.includes('windows.sandbox')));
for (const platform of ['linux','darwin']) {
  const nonWindows = builderForPlatform(platform)('output.json', ['job-artifacts','lp-workspace'], explicitOptions);
  assert.deepEqual(nonWindows, explicit.filter((value,index)=>value!=='windows.sandbox="elevated"'&&explicit[index+1]!=='windows.sandbox="elevated"'), `${platform} retains the same contract without the Windows implementation override`);
}
const summarize = new Function(`${section('summarizeSequentialEcPriceResult', 'ecPriceTargetLabel')} return summarizeSequentialEcPriceResult;`)();
assert.doesNotMatch(summarize({sites:[],lp:{status:'blocked'}},{targets:[],lpUpdate:true}), /EC反映済み0件/);
assert.match(summarize({sites:[{status:'updated'}],lp:{status:'updated'}},{targets:['rakuten'],lpUpdate:true}), /EC反映済み1件/);
const calls=[];
let planTabPolicyViolation=null;
let writeTabPolicyViolation=null;
let publicReadIssue=null;
let sourceIssue=null;
let sourceChecksIssue=null;
let conflictingPlanRoot=null;
const resolverCalls=[];
const publicBlock={block_id:'LPB_0123456789abcdef',text:'Exact soup product, five servings, 1750円',prices:[1750]};
const publicEvidence={http_status:200,final_url:'https://example.invalid/',product_blocks:[publicBlock]};
const bindPublicPlan = new Function(`${section('bindEcPriceLpPublicPlan', 'verifyRegisteredEcPriceLp')} return bindEcPriceLpPublicPlan;`)();
const publicUpdate={occurrence_evidence:`${publicBlock.block_id}: exact soup product and five servings`,observed_price:1750,target_price:1944};
const blockedLpResult = new Function(`${section('blockedLpResult', 'validateEcProductNameGenerateJobParameters')} return blockedLpResult;`)();
const blockedEcPriceLpPlan = new Function(`${section('blockedEcPriceLpPlan', 'ecPriceLpCurrentTargetPrices')} return blockedEcPriceLpPlan;`)();
const bindResolvedPlan = new Function('isAbsolute','resolve',`${section('bindEcPriceLpResolvedPlan', 'executeSingleEcPriceLp')} return bindEcPriceLpResolvedPlan;`)(path.isAbsolute,path.resolve);
const inside=(candidate,root)=>{const relative=path.relative(root,candidate);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
const validateSource=new Function('realpathSync','lstatSync','statSync','join','resolve','dirname','isAbsolute','pathIsInside',
  `${section('validateEcPriceLpResolvedSource','verifyEcPriceLpResolvedGit')} return validateEcPriceLpResolvedSource;`)(fs.realpathSync,fs.lstatSync,fs.statSync,path.join,path.resolve,path.dirname,path.isAbsolute,inside);
const verifyGit=new Function('spawnSync','lstatSync','realpathSync','resolve',`${section('verifyEcPriceLpResolvedGit','prepareEcPriceLpSource')} return verifyEcPriceLpResolvedGit;`)(require('node:child_process').spawnSync,fs.lstatSync,fs.realpathSync,path.resolve);
const bindings={
  config, join:path.join, realpathSync:fs.realpathSync, mkdirSync:fs.mkdirSync, existsSync:fs.existsSync, writeFileSync:fs.writeFileSync,
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
  bindEcPriceLpResolvedPlan:bindResolvedPlan,
  verifyEcPriceLpResolvedGit:()=>sourceChecksIssue,
  prepareEcPriceLpSource:async parameters=>{
    resolverCalls.push(parameters.lpWorkspaceRoot);
    if(sourceIssue)throw new Error(sourceIssue);
    const root=path.join(parameters.lpWorkspaceRoot,'.lp-price-jobs/fresh-repo');
    fs.mkdirSync(root,{recursive:true});
    return {url:parameters.lpUrl,host:'example.invalid',project_root:root,github_repository:'fixture/repo',production_branch:'main',source_commit:'a'.repeat(40),source_resolution:'vercel'};
  },
  blockedLpResult, blockedEcPriceLpPlan, summarizeCodexPhaseFailure:(_stderr,fallback)=>fallback,
  runEcPriceCodexPhase:async options=>{
    calls.push(options);
    if(calls.length===1){
      return {exitCode:0,tabPolicyViolation:planTabPolicyViolation,result:{status:'ready',reference_standard_price:1944,lp:{project_root:conflictingPlanRoot,github_repository:'',production_branch:'',source_commit:'',updates:[publicUpdate],message:'Fresh clone verified'}}};
    }
    return {exitCode:0,tabPolicyViolation:writeTabPolicyViolation,result:{status:'completed',lp:{status:'updated',final_prices:[1944]}}};
  },
};
const lpFunction = new Function(...Object.keys(bindings), `async ${section('executeSingleEcPriceLp', 'scopeEcPriceSiteParameters')} return executeSingleEcPriceLp;`)(...Object.values(bindings));
(async()=>{
  // Exercise the trust boundary with actual test-owned directories and local Git,
  // without contacting production or GitHub.
  const sourceWorkspace=path.join(fixture,"source's-job");
  const sourceRoot=path.join(sourceWorkspace,'.lp-price-jobs','fresh-source');
  fs.mkdirSync(sourceRoot,{recursive:true});
  const git=(...args)=>require('node:child_process').execFileSync('git',['-C',sourceRoot,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','main'); git('config','user.name','Fixture'); git('config','user.email','fixture@example.invalid');
  fs.writeFileSync(path.join(sourceRoot,'page.html'),'Fixture'); git('add','page.html'); git('commit','-m','Fixture');
  git('remote','add','origin','https://github.com/fixture/repo.git');
  const sourceCommit=git('rev-parse','HEAD'); git('update-ref','refs/remotes/origin/main',sourceCommit);
  const sourceParameters={lpUrl:'https://example.invalid/',lpWorkspaceRoot:sourceWorkspace,lpSource:{githubRepository:'fixture/repo',productionBranch:'main'}};
  const resolvedInput={url:sourceParameters.lpUrl,host:'example.invalid',cloned:true,source_resolution:'server_allowlist',github_repository:'fixture/repo',production_branch:'main',source_commit:sourceCommit,project_roots:[sourceRoot]};
  const fixedSource=validateSource(resolvedInput,sourceParameters);
  assert.ok(Object.isFrozen(fixedSource));
  assert.equal(verifyGit(fixedSource),null);
  for(const bad of [
    {url:'https://other.invalid/'},{host:'other.invalid'},{cloned:false},{source_resolution:'vercel'},
    {github_repository:'other/repo'},{production_branch:'develop'},{source_commit:'bogus'},
    {project_roots:[]},{project_roots:[sourceRoot,sourceRoot]},{project_roots:['relative']},
    {project_roots:[fixture]},{project_roots:[path.join(sourceRoot,'missing')]},
  ]) assert.throws(()=>validateSource({...resolvedInput,...bad},sourceParameters),'Reject an unproven or invalid resolver descriptor');
  assert.throws(()=>validateSource(resolvedInput,{...sourceParameters,lpSource:null}),/Vercel/,'No server allowlist may be invented when none was locked');
  assert.equal(validateSource({...resolvedInput,source_resolution:'vercel'},{...sourceParameters,lpSource:null}).project_root,sourceRoot);
  const linkedRoot=path.join(sourceWorkspace,'.lp-price-jobs','linked-source');
  fs.symlinkSync(sourceRoot,linkedRoot,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>validateSource({...resolvedInput,project_roots:[linkedRoot]},sourceParameters),/リンク/);
  assert.match(verifyGit({...fixedSource,project_root:linkedRoot}),/実パス/,'Recheck path identity after planning, before writing');
  fs.writeFileSync(path.join(sourceRoot,'untracked'),'dirty'); assert.match(verifyGit(fixedSource),/クリーン/); fs.unlinkSync(path.join(sourceRoot,'untracked'));
  git('remote','set-url','origin','https://example.invalid/fixture/repo.git'); assert.match(verifyGit(fixedSource),/origin/);
  git('remote','set-url','origin','https://github.com/fixture/repo.git');
  git('update-ref','-d','refs/remotes/origin/main'); assert.match(verifyGit(fixedSource),/remoteHead/); git('update-ref','refs/remotes/origin/main',sourceCommit);
  assert.match(verifyGit({...fixedSource,source_commit:'b'.repeat(40)}),/コミット/);
  git('checkout','-b','wrong-branch'); assert.match(verifyGit(fixedSource),/本番ブランチ/); git('checkout','main');
  const emptyPlan={status:'ready',lp:{project_root:null,github_repository:'',production_branch:'',source_commit:''}};
  assert.equal(bindResolvedPlan(emptyPlan,{lpResolvedSource:fixedSource}).plan.lp.project_root,sourceRoot);
  for(const [field,value] of [['project_root',fixture],['github_repository','other/repo'],['production_branch','develop'],['source_commit','b'.repeat(40)]]) {
    const badPlan={...emptyPlan,lp:{...emptyPlan.lp,[field]:value}};
    assert.match(bindResolvedPlan(badPlan,{lpResolvedSource:fixedSource}).issue,/Bridgeで固定/);
    assert.equal(badPlan.lp[field],value,'Never silently correct conflicting AI values');
  }
  const promptBuilder=new Function(`${section('buildEcPricePlanPrompt','buildEcPriceWritePrompt')} return buildEcPricePlanPrompt;`)();
  const resolvedPrompt=promptBuilder({targets:[],lpUpdate:true,lpResolvedSource:fixedSource});
  assert.match(resolvedPrompt,/lp\.project_root=null/);
  assert.match(resolvedPrompt,/Do not run find-lp-source\.ps1/);
  assert.doesNotMatch(resolvedPrompt,/run find-lp-source\.ps1 with -FreshClone/,'Resolved jobs must not ask AI to resolve again');
  assert.match(resolvedPrompt,/occurrence_evidence must contain exactly one supplied product block_id: the target block/);
  assert.match(resolvedPrompt,/Never include excluded or other product block IDs in occurrence_evidence; put any excluded-product explanation and IDs in lp\.product_evidence instead/);
  const launches=[];
  let resolverOutput=JSON.stringify(resolvedInput),resolverExit=0,resolverHang=false,terminations=0;
  const prepareSource=new Function('join','spawn','heartbeat','terminateChildProcessTree','redactSensitiveEventText','validateEcPriceLpResolvedSource','verifyEcPriceLpResolvedGit','setTimeout',
    `async ${section('prepareEcPriceLpSource','bindEcPriceLpResolvedPlan')} return prepareEcPriceLpSource;`)(path.join,(executable,args,options)=>{
      launches.push({executable,args,options});
      const child=new(require('node:events').EventEmitter)(); child.pid=1;
      child.stdout=new(require('node:events').EventEmitter)(); child.stderr=new(require('node:events').EventEmitter)();
      child.stdout.setEncoding=child.stderr.setEncoding=()=>{};
      process.nextTick(()=>{if(!resolverHang){child.stdout.emit('data',resolverOutput);child.emit('close',resolverExit);}});
      return child;
    },async()=>{},()=>{terminations++;},()=>'',validateSource,verifyGit,(cb,ms)=>setTimeout(cb,ms===180_000?20:ms));
  const launchParameters={...sourceParameters,lpResolverPath:path.join(fixture,"skill's resolver.ps1")};
  assert.equal((await prepareSource(launchParameters)).project_root,sourceRoot);
  const launch=launches[0]; const command=Buffer.from(launch.args.at(-1),'base64').toString('utf16le');
  assert.equal(launch.options.cwd,sourceWorkspace);
  assert.match(command,/skill''s resolver\.ps1/,'PowerShell literal quoting preserves apostrophes');
  assert.match(command,/-ExpectedGithubRepository 'fixture\/repo' -ExpectedProductionBranch 'main'/);
  assert.equal(launch.options.env.GIT_TERMINAL_PROMPT,'0');
  assert.ok(!launch.args.includes('-ExecutionPolicy')&&!Object.hasOwn(launch.options,'shell'));
  resolverOutput='not JSON'; await assert.rejects(prepareSource(launchParameters),/JSON/);
  resolverExit=1; await assert.rejects(prepareSource(launchParameters),/取得に失敗/);
  resolverExit=0; resolverHang=true; await assert.rejects(prepareSource(launchParameters),/時間内/); assert.equal(terminations,1);
  const job={id:'00000000-0000-4000-8000-000000000001'};
  const workDir=path.join(fixture,'job-artifacts'); fs.mkdirSync(workDir);
  const result=await lpFunction({job,workDir,parameters:{targets:[],lpUpdate:true,lpUrl:'https://example.invalid/'},index:0,totalSteps:1,range:{start:5,middle:50,end:95}});
  assert.equal(result.resultLp.status,'updated');
  assert.equal(calls.length,2);
  assert.equal(resolverCalls.length,1,'Bridge resolves exactly once before AI planning');
  const task=JSON.parse(calls[0].prompt);
  assert.equal(task.lpResolverPath,resolver);
  assert.equal(task.lpPublicReaderPath,publicReader);
  assert.deepEqual(task.lpPublicEvidence,publicEvidence,'Codex receives parsed public evidence before planning');
  assert.deepEqual(JSON.parse(calls[1].prompt).lpPublicBindings,[{block_id:publicBlock.block_id,observed_price:1750,target_price:1944}]);
  assert.equal(task.lpWorkspaceRoot,path.join(config.workspace,'.lp-price-jobs',job.id));
  assert.equal(calls[0].workspaceDir,task.lpResolvedSource.project_root);
  assert.equal(calls[1].workspaceDir,task.lpResolvedSource.project_root,'Writing uses the authoritative actual clone, not an AI path');
  assert.equal(result.planLp.project_root,task.lpResolvedSource.project_root);
  assert.equal(JSON.parse(fs.readFileSync(path.join(workDir,'ec-price-lp-plan.json'),'utf8')).lp.project_root,task.lpResolvedSource.project_root,'Persist the bound plan used by the writer');
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
  calls.length=0; writeTabPolicyViolation=null; conflictingPlanRoot=path.join(config.workspace,'previous-job');
  const conflicting=await lpFunction(options);
  assert.equal(calls.length,1,'An invented or previous-job AI root must not be corrected or written');
  assert.match(conflicting.resultLp.message,/Bridgeで固定/);
  calls.length=0; conflictingPlanRoot=null; sourceChecksIssue='Dirty clone after planning';
  const dirty=await lpFunction(options);
  assert.equal(calls.length,1,'AI planning must leave the validated source clean');
  assert.match(dirty.resultLp.message,/Dirty clone/);
  calls.length=0; sourceChecksIssue=null; sourceIssue='GitHub authentication check failed';
  const sourceBlocked=await lpFunction(options);
  assert.equal(calls.length,0,'Resolver failure stops before AI planning and writing');
  assert.equal(sourceBlocked.operatorWait,true);
  assert.match(sourceBlocked.resultLp.message,/authentication/);
  sourceIssue=null;
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
  // bc6cec17: listing excluded blocks in occurrence_evidence correctly blocked writing.
  const onePackBlock={block_id:'LPB_78acad24490191b4',item_prices:[790],shipping_prices:[300]};
  const excludedBlocks=[
    {block_id:'LPB_ec090694a5f5f32f',item_prices:[1404]},
    {block_id:'LPB_709406881394c748',item_prices:[3450]},
    {block_id:'LPB_18e77c30489da867',item_prices:[1944]},
  ];
  const onePackEvidence={product_blocks:[...excludedBlocks,onePackBlock]};
  const excludedEvidence='LPB_ec090694a5f5f32fは2食セット、LPB_709406881394c748は6食セット、LPB_18e77c30489da867はスープ5食セットで対象外。';
  const targetEvidence='対象のLPB_78acad24490191b4はチャーシュー付き1食の商品カード、商品単価790円、別建て送料300円。';
  const onePackUpdate={observed_price:790,target_price:885,occurrence_evidence:excludedEvidence+targetEvidence};
  assert.match(bindPublicPlan({lp:{updates:[onePackUpdate]}},onePackEvidence).issue,/公開商品ブロック/,'Four IDs remain ambiguous even when three are described as excluded');
  const onePackBound=bindPublicPlan({lp:{product_evidence:excludedEvidence,updates:[{...onePackUpdate,occurrence_evidence:targetEvidence}]}},onePackEvidence);
  assert.equal(onePackBound.issue,null,'Excluded IDs belong in product evidence, leaving exactly one target ID per occurrence');
  assert.deepEqual(onePackBound.bindings,[{block_id:onePackBlock.block_id,observed_price:790,target_price:885,shipping_prices:[300]}]);
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
