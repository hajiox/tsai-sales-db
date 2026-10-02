import { getWebSalesAutomationServiceClient } from "../web-sales-automation/sync";
import { getFinanceCapabilities } from "./capabilities";
import { financeAcquisitionRoute,salesAcquisitionRoute } from "./provenance";
import { hasPersistedFinanceImport } from "../web-sales-codex/finance-job-state";
type Saved = {route:"api"|"bridge"|"manual"|"unknown";status:string;finished_at:string|null;period_start:string|null;period_end:string|null};
export async function getAcquisitionStatus(month:string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("対象月が正しくありません");
  const db=getWebSalesAutomationServiceClient();const reportMonth=`${month}-01`;
  const [capabilities,runs,sales,profit,jobs,summary,adCosts]=await Promise.all([
    getFinanceCapabilities(),
    db.from("web_sales_acquisition_runs").select("kind,channel,route,status,result,error_message,period_start,period_end,started_at,completed_at").eq("report_month",reportMonth).order("started_at",{ascending:false}).limit(100),
    db.from("web_sales_sync_runs").select("channel,status,metadata,period_start,period_end,completed_at").eq("report_month",reportMonth).eq("status","success").order("completed_at",{ascending:false}).limit(100),
    db.from("ec_profit_monthly").select("channel,coverage_level,source_job_id,raw_summary,period_start,period_end,imported_at").eq("report_month",reportMonth),
    db.from("web_sales_codex_jobs").select("task_key,channel,status,result,period_start,period_end,created_at,started_at,completed_at").eq("report_month",reportMonth).in("task_key",["web_sales_import","ad_cost_import","ec_profit_import"]).order("created_at",{ascending:false}).limit(150),
    db.from("web_sales_summary").select("amazon_count,base_count,amazon_amount,base_amount").eq("report_month",reportMonth),
    db.from("advertising_costs").select("google_cost,meta_cost,amazon_cost,rakuten_cost,yahoo_cost").eq("report_month",reportMonth),
  ]);
  if (runs.error||sales.error||profit.error||jobs.error||summary.error||adCosts.error) throw new Error("取得経路を確認できません");
  const routes=capabilities.map(capability=>{
    const saved:Saved[]=[];
    const apiRuns=(runs.data||[]).filter(r=>r.kind===capability.kind&&r.channel===capability.channel);
    for(const run of apiRuns) if(run.result?.persisted===true) saved.push({route:run.route,status:run.status,finished_at:run.completed_at,period_start:run.period_start,period_end:run.period_end});
    if(capability.kind==="sales") for(const run of sales.data||[]) if(run.channel===capability.channel) saved.push({route:salesAcquisitionRoute(run.metadata),status:run.status,finished_at:run.completed_at,period_start:run.period_start,period_end:run.period_end});
    if(capability.kind==="ec_profit") for(const row of profit.data||[]) if(row.channel===capability.channel) {
      let route=financeAcquisitionRoute(row.raw_summary,row.source_job_id);
      // A verified source file/hash demonstrates a file import; never infer API use from today's settings.
      if(route==="unknown" && row.raw_summary?.source_sha256 && row.raw_summary?.source_files?.length) route="manual";
      saved.push({route,status:row.coverage_level==="complete"?"success":row.coverage_level,finished_at:row.imported_at,period_start:row.period_start,period_end:row.period_end});
    }
    const taskKey=capability.kind==="sales"?"web_sales_import":capability.kind==="ec_profit"?"ec_profit_import":"ad_cost_import";
    const channelJobs=(jobs.data||[]).filter(j=>j.task_key===taskKey&&j.channel===capability.channel);
    if(capability.kind==="advertising") for(const job of channelJobs) if(hasPersistedFinanceImport(job) && Number(job.result?.imported_count||job.result?.importedCount||0)>0) {
      saved.push({route:financeAcquisitionRoute(job.result),status:job.status,finished_at:job.completed_at,period_start:job.period_start,period_end:job.period_end});
    }
    if(!saved.length && capability.kind==="sales" && ["amazon","base"].includes(capability.channel) && (summary.data||[]).some(r=>Number((r as Record<string,unknown>)[`${capability.channel}_count`])>0 && (r as Record<string,unknown>)[`${capability.channel}_amount`]!=null)) {
      saved.push({route:"unknown",status:"success",finished_at:null,period_start:reportMonth,period_end:null});
    }
    if(!saved.length && capability.kind==="advertising" && (adCosts.data||[]).some(r=>Number((r as Record<string,unknown>)[`${capability.channel}_cost`])>0)) {
      saved.push({route:"unknown",status:"success",finished_at:null,period_start:reportMonth,period_end:null});
    }
    saved.sort((a,b)=>(b.finished_at||"").localeCompare(a.finished_at||""));
    const lastApi=apiRuns[0],lastBridge=[...channelJobs].sort((a,b)=>(b.started_at||b.created_at).localeCompare(a.started_at||a.created_at))[0];
    const bridgeAttemptedAt=lastBridge?.started_at||lastBridge?.created_at;
    const lastAttempt=lastApi && (!lastBridge || lastApi.started_at>=bridgeAttemptedAt!)
      ? {route:lastApi.route,status:lastApi.status,message:lastApi.error_message||undefined,attempted_at:lastApi.started_at}
      : lastBridge ? {route:financeAcquisitionRoute(lastBridge.result)==="unknown" && ["queued","running","waiting_for_user"].includes(lastBridge.status)?"bridge":financeAcquisitionRoute(lastBridge.result),status:lastBridge.status,attempted_at:bridgeAttemptedAt} : null;
    return {...capability,latest:saved[0]||null,last_attempt:lastAttempt};
  });
  return {routes,reportMonth:month};
}
