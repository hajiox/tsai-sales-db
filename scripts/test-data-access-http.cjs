const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const ts=require('typescript');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..','lib','data-access');
function moduleSource(name,imports){
  const js=ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const target={};vm.runInNewContext(js,{exports:target,require:name=>imports[name],process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}},console:{error:()=>{}},Response,Buffer,Object,Date,Number,Array,Error,JSON});return target;
}
const contracts=moduleSource('contracts',{});
let calls=0,lastArgs,response={data:{items:[],nextCursor:null},error:null};
const server=moduleSource('server',{'server-only':{},'node:crypto':crypto,'./contracts':contracts,'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{assert.equal(name,'tsa_data_access_v1');calls++;lastArgs=args;return response}})}});
const token='tsa_data_'+crypto.randomBytes(32).toString('base64url');
function request(payload,auth=token){return new Request('https://example.invalid/api/data-access/v1/read',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(payload)})}
async function main(){
  let result=await server.handleDataAccess(request({resource:'recipes'},null),'read');assert.equal(result.status,401);assert.equal(calls,0);
  result=await server.handleDataAccess(request({resource:'recipes'},'other_bridge_token'),'read');assert.equal(result.status,401);assert.equal(calls,0);
  result=await server.handleDataAccess(request({resource:'recipes'}),'read');assert.equal(result.status,200);assert.equal(lastArgs.p_token_hash,crypto.createHash('sha256').update(token).digest('hex'));assert.equal(lastArgs.p_payload.limit,25);
  assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await result.json()).ok,true);
  const before=calls;
  result=await server.handleDataAccess(request({resource:'recipes',unexpected:true}),'read');assert.equal(result.status,400);assert.equal(calls,before);
  result=await server.handleDataAccess(request({resource:'recipes',query:'x'.repeat(40000)}),'read');assert.equal(result.status,413);assert.equal(calls,before);
  result=await server.handleDataAccess(request({values:{name:'replace'}}),'apply','00000000-0000-4000-8000-000000000001');assert.equal(result.status,400);assert.equal(calls,before);
  result=await server.handleDataAccess(request({}),'apply','00000000-0000-4000-8000-000000000001');assert.equal(result.status,200);assert.equal(lastArgs.p_action,'apply');assert.deepEqual(Object.keys(lastArgs.p_payload),['id']);
  response={data:null,error:{message:'DA_FORBIDDEN',code:'P0001'}};
  result=await server.handleDataAccess(request({resource:'recipes'}),'read');assert.equal(result.status,403);assert.equal((await result.json()).error.code,'FORBIDDEN');
  response={data:null,error:{message:'private raw database secret',code:'XX001'}};
  result=await server.handleDataAccess(request({resource:'recipes'}),'read');assert.equal(result.status,503);assert.ok(!(await result.text()).includes('private raw'));
  console.log('data-access HTTP token, request bounds and safe errors passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
