import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { db, loadSources } from "@/lib/recipe-reviews/server";
import { sourceSchema } from "@/lib/recipe-reviews/model";
import { batchEntryStatus, type BatchEntry, type BatchJob } from "@/lib/recipe-reviews/batch-status";
import { directOverrides } from "@/lib/recipe-reviews/direct-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const admin=async()=> (await getServerSession(authOptions))?.user?.email?.toLowerCase()==="aizubrandhall@gmail.com";
export async function GET(){
 if(!await admin())return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const q=await db().from("recipe_review_batches").select("id,created_at,entries").order("created_at",{ascending:false}).limit(1);if(q.error)throw q.error;
  const batch=q.data?.[0];if(!batch)return NextResponse.json({batch:null});
  const original=batch.entries as BatchEntry[],overrides=await directOverrides(original.flatMap(e=>e.jobId?[e.jobId]:[]));
  const entries=original.map(e=>({...e,jobId:e.jobId?(overrides.get(e.jobId)??e.jobId):null})),ids=entries.flatMap(e=>e.jobId?[e.jobId]:[]);const jobs:BatchJob[]=[];
  for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50);const results=await Promise.all([
   db().from("web_sales_codex_jobs").select("id,status,task_key,idempotency_key,current_step,error_message,parameters").in("id",chunk),
   db().from("web_sales_codex_jobs").select("id,status,task_key,idempotency_key,current_step,error_message").in("idempotency_key",chunk.map(id=>`reviews-analysis:${id}`))
  ]);for(const r of results){if(r.error)throw r.error;jobs.push(...r.data);}}
  return NextResponse.json({batch:{...batch,entries:entries.map(e=>batchEntryStatus(e,jobs))}});
 }catch(e){console.error("Review batch read failed",e instanceof Error?e.message:"database error");return NextResponse.json({error:"一括巡回の状況を取得できませんでした"},{status:500});}
}
export async function POST(){
 if(!await admin())return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const q=await db().from("recipes").select("id,name,category,linked_product_id,jan_code").eq("category","ネット専用").order("id").limit(1001);if(q.error)throw q.error;
  if(q.data.length>1000)throw new Error("対象商品数の上限を超えています");
  const targets=[];
  for(let i=0;i<q.data.length;i+=6){targets.push(...await Promise.all(q.data.slice(i,i+6).map(async recipe=>{
   const parsed=sourceSchema.array().safeParse(await loadSources(recipe));
   if(!parsed.success)return {recipeId:recipe.id,sources:[],reason:"収集元の商品番号・URLを確認してください"};
   const sources=parsed.data;
   return {recipeId:recipe.id,sources,reason:sources.length===0?"ECの商品紐付けが未設定です":sources.length>40?"収集元が40件を超えています":null};
  })));}
  const queued=await db().rpc("enqueue_recipe_review_batch",{p_requested_by:"aizubrandhall@gmail.com",p_targets:targets});if(queued.error)throw queued.error;
  return NextResponse.json({id:queued.data});
 }catch(e){console.error("Review batch enqueue failed",e instanceof Error?e.message:"database error");return NextResponse.json({error:"一括巡回を登録できませんでした。状況を更新してから再実行してください"},{status:500});}
}
