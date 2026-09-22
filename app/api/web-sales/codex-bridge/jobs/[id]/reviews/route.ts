import { NextResponse } from "next/server";
import { isCodexBridgeAuthorized,normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { db, allReviews, analysisPacket, REVIEW_TASKS, loadRecipe } from "@/lib/recipe-reviews/server";
import { parseCollectionImport, sourceSchema, validReviewUrl, validateAnalysis, type ReviewRow } from "@/lib/recipe-reviews/model";
export const runtime="nodejs"; export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
async function claimed(id:string,worker:string){const q=await db().from("web_sales_codex_jobs").select("*").eq("id",id).single();if(q.error)throw q.error;const j=q.data;
 if(!REVIEW_TASKS.includes(j.task_key)||j.status!=="running"||j.worker_id!==worker||Date.parse(j.lease_expires_at)<=Date.now())throw new Error("このPCの実行中レビュー処理ではありません");await loadRecipe(j.parameters.recipeId);return j;}
export async function POST(request:Request,{params}:Context){if(!isCodexBridgeAuthorized(request))return NextResponse.json({error:"Unauthorized"},{status:401});try{
 const body=await request.json();const{id}=await params;const worker=normalizeWorkerId(body.workerId);const job=await claimed(id,worker);const p=job.parameters;
 if(body.mode==="packet"){
  if(job.task_key==="recipe_reviews_collect")return NextResponse.json({packet:p});
  if(p.packet)return NextResponse.json({packet:p.packet});
  const packet={...analysisPacket(await allReviews(p.recipeId)),collectionCoverage:null as unknown};
  const coverage=await db().from("recipe_review_collections").select("result,created_at").eq("recipe_id",p.recipeId).order("created_at",{ascending:false}).limit(1);if(coverage.error)throw coverage.error;packet.collectionCoverage=coverage.data?.[0]??null;if(!packet.reviews.length)throw new Error("分析できるレビューがありません");
  const saved=await db().from("web_sales_codex_jobs").update({parameters:{...p,packet}}).eq("id",id).eq("status","running").eq("worker_id",worker);if(saved.error)throw saved.error;return NextResponse.json({packet});
 }
 if(body.mode!=="import")throw new Error("不明な処理です");
 if(job.task_key==="recipe_reviews_collect"){
 const data=parseCollectionImport(body.data);const targets=sourceSchema.array().parse(p.sources);const seen=new Set<string>();const rows:Record<string,unknown>[]=[];
 for(const source of data.sources){const target=targets.find(t=>t.channel===source.channel&&t.productKey===source.productKey);const key=source.channel+":"+source.productKey;if(!target||seen.has(key))throw new Error("収集元が依頼と一致しません");seen.add(key);
 if((source.status==="blocked"||source.status==="no_reviews")&&source.reviews.length)throw new Error("収集状態とレビュー数が一致しません");
 if(source.status==="complete"&&!source.reviews.length)throw new Error("0件はno_reviewsで報告してください");
 const ids=new Set<string>();for(const r of source.reviews){if(!validReviewUrl(r.url,source.channel)||ids.has(r.externalId))throw new Error("レビューURLまたはID重複が不正です");ids.add(r.externalId);rows.push({channel:source.channel,product_key:source.productKey,external_id:r.externalId,url:r.url,rating:r.rating,title:r.title,body:r.body,posted_at:r.postedAt});}}
 if(seen.size!==targets.length)throw new Error("未報告の収集元があります");
 const complete=data.sources.every(s=>s.status==="complete"||s.status==="no_reviews");const status=complete?"completed":rows.length?"partial":"blocked";
 const result={status,message:data.message,sources:data.sources.map(({reviews,...s})=>({...s,count:reviews.length})),count:rows.length};
 const saved=await db().rpc("save_recipe_review_collection",{p_job:id,p_worker:worker,p_result:result,p_rows:rows,p_analysis:{recipeId:p.recipeId,recipeName:p.recipeName,protocol:"1",model:"gpt-6-astra",reasoningEffort:"medium"}});if(saved.error)throw saved.error;
 const hasSaved=rows.length>0||(await allReviews(p.recipeId)).length>0;
 return NextResponse.json({ok:true,status:complete?"completed":"needs_review",summary:`レビュー${rows.length}件を照合・保存しました。${complete?"":"一部の収集元に未取得があります。"}${hasSaved?"保存済みレビューの分析を予約しました。":"収集元・接続状態を確認してください。"}`});
 }
 if(!p.packet||body.sourceHash!==p.packet.sourceHash)throw new Error("分析元が一致しません");const data=validateAnalysis(body.data,p.packet.reviews as ReviewRow[]);
 const result={...data,evidence:p.packet.reviews,totalCount:p.packet.totalCount,analyzedCount:p.packet.analyzedCount,selection:p.packet.selection};
 const q=await db().from("recipe_review_analyses").upsert({job_id:id,recipe_id:p.recipeId,source_hash:p.packet.sourceHash,review_ids:p.packet.reviews.map((r:ReviewRow)=>r.id),result,model:"gpt-6-astra"},{onConflict:"job_id",ignoreDuplicates:true});if(q.error)throw q.error;
 return NextResponse.json({ok:true,status:"completed",summary:"EC別・全体のレビュー傾向分析を保存しました"});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"レビュー保存失敗"},{status:400});}}
