import assert from 'node:assert/strict';
import { installStoryDrag } from '../tools/tsa-codex-bridge/chrome-devtools-story-drag.mjs';
const schema = { optional(){return this},finite(){return this},min(){return this},max(){return this} };
const zod={number:()=>schema};
function fixture({url='https://business.facebook.com/latest/story_composer/',inDialog=true,failMove=false}={}) {
 const calls=[];let started=false;
 const page={url:()=>url,evaluate:async()=>({width:1000,height:800}),mouse:{
  move:async(x,y)=>{calls.push(['move',x,y]);if(started&&failMove)throw Error('mouse failure')},
  down:async()=>{started=true;calls.push(['down'])},up:async()=>calls.push(['up'])}};
 const handle={frame:{page:()=>page},evaluate:async()=>inDialog,clickablePoint:async()=>{assert.equal(started,false);return {x:200,y:200}},dispose:async()=>calls.push(['dispose'])};
 const tool={schema:{to_uid:schema},description:'Drag',handler:async()=>calls.push(['original'])};installStoryDrag(tool,zod);
 const request={params:{from_uid:'overlay',deltaX:120,deltaY:60},page:{getElementByUid:async()=>handle,waitForEventsAfterAction:async fn=>fn()}};
 const response={appendResponseLine:()=>{},attachWaitForResult:()=>{},includeSnapshot:()=>{}};
 return {tool,request,response,calls};
}
const good=fixture();await good.tool.handler(good.request,good.response);
assert.equal(good.calls.filter(c=>c[0]==='move').length,13);
assert.deepEqual(good.calls.at(-3),['move',320,260]);
assert.deepEqual(good.calls.at(-2),['up']);
for(const opts of [{url:'https://example.com/'},{inDialog:false}]){
 const f=fixture(opts);await assert.rejects(f.tool.handler(f.request,f.response));assert.equal(f.calls.some(c=>c[0]==='down'),false);
}
const failed=fixture({failMove:true});await assert.rejects(failed.tool.handler(failed.request,failed.response));assert.equal(failed.calls.filter(c=>c[0]==='up').length,1);
const outside=fixture();outside.request.params.deltaX=2000;await assert.rejects(outside.tool.handler(outside.request,outside.response));assert.equal(outside.calls.some(c=>c[0]==='down'),false);
const normal=fixture({url:'https://example.com/'});normal.request.params={from_uid:'a',to_uid:'b'};await normal.tool.handler(normal.request,normal.response);assert.deepEqual(normal.calls[0],['original']);
console.log('Story drag: stale-handle avoidance, stepped movement, scope, bounds, release on failure and original fallback passed.');
