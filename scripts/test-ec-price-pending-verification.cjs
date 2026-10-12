const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../tools/tsa-codex-bridge/bridge.mjs'), 'utf8');
function extract(name, next, async = false) {
  const start = source.indexOf(`${async ? 'async ' : ''}function ${name}(`);
  const end = source.indexOf(`${next.startsWith('async ') ? '' : 'function '}${next}(`, start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end).replace(/async\s*$/, '');
}
const positive = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const classify = new Function('positiveEcPriceInteger', `${extract('ecPriceVerificationOnlyResult', 'async function updateEcPriceProgressCheckpoint')} return ecPriceVerificationOnlyResult;`)(positive);
const recoveryBuilder = new Function('positiveEcPriceInteger', 'notApplicableEcPriceLpPlan', 'validateEcPricePlan', `${extract('buildReusableEcPriceRecoveryPlan', 'scopeEcPriceLpParameters')} return buildReusableEcPriceRecoveryPlan;`)(positive, () => ({status:'not_applicable'}), () => null);
const previous = {site:'amazon',status:'planned',observed_price:1850,target_price:1944,product_identifier:'B0EXACTSKU',pricing_rule:'standard_price',basis_price:1850};
const parameters = {targets:['amazon'],verificationOnlyTargets:['amazon'],newPriceInclTax:1944,siteBaselines:{amazon:1850},recoveryPlanSites:[previous]};
assert.equal(recoveryBuilder(parameters), null, '送信済み反映確認は古い計画を再利用せず新しく読む');
assert.equal(classify(parameters, {...previous}).status, 'submitted_pending');
assert.equal(classify(parameters, {...previous,observed_price:1900}).status, 'blocked');
assert.equal(classify({...parameters,recoveryPlanSites:[]}, previous).status, 'blocked');
assert.equal(classify({...parameters,verificationOnlyTargets:[]}, previous), null);

const calls = [];
const events = [];
let observed = 1850;
const bindings = {
  scopeEcPriceSiteParameters: p=>p, ecPriceTargetLabel: s=>s, join:path.join,
  updateJob: async (_id,event)=>events.push(event),
  buildReusableEcPriceRecoveryPlan: recoveryBuilder,
  writeFileSync:()=>{throw new Error('古い計画の再利用は禁止');},
  runEcPriceCodexPhase: async options=>{
    calls.push(options);
    assert.equal(options.schema, 'plan', '確認専用では書込用CLIを起動しない');
    return {exitCode:0,result:{status:'ready',reference_standard_price:1850,sites:[{...previous,observed_price:observed}]}};
  },
  EC_PRICE_PLAN_SCHEMA:'plan', EC_PRICE_RESULT_SCHEMA:'write',
  buildEcPricePlanPrompt:()=>'', buildEcPriceWritePrompt:()=>{throw new Error('書込promptは禁止');},
  uploadArtifact:async()=>{},existsSync:()=>false,
  validateEcPricePlan:()=>null,validateEcPriceResultV2:()=>null,
  assertEcPriceRecipeSnapshot:async()=>{},positiveEcPriceInteger:positive,
  notApplicableEcPriceLpResult:()=>({status:'not_applicable'}),
  ecPriceVerificationOnlyResult:classify,
};
const execute = new Function(...Object.keys(bindings), `${extract('executeSingleEcPriceSite','async function executeSingleEcPriceLp',true)} return executeSingleEcPriceSite;`)(...Object.values(bindings));
(async()=>{
  for (const [price,status] of [[1850,'submitted_pending'],[1900,'blocked'],[1944,'updated']]) {
    observed=price;calls.length=0;events.length=0;
    const result = await execute({job:{id:'pending-fixture'},workDir:'fixture',parameters,site:'amazon',index:0,totalSteps:1,range:{start:5,middle:50,end:95}});
    assert.equal(result.resultSite.status,status);
    assert.equal(result.resultSite.final_price,price);
    assert.equal(calls.length,1,'読み取り工程1回だけで完了し、再送信しない');
  }
  console.log('EC price pending verification: PASS (fresh read, already applied, still pending, unexpected price, no writes)');
})().catch(error=>{console.error(error);process.exitCode=1;});
