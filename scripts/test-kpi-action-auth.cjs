const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const dateFns=require('date-fns');
const root=path.join(__dirname,'..');
function compile(relative,dependencies){
  const code=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const result={exports:{}};
  new Function('require','module','exports','process',code)(name=>{if(Object.hasOwn(dependencies,name))return dependencies[name];throw new Error(`Unexpected module ${name}`)},result,result.exports,{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}});
  return result.exports;
}
const amounts=compile('lib/kpi-amounts.ts',{});
let session=null,dbCalls=0,upserts=0,revalidations=0,rpcFailure=false,writeFailure=false;
const actions=compile('app/kpi/actions.ts',{
  'next-auth':{getServerSession:async()=>session},
  '@/app/api/auth/[...nextauth]/route':{authOptions:{}},
  'date-fns':dateFns,
  '@/lib/kpi-amounts':amounts,
  'next/cache':{revalidatePath:value=>{assert.equal(value,'/kpi');revalidations++}},
  '@supabase/supabase-js':{createClient:()=>{dbCalls++;return {
    rpc:async()=>({data:[],error:rpcFailure?{message:'fixture RPC failure'}:null}),
    from:table=>{assert.equal(table,'kpi_manual_entries_v1');return {upsert:async()=>{upserts++;return {error:writeFailure?{message:'fixture write failure'}:null}}}},
  }}},
});
async function main(){
  const writeInput={channel:'WEB',month:'2026-08-01',amount:10};
  for(const deniedSession of [null,{user:{}},{user:{email:'other@example.invalid'}}]){
    session=deniedSession;const before=dbCalls;
    await assert.rejects(()=>actions.getKpiSummary(2027),/KPI管理者/);
    await assert.rejects(()=>actions.getAvailableKpiFiscalYears(2027),/KPI管理者/);
    const denied=await actions.saveKpiTarget(writeInput);assert.equal(denied.success,false);assert.match(denied.error,/KPI管理者/);
    await assert.rejects(()=>actions.updateKpiEntry('WEB','target','2026-08-01',10),/KPI管理者/);
    assert.equal(dbCalls,before,'denied actions must not initialize a privileged DB client');
  }
  session={user:{email:'AIZUBRANDHALL@GMAIL.COM'}};
  const summary=await actions.getKpiSummary(2027);assert.equal(summary.months.length,12);assert.equal(summary.fiscalYear,2027);
  assert.deepEqual(await actions.getAvailableKpiFiscalYears(2027),[2027]);
  assert.deepEqual(await actions.saveKpiTarget(writeInput),{success:true});
  assert.deepEqual(await actions.updateKpiEntry('WEB','target','2026-08-01',10),{success:true});
  assert.equal(upserts,2);assert.equal(revalidations,1);
  writeFailure=true;assert.equal((await actions.saveKpiTarget(writeInput)).success,false);
  await assert.rejects(()=>actions.updateKpiEntry('WEB','target','2026-08-01',10),/Failed to update entry/);
  rpcFailure=true;assert.deepEqual(await actions.getAvailableKpiFiscalYears(2027),[2027,2026,2025,2024,2023,2022,2021,2020]);
  console.log('KPI server actions: admin boundary, no privileged calls on denial and existing result shapes passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
