import { getWebSalesAutomationServiceClient, runChannelSync } from "../web-sales-automation/sync";
import { validatePeriod } from "../web-sales-automation/date";
import type { SyncPeriod, WebSalesChannel } from "../web-sales-automation/types";
import { enqueueCodexJobs } from "../web-sales-codex/server";
import type { CodexChannel, CodexJobTrigger } from "../web-sales-codex/types";
import { getFinanceCapabilities, type AcquisitionKind } from "./capabilities";
import { runOfficialFinanceAcquisition } from "./run";
import { safeAcquisitionError } from "./provenance";
import { hasPersistedFinanceImport,selectEffectiveFinanceJob } from "../web-sales-codex/finance-job-state";

export const TASK_KIND = { web_sales_import: "sales", ad_cost_import: "advertising", ec_profit_import: "ec_profit" } as const;
const KIND_TASK = { sales: "web_sales_import", advertising: "ad_cost_import", ec_profit: "ec_profit_import" } as const;
export type DispatchResult = { channel: string; route: "api" | "bridge" | "none"; status: string; message: string; runId?: string };
type EnqueueInput = { kind: AcquisitionKind; channels: string[]; period: SyncPeriod; allowBridge?: boolean;
  triggerType?: Exclude<CodexJobTrigger,"test">; requestedBy?: string; idempotencyPrefix?: string; incompleteOnly?: boolean };

export async function enqueueFinanceAcquisitions(input: EnqueueInput) {
  const period = validatePeriod(input.period.startDate,input.period.endDate);
  const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0,10);
  if (period.endDate > todayJst) throw new Error("未来の期間は取得できません。終了日を本日以前にしてください");
  const capabilities = await getFinanceCapabilities();
  const supabase = getWebSalesAutomationServiceClient();
  const jobs: unknown[] = []; const results: DispatchResult[] = [];
  for (const channel of [...new Set(input.channels)]) {
    const capability = capabilities.find(row => row.kind === input.kind && row.channel === channel);
    if (!capability || capability.preferred_route === "none") {
      results.push({channel,route:"none",status:"skipped",message:"新規取得の対象外です"}); continue;
    }
    if (input.incompleteOnly) {
      if (input.kind === "sales") {
        const persistedSales=await supabase.from("web_sales_sync_runs").select("id")
          .eq("channel",channel).eq("period_start",period.startDate).eq("period_end",period.endDate)
          .eq("status","success").not("completed_at","is",null).limit(1).maybeSingle();
        if (persistedSales.error) throw new Error("保存済み売上を確認できません");
        if (persistedSales.data) {
          results.push({channel,route:"none",status:"skipped",message:"同じ期間の保存済み売上を保持しました"});continue;
        }
      }
      const saved=await supabase.from("web_sales_codex_jobs").select("task_key,status,result,created_at").eq("task_key",KIND_TASK[input.kind])
        .eq("channel",channel).eq("period_start",period.startDate).eq("period_end",period.endDate).order("created_at",{ascending:false});
      if (saved.error) throw new Error("保存済み結果を確認できません");
      const effective=selectEffectiveFinanceJob(saved.data || []);
      const salesAlreadyCompleted=input.kind === "sales" && (saved.data || []).some(job=>job.status === "completed");
      if (salesAlreadyCompleted || effective && hasPersistedFinanceImport(effective)) {
        results.push({channel,route:"bridge",status:"skipped",message:"同じ期間の保存済み結果を保持しました"});continue;
      }
    }
    // Login/permission waits are not terminal. Never silently swap them to another route.
    const {data: active,error: activeError} = await supabase.from("web_sales_codex_jobs").select("id,status")
      .eq("task_key",KIND_TASK[input.kind]).eq("channel",channel).lte("period_start",period.endDate).gte("period_end",period.startDate)
      .in("status",["queued","running","waiting_for_user"]).limit(1).maybeSingle();
    if (activeError) throw new Error("既存処理の状態を確認できません");
    if (active) { results.push({channel,route:"bridge",status:active.status,message:"既存処理を保持しました。重複実行しません"}); continue; }
    if (!capability.api_ready) {
      if (input.allowBridge) {
        const queued = await enqueueCodexJobs({taskKey:KIND_TASK[input.kind],channels:[channel as CodexChannel],startDate:period.startDate,endDate:period.endDate,
          triggerType:input.triggerType || "manual",requestedBy:input.requestedBy,idempotencyPrefix:input.idempotencyPrefix});
        jobs.push(...queued); results.push({channel,route:"bridge",status:queued.length ? "queued" : "skipped",message:"公式ファイル取得をBridge待機に登録しました"});
      } else results.push({channel,route:"none",status:"waiting_for_user",message:capability.reason});
      continue;
    }
    const key = `official-api:${input.kind}:${channel}:${period.startDate}:${period.endDate}`;
    const {data: previous,error: readError} = await supabase.from("web_sales_acquisition_runs").select("id,status,result").eq("idempotency_key",key).maybeSingle();
    if (readError) throw new Error("API取得履歴を確認できません");
    if (previous && (["queued","running"].includes(previous.status) || previous.status === "waiting_for_user" && input.triggerType && input.triggerType!=="manual" || previous.status === "completed" && previous.result?.persisted === true)) {
      results.push({channel,route:"api",status:previous.status,message:previous.status === "completed" ? "同じ期間のAPI保存は完了しています" : "既存API処理を保持しました",runId:previous.id}); continue;
    }
    const now = new Date().toISOString();
    const row = {kind:input.kind,channel,route:"api",period_start:period.startDate,period_end:period.endDate,report_month:period.reportMonth,
      idempotency_key:key,status:"queued",result:{persisted:false,requested_by:input.requestedBy || "manual",previous_status:previous?.status || null,
        reportId:previous?.result?.reportId || undefined},error_message:null,started_at:now,completed_at:null};
    const query = previous ? supabase.from("web_sales_acquisition_runs").update(row).eq("id",previous.id).eq("status",previous.status)
      : supabase.from("web_sales_acquisition_runs").insert(row);
    const {data,error} = await query.select("id").maybeSingle();
    if (error) {
      if (error.code === "23505" || error.message?.includes("finance_acquisition_already_active")) {
        results.push({channel,route:"api",status:"queued",message:"既存の取得処理を保持しました"}); continue;
      }
      throw new Error("API取得待機を登録できません");
    }
    results.push({channel,route:"api",status:"queued",message:"このPCのAPI取得処理に登録しました。AIの利用枠を使いません",runId:data?.id});
  }
  return {ok:true,jobs,results,summary:{total:results.length,queued:results.filter(r=>r.status==="queued").length}};
}

