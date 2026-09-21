import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { z } from "zod";
import { db, loadRecipe, loadSources, allReviews, enqueueReview, REVIEW_TASKS } from "@/lib/recipe-reviews/server";
import { sourceSchema, validReviewUrl, reviewStats, REVIEW_CHANNELS } from "@/lib/recipe-reviews/model";
export const runtime="nodejs"; export const dynamic="force-dynamic";
async function admin(){return (await getServerSession(authOptions))?.user?.email?.toLowerCase()==="aizubrandhall@gmail.com";}
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){if(!await admin())return NextResponse.json({error:"Unauthorized"},{status:401});try{
 const {id}=await params;z.string().uuid().parse(id);const recipe=await loadRecipe(id);const rows=await allReviews(id);const url=new URL(request.url);const channel=url.searchParams.get("channel")||"all";
 if(channel!=="all"&&!(channel in REVIEW_CHANNELS))throw new Error("ECが不正です");const filtered=rows.filter(r=>channel==="all"||r.channel===channel);const page=Math.max(0,Math.min(1000,Number(url.searchParams.get("page"))||0));
 const [sources,collections,analyses,jobs]=await Promise.all([loadSources(recipe),db().from("recipe_review_collections").select("job_id,result,created_at").eq("recipe_id",id).order("created_at",{ascending:false}).limit(1),db().from("recipe_review_analyses").select("job_id,result,created_at,review_ids,source_hash").eq("recipe_id",id).order("created_at",{ascending:false}).limit(1),db().from("web_sales_codex_jobs").select("id,task_key,status,progress,current_step,error_message,created_at").in("task_key",REVIEW_TASKS).eq("parameters->>recipeId",id).order("created_at",{ascending:false}).limit(5)]);
 for(const q of [collections,analyses,jobs])if(q.error)throw q.error;
 return NextResponse.json({sources,stats:reviewStats(filtered),byChannel:Object.fromEntries(Object.keys(REVIEW_CHANNELS).map(c=>[c,reviewStats(rows.filter(r=>r.channel===c))])),reviews:filtered.slice(page*30,(page+1)*30),page,total:filtered.length,collection:collections.data?.[0]??null,analysis:analyses.data?.[0]?{...analyses.data[0],stale:rows.some(r=>r.collected_at>analyses.data![0].created_at)}:null,jobs:jobs.data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"レビュー取得失敗"},{status:400});}}
export async function POST(request:Request,{params}:Context){if(!await admin())return NextResponse.json({error:"Unauthorized"},{status:401});try{const{id}=await params;z.string().uuid().parse(id);const body=await request.json();
 if(body.mode==="source") {await loadRecipe(id);const source=sourceSchema.parse(body.source);if(!validReviewUrl(source.url,source.channel))throw new Error("対象ECのHTTPS URLを指定してください");const q=await db().from("recipe_review_sources").upsert({recipe_id:id,channel:source.channel,product_key:source.productKey,name:source.name,url:source.url,updated_at:new Date().toISOString()},{onConflict:"recipe_id,channel,product_key"});if(q.error)throw q.error;return NextResponse.json({ok:true});}
 const mode=z.enum(["collect","analyze"]).parse(body.mode);return NextResponse.json(await enqueueReview(id,mode,"aizubrandhall@gmail.com"));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"レビュー操作失敗"},{status:400});}}
