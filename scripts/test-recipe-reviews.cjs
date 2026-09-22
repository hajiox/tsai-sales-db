const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const{validReviewUrl,validReviewProductKey,sourceSchema,collectionSchema,validateAnalysis,reviewStats}=require('../lib/recipe-reviews/model.ts');
assert(!validReviewProductKey('unlinked:商品名','base'));
assert(!validReviewProductKey('name:商品名','yahoo'));
assert(validReviewProductKey('B08RXS3ZDL','amazon'));
assert(validReviewProductKey('12345678','base'));
assert(!sourceSchema.safeParse({channel:'base',productKey:'unlinked:商品名',name:'商品名',url:'https://admin.thebase.com/'}).success);
assert(validReviewUrl('https://www.amazon.co.jp/gp/customer-reviews/R1','amazon'));
for(const host of ['aizubrandhall-ec.com','www.aizubrandhall-ec.com'])assert(validReviewUrl(`https://${host}/items/141519965`,'base'));
for(const url of ['http://www.aizubrandhall-ec.com/items/141519965','https://www.aizubrandhall-ec.com.evil.test/items/141519965','https://other.aizubrandhall-ec.com/items/141519965','https://www.aizubrandhall-ec.com/about','https://www.aizubrandhall-ec.com/items/not-an-id','https://user:pass@www.aizubrandhall-ec.com/items/141519965','https://www.aizubrandhall-ec.com:444/items/141519965'])assert(!validReviewUrl(url,'base'));
assert(!validReviewUrl('https://www.aizubrandhall-ec.com/items/141519965','yahoo'));
for(const u of ['http://www.amazon.co.jp/x','https://amazon.co.jp.evil.test/x','https://a:b@amazon.co.jp/x','javascript:alert(1)','https://127.0.0.1/x'])assert(!validReviewUrl(u,'amazon'));
const r={externalId:'id',url:'https://www.amazon.co.jp/x',rating:5,title:'良い',body:'おいしい',postedAt:'2026-09-01'};
assert(collectionSchema.safeParse({status:'completed',message:'ok',sources:[{channel:'amazon',productKey:'B1',status:'complete',message:'matched',reviews:[r]}]}).success);
assert(!collectionSchema.safeParse({status:'completed',message:'ok',sources:[{channel:'amazon',productKey:'B1',status:'complete',message:'matched',reviews:[{...r,rating:6}]}]}).success);
const id='00000000-0000-4000-8000-000000000001';const reviews=[{id,channel:'amazon',rating:5},{id:'00000000-0000-4000-8000-000000000002',channel:'base',rating:null}];
const scope=channel=>({channel,summary:'summary',strengths:[],issues:[],actions:[],limitations:'limited'});
const result={scopes:[scope('all'),scope('amazon'),scope('base')]};assert(validateAnalysis(result,reviews));
assert.throws(()=>validateAnalysis({scopes:[scope('all')]},reviews));
assert.throws(()=>validateAnalysis({scopes:[scope('all'),scope('amazon'),{...scope('base'),issues:[{title:'t',description:'d',reviewIds:[id]}]}]},reviews));
assert.deepEqual(reviewStats(reviews).average,5);assert.equal(reviewStats(reviews).ratedCount,1);assert.equal(reviewStats([]).average,null);
console.log('PASS review validation: URL boundaries, rating range, scope completeness, cross-EC evidence, unrated statistics');

const {normalizeReviewExternalId}=require('../lib/recipe-reviews/model.ts');
const permalink='https://review.rakuten.co.jp/item/1/408521_10000068/7teu-i974u-j8m4cq_1_3959305336/';
const canonical='7teu-i974u-j8m4cq_1/3959305336';
for(const externalId of [permalink,canonical,'7teu-i974u-j8m4cq_1_3959305336']){
 assert.equal(normalizeReviewExternalId('rakuten',externalId,permalink),canonical);
 const parsed=collectionSchema.parse({status:'completed',message:'ok',sources:[{channel:'rakuten',productKey:'10000068',status:'complete',message:'matched',reviews:[{...r,externalId,url:permalink}]}]});
 assert.equal(parsed.sources[0].reviews[0].externalId,canonical);
}
assert.equal(normalizeReviewExternalId('amazon',permalink,permalink),permalink);
assert.equal(normalizeReviewExternalId('rakuten','other-review',permalink),'other-review');
for(const url of [permalink.replace('review.rakuten.co.jp','review.rakuten.co.jp.evil.test'),permalink.replace('https:','http:'),'https://review.rakuten.co.jp/item/1/408521_10000068/'])assert.equal(normalizeReviewExternalId('rakuten',url,url),url);
console.log('PASS Rakuten ID: CSV/permalink equivalence, input boundary, unrelated IDs and domains preserved');
