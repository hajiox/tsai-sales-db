import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewRecoverySources, mergeReviewRecovery} from '../tools/tsa-codex-bridge/review-browser-recovery.mjs';
const row=(channel,status,message,reviews=[])=>({channel,productKey:channel,status,message,reviews});
const first={status:'partial',message:'partial',sources:[
 row('yahoo','partial','Chrome連係がタイムアウト',[{externalId:'old',body:'keep'}]),
 row('base','blocked','ログイン画面。Chromeがタイムアウト'),
 row('amazon','complete','confirmed',[{externalId:'a'}]),
 row('rakuten','blocked','個別レビューID未確認'),
]};
const packet={sources:first.sources.map(({channel,productKey})=>({channel,productKey}))};
const targets=reviewRecoverySources(packet,first);
assert.deepEqual(targets,[packet.sources[0]]);
for(const message of ['Chrome timeout; CAPTCHA','Chrome timeout; permission dialog','Chrome timeout; MFA','Chrome timeout; approval rejected','Chrome連係のタイムアウトとPC操作の許可拒否','Chrome接続不可、リモートデバッグを許可してください']){
 assert.equal(reviewRecoverySources(packet,{sources:[row('yahoo','blocked',message)]}).length,0);
}
const second={sources:[row('yahoo','complete','末尾確認',[{externalId:'new'},{externalId:'old',body:'changed'}])]};
const merged=mergeReviewRecovery(first,second,targets);
assert.equal(merged.status,'partial');
assert.equal(merged.sources[0].status,'complete');
assert.equal(merged.sources[0].reviews.length,2);
assert.equal(merged.sources[0].reviews.find(r=>r.externalId==='old').body,'keep');
assert.equal(merged.sources[2],first.sources[2]);
for(const status of ['blocked','no_reviews']){
 const kept=mergeReviewRecovery(first,{sources:[row('yahoo',status,'retry stopped')]},targets);
 assert.equal(kept.sources[0].reviews.length,1);assert.equal(kept.sources[0].status,'partial');
}
assert.throws(()=>mergeReviewRecovery(first,{sources:[row('amazon','complete','wrong')]},targets));
assert.throws(()=>mergeReviewRecovery(first,{sources:[]},targets));
assert.throws(()=>mergeReviewRecovery(first,{sources:[...second.sources,...second.sources]},targets));
const capped=mergeReviewRecovery(first,{sources:[row('yahoo','complete','end',Array.from({length:200},(_,i)=>({externalId:String(i)})))]},targets);
assert.equal(capped.sources[0].reviews.length,200);assert.equal(capped.sources[0].status,'partial');
const bridge=readFileSync('tools/tsa-codex-bridge/bridge.mjs','utf8');
assert.match(bridge,/await run\(true, \{\.\.\.packet, sources\}\)/);
assert.match(bridge,/review-devtools-result\.json/);
console.log('PASS review fallback: scoped transport recovery, auth waits, complete-source preservation, deduplication, partial retention, target validation, 200 limit, wired fallback');
