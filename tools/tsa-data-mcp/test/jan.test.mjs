import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const token = `tsa_data_${'j'.repeat(43)}`;
const janId = '7c0f8042-cc99-42f2-9a96-8684e846a337';
const recipeId = '8c0f8042-cc99-42f2-9a96-8684e846a337';
const version = 'a'.repeat(32);
test('JAN five tools use fixed HTTP, strict CAS and idempotency; PNG preview is MCP image', async () => {
 const requests=[];let deny=false;
 const http=createServer(async(req,res)=>{let text='';for await(const chunk of req) text+=chunk;const body=JSON.parse(text);requests.push({url:req.url,body,auth:req.headers.authorization});res.setHeader('content-type','application/json');if(deny){res.statusCode=403;res.end(JSON.stringify({ok:false,error:{code:'FORBIDDEN',message:token}}));return;}
 const file = {filename:'barcode_4571318639917.png',mimeType:'image/png',encoding:'base64',content:Buffer.from('synthetic PNG fixture').toString('base64')};
 res.end(JSON.stringify({ok:true,data:body.action==='export'?{janCode:'4571318639917',file}:{jan:{id:janId,_version:version},items:[],nextOffset:null},requestId:'jan_mock'}));});
 http.listen(0,'127.0.0.1');await once(http,'listening');
 const client=new Client({name:'jan-test',version:'1.3.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url))],env:{TSA_DATA_API_URL:`http://127.0.0.1:${http.address().port}`,TSA_DATA_API_TOKEN:token,TSA_DATA_ALLOW_LOCALHOST:'1'},stderr:'pipe'});
 let stderr='';transport.stderr?.on('data',chunk=>{stderr+=chunk.toString()});
 try{await client.connect(transport);assert.equal(client.getServerVersion().version,'1.3.0');const{tools}=await client.listTools();assert.equal(tools.length,29);
 for(const name of['tsa_list_jan_codes','tsa_issue_jan_code','tsa_assign_jan_code','tsa_update_jan_code','tsa_export_barcode']) assert.ok(tools.some(tool=>tool.name===name));
 assert.equal(tools.find(tool=>tool.name==='tsa_export_barcode').annotations.readOnlyHint,true);
 assert.equal(tools.find(tool=>tool.name==='tsa_issue_jan_code').annotations.idempotentHint,true);
 const valid=[['tsa_list_jan_codes',{query:'商品',unassigned:true,limit:1,offset:20}],['tsa_issue_jan_code',{values:{product_name:'合成商品',category:'食品',price_excl_tax:0},recipeId,expectedVersion:version,idempotencyKey:'jan-issue-001'}],['tsa_assign_jan_code',{janId,recipeId,expectedVersion:version,idempotencyKey:'jan-assign-001'}],['tsa_update_jan_code',{janId,expectedVersion:version,values:{memo:'合成検証'},idempotencyKey:'jan-update-001'}],['tsa_export_barcode',{janId}]];
 for(const[name,args]of valid){const result=await client.callTool({name,arguments:args});assert.equal(result.isError,undefined);if(name==='tsa_export_barcode'){assert.equal(result.content[1].type,'image');assert.equal(result.content[1].mimeType,'image/png');assert.equal(result.structuredContent.data.file.encoding,'base64');}}
 assert.deepEqual(requests.map(request=>request.body.action),['list','issue','assign','update','export']);assert.equal(requests.at(-1).body.format,'png');assert.ok(requests.every(request=>request.url==='/api/data-access/v1/jan-codes'&&request.auth===`Bearer ${token}`));
 const before=requests.length;
 for(const[name,args]of[
 ['tsa_list_jan_codes',{limit:101}],['tsa_list_jan_codes',{offset:1.2}],['tsa_list_jan_codes',{sql:'select 1'}],
 ['tsa_issue_jan_code',{values:{product_name:'x',category:'食品'},recipeId,idempotencyKey:'jan-invalid-1'}],
 ['tsa_issue_jan_code',{values:{product_name:'x',category:'食品'},expectedVersion:version,idempotencyKey:'jan-invalid-2'}],
 ['tsa_issue_jan_code',{values:{product_name:'x',category:'不明'},idempotencyKey:'jan-invalid-3'}],
 ['tsa_issue_jan_code',{values:{product_name:'x',category:'食品',company_prefix:'123'},idempotencyKey:'jan-invalid-4'}],
 ['tsa_issue_jan_code',{values:{product_name:'x',category:'食品',price_excl_tax:-1},idempotencyKey:'jan-invalid-5'}],
 ['tsa_assign_jan_code',{janId,recipeId,expectedVersion:version}],
 ['tsa_update_jan_code',{janId,expectedVersion:version,values:{jan_code:'123'},idempotencyKey:'jan-invalid-6'}],
 ['tsa_update_jan_code',{janId,expectedVersion:version,values:{},idempotencyKey:'jan-invalid-7'}],
 ['tsa_export_barcode',{janId,url:'https://elsewhere.invalid'}],['tsa_export_barcode',{janId,format:'html'}],
 ]) assert.equal((await client.callTool({name,arguments:args})).isError,true);
 assert.equal(requests.length,before);deny=true;const result=await client.callTool({name:'tsa_list_jan_codes',arguments:{}});assert.equal(result.isError,true);assert.equal(result.structuredContent.error.code,'FORBIDDEN');assert.ok(!JSON.stringify(result).includes(token));assert.ok(!stderr.includes(token));
 }finally{await client.close();await transport.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
});
