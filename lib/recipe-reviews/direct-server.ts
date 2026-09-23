import { db, loadRecipe, allReviews, analysisPacket } from "./server";
import { sourceSchema, validateAnalysis, validReviewUrl } from "./model";
import { fingerprint, prepareDirectCollection, type Coverage, directRequestSchema } from "./direct-policy";
import { z } from "zod";

export async function directPacket(jobId: string) {
  z.string().uuid().parse(jobId);
  const q = await db().from("web_sales_codex_jobs").select("id,status,parameters,task_key").eq("id",jobId).single();
  if (q.error || q.data.task_key !== "recipe_reviews_collect" || q.data.parameters.executor === "codex_app") throw new Error("対象の収集ジョブが見つかりません");
  const root = q.data, recipe = await loadRecipe(root.parameters.recipeId);
  const sources = sourceSchema.array().min(1).max(40).parse(root.parameters.sources);
  if(sources.some(s=>!validReviewUrl(s.url,s.channel))) throw new Error("収集元URLが不正です");
  const latest = await db().from("recipe_review_app_imports").select("job_id").eq("root_job_id",jobId).eq("kind","collection").order("created_at",{ascending:false}).limit(1);
  if (latest.error) throw latest.error;
  const c = await db().from("recipe_review_collections").select("job_id,result").eq("job_id",latest.data?.[0]?.job_id ?? jobId).maybeSingle();
  if (c.error) throw c.error;
  const reviews = await allReviews(recipe.id);
  const coverage: Coverage[] = c.data?.result?.sources ?? [];
  const active = await db().from("web_sales_codex_jobs").select("id,status,task_key").eq("parameters->>recipeId",recipe.id).in("task_key",["recipe_reviews_collect","recipe_reviews_analyze"]).in("status",["queued","running"]);
  if (active.error) throw active.error;
  return {root,recipe,sources,collection:c.data,coverage,reviews,active:active.data,sourceHash:fingerprint(root.parameters),analysis:analysisPacket(reviews)};
}

export async function importDirect(input: unknown) {
  const body = directRequestSchema.parse(input), hash = fingerprint(body);
  const replay = await db().from("recipe_review_app_imports").select("job_id,root_job_id,kind,payload_hash").eq("request_id",body.requestId).maybeSingle();
  if (replay.error) throw replay.error;
  if (replay.data) {
    if (replay.data.root_job_id !== body.jobId || replay.data.kind !== body.mode || replay.data.payload_hash !== hash) throw new Error("direct_request_conflict");
    return {ok:true,jobId:replay.data.job_id,reused:true};
  }
  const packet = await directPacket(body.jobId);
  if (packet.active.length) throw new Error("direct_active_job");
  if ((packet.collection?.job_id ?? null) !== body.expectedCollectionId) throw new Error("direct_collection_changed");
  let payload: Record<string,unknown>;
  if (body.mode === "collection") {
    if (body.sourceHash !== packet.sourceHash) throw new Error("direct_target_changed");
    payload = prepareDirectCollection(body.data,packet.sources,packet.coverage);
  } else {
    if (!packet.analysis.reviews.length) throw new Error("分析するレビューがありません");
    if (body.sourceHash !== packet.analysis.sourceHash) throw new Error("direct_reviews_changed");
    if (!body.model) throw new Error("実際に分析したモデルを指定してください");
    const analysis = validateAnalysis(body.data,packet.analysis.reviews);
    payload = {result:{...analysis,evidence:packet.analysis.reviews,totalCount:packet.analysis.totalCount,analyzedCount:packet.analysis.analyzedCount,selection:packet.analysis.selection},
      sourceHash:packet.analysis.sourceHash,reviewIds:packet.analysis.reviews.map(r=>r.id),model:body.model};
  }
  const saved = await db().rpc("save_recipe_review_app_import",{p_root:body.jobId,p_request:body.requestId,p_kind:body.mode,p_expected:body.expectedCollectionId,
    p_parameters:packet.root.parameters,p_payload:payload,p_hash:hash,p_revision:packet.reviews.map(r=>({id:r.id,collected_at:r.collected_at}))});
  if (saved.error) throw saved.error;
  return {ok:true,jobId:saved.data,reused:false};
}

// Batch entries keep the original job ID; only the displayed outcome is superseded.
export async function directOverrides(ids: string[]) {
  const byRoot = new Map<string,string>();
  for (let i=0;i<ids.length;i+=50) {
    for (let offset=0; ;offset+=1000) {
      if (offset>=50000) throw new Error("直接取込履歴の取得上限です");
      const q = await db().from("recipe_review_app_imports").select("root_job_id,job_id").in("root_job_id",ids.slice(i,i+50)).eq("kind","collection").order("created_at",{ascending:false}).order("request_id").range(offset,offset+999);
      if(q.error) throw q.error;
      for(const r of q.data) if(!byRoot.has(r.root_job_id)) byRoot.set(r.root_job_id,r.job_id);
      if(q.data.length<1000) break;
    }
  }
  return byRoot;
}
