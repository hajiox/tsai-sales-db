import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/recipe-reviews/server";
import { directAuthorized } from "@/lib/recipe-reviews/direct-policy";
import { directPacket, directOverrides, importDirect } from "@/lib/recipe-reviews/direct-server";
import { type BatchEntry, type BatchJob } from "@/lib/recipe-reviews/batch-status";
import { batchDetails } from "@/lib/recipe-reviews/batch-details";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
const allowed=(r:Request)=>directAuthorized(r.headers.get("authorization"),process.env.TSA_REVIEW_APP_TOKEN);
function failure(e:unknown) {
  const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "";
  if (/direct_(request_conflict|active_job|collection_changed|reviews_changed|target_changed|collection_required)/.test(message)) return reply({error:message.match(/direct_\w+/)?.[0],action:"対象を再取得し状態を確認してください。自動再送しないでください。"},409);
  if (e instanceof z.ZodError) return reply({error:"入力形式が不正です"},400);
  return reply({error:"対象・入力・保存状態を確認してください"},400);
}
export async function GET(request:Request) {
  if(!allowed(request)) return reply({error:"Unauthorized"},401);
  try {
    const url=new URL(request.url), jobId=url.searchParams.get("jobId");
    if(jobId) {
      const p=await directPacket(jobId);
      return reply({jobId,recipe:p.recipe,sources:p.sources,sourceHash:p.sourceHash,expectedCollectionId:p.collection?.job_id??null,
        coverage:p.coverage,pendingSources:p.sources.filter(s=>!p.coverage.some(c=>c.channel===s.channel&&c.productKey===s.productKey&&["complete","no_reviews"].includes(c.status))),
        existingReviews:p.reviews.map(r=>({id:r.id,channel:r.channel,productKey:r.product_key,externalId:r.external_id})),active:p.active,
        analysis:url.searchParams.get("analysis")==="1"?{...p.analysis,collectionCoverage:p.collection}:undefined});
    }
    const batchId=z.string().uuid().parse(url.searchParams.get("batchId"));
    const q=await db().from("recipe_review_batches").select("id,created_at,entries").eq("id",batchId).single();
    if(q.error) throw q.error;
    const entries=q.data.entries as BatchEntry[], ids=entries.flatMap(e=>e.jobId?[e.jobId]:[]),overrides=await directOverrides(ids),jobs:BatchJob[]=[];
    const effective=ids.map(id=>overrides.get(id)??id);
    for(let i=0;i<effective.length;i+=50) {
      const chunk=effective.slice(i,i+50);
      for(const result of await Promise.all([
        db().from("web_sales_codex_jobs").select("id,status,task_key,idempotency_key,current_step,error_message,parameters").in("id",chunk),
        db().from("web_sales_codex_jobs").select("id,status,task_key,idempotency_key,current_step,error_message,parameters").in("idempotency_key",chunk.map(id=>`reviews-analysis:${id}`)),
      ])) {if(result.error) throw result.error; jobs.push(...result.data);}
    }
    const details=await batchDetails(entries.map(e=>({...e,jobId:e.jobId?(overrides.get(e.jobId)??e.jobId):null})),jobs);
    return reply({batchId,entries:details.map((e,i)=>({...e,jobId:entries[i].jobId,effectiveJobId:e.jobId}))});
  }catch(e){return failure(e);}
}
export async function POST(request:Request) {
  if(!allowed(request)) return reply({error:"Unauthorized"},401);
  // Bound the stream before JSON parsing (Content-Length may be absent or false).
  const reader=request.body?.getReader(); if(!reader)return reply({error:"Empty body"},400);
  const chunks:Uint8Array[]=[];let size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000){await reader.cancel();return reply({error:"Payload too large"},413);}chunks.push(value);}
    return reply(await importDirect(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
  }catch(e){return failure(e);}finally{reader.releaseLock();}
}

