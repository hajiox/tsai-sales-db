import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { REVIEW_CHANNELS, type ReviewSource, type ReviewRow } from "./model";
export const db = getWebSalesAutomationServiceClient;
export const REVIEW_TASKS = ["recipe_reviews_collect", "recipe_reviews_analyze"];
export async function loadRecipe(id:string) {
 const {data,error}=await db().from("recipes").select("id,name,category,linked_product_id,jan_code").eq("id",id).single();
 if(error || !data) throw new Error("レシピが見つかりません");
 if(data.category!=="ネット専用") throw new Error("レビューはネット専用レシピのみ利用できます"); return data;
}
export async function loadSources(recipe:Awaited<ReturnType<typeof loadRecipe>>) {
 const saved=await db().from("recipe_review_sources").select("channel,product_key,name,url").eq("recipe_id",recipe.id);
 if(saved.error) throw saved.error;
 const result:ReviewSource[]=(saved.data??[]).map(r=>({channel:r.channel,productKey:r.product_key,name:r.name,url:r.url}));
 if(recipe.linked_product_id) {
 const mappings=await db().from("web_sales_external_mappings").select("channel,external_product_key,external_product_name").eq("product_id",recipe.linked_product_id).in("channel",Object.keys(REVIEW_CHANNELS)).limit(100);
 if(mappings.error) throw mappings.error;
 for(const m of mappings.data??[]) {if(result.some(r=>r.channel===m.channel&&r.productKey===m.external_product_key))continue;
 const url = m.channel==="amazon" ? `https://www.amazon.co.jp/product-reviews/${encodeURIComponent(m.external_product_key)}` : m.channel==="rakuten" ? "https://review.rakuten.co.jp/" : m.channel==="yahoo" ? "https://shopping.yahoo.co.jp/" : "https://admin.thebase.in/";
 result.push({channel:m.channel,productKey:m.external_product_key,name:m.external_product_name||recipe.name,url}); }
 } return result;
}
export async function allReviews(id:string) { const rows:ReviewRow[]=[]; for(let offset=0;offset<50000;offset+=1000){const q=await db().from("recipe_reviews").select("id,channel,product_key,external_id,url,rating,title,body,posted_at,collected_at").eq("recipe_id",id).order("posted_at",{ascending:false,nullsFirst:false}).order("id").range(offset,offset+999);if(q.error)throw q.error;rows.push(...q.data);if(q.data.length<1000)return rows;}throw new Error("レビュー件数の上限に達しました。取得範囲を見直してください"); }
export function analysisPacket(rows:ReviewRow[]) { const selected=Object.keys(REVIEW_CHANNELS).flatMap(channel=>rows.filter(r=>r.channel===channel).slice(0,50).map(r=>({...r,title:r.title.slice(0,300),body:r.body.slice(0,800)})));
 const packet={reviews:selected,totalCount:rows.length,analyzedCount:selected.length,selection:"ECごとに投稿日が新しい順で最大50件、見出し300字・本文800字までを分析。日付不明は後。未取得分・省略部分は分析対象外。全件の傾向とは区別する。"};return {...packet,sourceHash:createHash("sha256").update(JSON.stringify(packet)).digest("hex")}; }
export async function enqueueReview(recipeId:string,mode:"collect"|"analyze",requestedBy:string) {
 const recipe=await loadRecipe(recipeId);const sources=await loadSources(recipe);
 const task="recipe_reviews_"+mode;
 const active=await db().from("web_sales_codex_jobs").select("id,status").in("task_key",REVIEW_TASKS).eq("parameters->>recipeId",recipeId).in("status",["queued","running"]).limit(1);if(active.error)throw active.error;
 if(active.data?.length)return {job:active.data[0],reused:true};
 if(mode==="collect"&&!sources.length)throw new Error("ECの商品紐付けがありません。収集元の商品番号とURLを登録してください");
 if(mode==="analyze"&&!(await allReviews(recipeId)).length)throw new Error("先にレビューを収集してください");
 if(sources.length>40)throw new Error("収集元が40件を超えています");
 const {data,error}=await db().from("web_sales_codex_jobs").insert({task_key:task,status:"queued",requested_by:requestedBy,trigger_type:"manual",max_attempts:1,idempotency_key:"reviews:"+randomUUID(),parameters:{recipeId,recipeName:recipe.name,janCode:recipe.jan_code,sources,protocol:"1",model:"gpt-6-astra",reasoningEffort:"medium"}}).select("id,status").single();
 if(error){if(error.code==="23505")return {reused:true};throw error;}return {job:data};
}