/** Called only by the deterministic local API worker, not a public HTTP request. */
export async function executeAcquisitionRun(id: string) {
  const supabase = getWebSalesAutomationServiceClient();
  const {data: row,error} = await supabase.from("web_sales_acquisition_runs").select("*").eq("id",id).single();
  if (error || !row) throw new Error("API取得待機が見つかりません");
  if (row.status !== "queued") return {id,status:row.status,persisted:row.result?.persisted===true};
  const {data: claimed,error: claimError} = await supabase.from("web_sales_acquisition_runs")
    .update({status:"running",started_at:new Date().toISOString()}).eq("id",id).eq("status","queued").select("id").maybeSingle();
  if (claimError) throw new Error("API取得の実行権を確保できません");
  if (!claimed) return {id,status:"skipped",persisted:false};
  let status="failed"; let result: Record<string,unknown>={persisted:false}; let message: string|null=null;
  try {
    const capability=(await getFinanceCapabilities()).find(c=>c.kind===row.kind && c.channel===row.channel);
    if (!capability?.api_ready) { status="waiting_for_user";message="API接続情報が不足しています"; }
    else if (row.kind === "sales") {
      const outcome=await runChannelSync(row.channel as WebSalesChannel,{startDate:row.period_start,endDate:row.period_end,reportMonth:row.report_month},"manual");
      const operatorWait=["authentication_required","permission_required","account_verification","account_verification_required","required_credentials"].includes(outcome.errorCode || "");
      status=operatorWait ? "waiting_for_user" : outcome.status === "success" ? "completed" : outcome.status;
      message=outcome.error ? safeAcquisitionError(new Error(outcome.error)) : null;
      result={persisted:outcome.status==="success",salesRunId:outcome.runId,itemCount:outcome.itemCount,quantityTotal:outcome.quantityTotal,unmatchedCount:outcome.unmatchedCount,errorCode:outcome.errorCode};
    } else {
      const outcome=await runOfficialFinanceAcquisition(row.kind,row.channel,{startDate:row.period_start,endDate:row.period_end,reportMonth:row.report_month.slice(0,7)},
        {supabase,resumeReportId:typeof row.result?.reportId==="string"?row.result.reportId:undefined});
      const persisted=outcome.status==="success" && !outcome.preservedExisting;
      status=outcome.status==="success" ? "completed" : outcome.status;
      message=outcome.details.slice(0,600);
      result={persisted,coverageLevel:outcome.coverageLevel,importedCount:outcome.importedCount,source:outcome.source,totalCost:outcome.totalCost,
        unmatchedCount:outcome.unmatchedCount,preservedExisting:outcome.preservedExisting,reportId:outcome.reportId,warnings:outcome.warnings.slice(0,10)};
    }
  } catch (caught) {
    message=safeAcquisitionError(caught);
    const code = caught && typeof caught === "object" && "code" in caught ? String(caught.code) : "";
    status=/authentication_required|permission_required|account_verification|required_credentials/.test(code) ? "waiting_for_user"
      : /review|mismatch|mapping|incomplete|report_pending/.test(code) || /再認証|認証|権限/.test(message) ? "needs_review" : "failed";
  }
  const {error: saveError}=await supabase.from("web_sales_acquisition_runs").update({status,result,error_message:status==="completed"?null:message,
    completed_at:new Date().toISOString()}).eq("id",id).eq("status","running");
  if (saveError) throw new Error("API取得の最終状態を保存できません。元データの保存状況を確認してください");
  return {id,status,...result,message};
}
