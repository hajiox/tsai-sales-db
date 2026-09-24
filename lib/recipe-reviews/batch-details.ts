import { db } from "./server";
import { batchEntryDetails, type BatchEntry, type BatchJob, type BatchCollection } from "./batch-status";
export async function batchDetails(entries:BatchEntry[],jobs:BatchJob[]) {
 const collections:BatchCollection[]=[], categories=new Map<string,string>();
 for(let i=0;i<entries.length;i+=50){
  const chunk=entries.slice(i,i+50),ids=chunk.flatMap(e=>e.jobId?[e.jobId]:[]);
  const [c,r]=await Promise.all([
   ids.length?db().from("recipe_review_collections").select("job_id,result").in("job_id",ids):Promise.resolve({data:[],error:null}),
   db().from("recipes").select("id,category").in("id",chunk.map(e=>e.recipeId))
  ]);
  if(c.error)throw c.error;if(r.error)throw r.error;
  collections.push(...c.data??[]);for(const recipe of r.data??[])categories.set(recipe.id,recipe.category);
 }
 return entries.map(e=>batchEntryDetails(e,jobs,collections,categories.get(e.recipeId)));
}
