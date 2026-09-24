export type BatchEntry={recipeId:string;name:string;jobId:string|null;reason:string|null};
export type BatchJob={id:string;status:string;task_key:string;idempotency_key:string;current_step:string|null;error_message:string|null;parameters?:{directAnalysisPending?:boolean}};
export function batchEntryStatus(entry:BatchEntry,jobs:BatchJob[]) {
 if(!entry.jobId)return {...entry,state:"unmapped",message:entry.reason||"商品紐付け未設定"};
 const collect=jobs.find(j=>j.id===entry.jobId);
 const analysis=jobs.find(j=>j.idempotency_key===`reviews-analysis:${entry.jobId}`);
 if(!collect)return {...entry,state:"attention",message:"収集ジョブが見つかりません"};
 if(["queued","running"].includes(collect.status))return {...entry,state:"active",message:collect.status==="queued"?"巡回待ち":collect.current_step||"巡回中"};
 if(analysis&&["queued","running"].includes(analysis.status))return {...entry,state:"active",message:analysis.status==="queued"?"分析待ち":"分析中"};
 if(collect.status==="waiting_for_user"||analysis?.status==="waiting_for_user")return {...entry,state:"attention",message:collect.error_message||analysis?.error_message||collect.current_step||"ログイン・許可などの操作待ち"};
 if(collect.parameters?.directAnalysisPending)return {...entry,state:"attention",message:"Codexアプリでの分析待ち"};
 if(collect.status!=="completed"||analysis&&analysis.status!=="completed")return {...entry,state:"attention",message:collect.error_message||analysis?.error_message||collect.current_step||"未取得・確認が必要です"};
 return {...entry,state:"completed",message:analysis?"収集・分析完了":"収集完了（分析対象なし）"};
}
export const batchCategoryLabels={completed:"完了",active:"処理中・待機",analysis_pending:"分析更新待ち",unmapped:"商品紐付け未設定",excluded:"対象外（終売など）",user_wait:"操作・再開待ち",attention:"取得結果の確認"} as const;
export type BatchCategory=keyof typeof batchCategoryLabels;
export type BatchSource={channel:string;productKey:string;status:string;message:string;count:number};
export type BatchCollection={job_id:string;result:{sources?:BatchSource[]}|null};
export type BatchProgress=ReturnType<typeof batchEntryStatus>&{category:BatchCategory;sources:BatchSource[];analysisPending:boolean};
// Keep lifecycle state separate from the operator-facing grouping. A source warning
// must stay visible even when the product's primary next step is analysis.
export function batchEntryDetails(entry:BatchEntry,jobs:BatchJob[],collections:BatchCollection[],category?:string):BatchProgress {
 const progress=batchEntryStatus(entry,jobs),collect=jobs.find(j=>j.id===entry.jobId);
 const analysis=jobs.find(j=>j.idempotency_key===`reviews-analysis:${entry.jobId}`);
 const sources=collections.find(c=>c.job_id===entry.jobId)?.result?.sources??[];
 const analysisPending=!!collect?.parameters?.directAnalysisPending;
 let group:BatchCategory=progress.state==="completed"?"completed":progress.state==="active"?"active":progress.state==="unmapped"?"unmapped":"attention";
 if(progress.state!=="active") {
  if(category!==undefined&&category!=="ネット専用")group="excluded";
  else if(collect?.status==="waiting_for_user"||analysis?.status==="waiting_for_user")group="user_wait";
  else if(analysisPending)group="analysis_pending";
 }
 return {...progress,category:group,sources,analysisPending};
}
