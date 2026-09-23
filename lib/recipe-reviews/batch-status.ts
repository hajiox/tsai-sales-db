export type BatchEntry={recipeId:string;name:string;jobId:string|null;reason:string|null};
export type BatchJob={id:string;status:string;task_key:string;idempotency_key:string;current_step:string|null;error_message:string|null;parameters?:{directAnalysisPending?:boolean}};
export function batchEntryStatus(entry:BatchEntry,jobs:BatchJob[]) {
 if(!entry.jobId)return {...entry,state:"unmapped",message:entry.reason||"商品紐付け未設定"};
 const collect=jobs.find(j=>j.id===entry.jobId);
 const analysis=jobs.find(j=>j.idempotency_key===`reviews-analysis:${entry.jobId}`);
 if(!collect)return {...entry,state:"attention",message:"収集ジョブが見つかりません"};
 if(["queued","running"].includes(collect.status))return {...entry,state:"active",message:collect.status==="queued"?"巡回待ち":collect.current_step||"巡回中"};
 if(analysis&&["queued","running"].includes(analysis.status))return {...entry,state:"active",message:analysis.status==="queued"?"分析待ち":"分析中"};
 if(collect.parameters?.directAnalysisPending)return {...entry,state:"attention",message:"Codexアプリでの分析待ち"};
 if(collect.status!=="completed"||analysis&&analysis.status!=="completed")return {...entry,state:"attention",message:collect.error_message||analysis?.error_message||collect.current_step||"未取得・確認が必要です"};
 return {...entry,state:"completed",message:analysis?"収集・分析完了":"収集完了（分析対象なし）"};
}
