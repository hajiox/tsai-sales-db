import { getWebSalesAutomationServiceClient } from "../web-sales-automation/sync";
import { shouldPreserveExistingEcProfit } from "../ec-profit-import-policy";
import { fetchAmazonFinance } from "./amazon";
import { fetchBaseFinance } from "./base";
import { fetchAmazonAdvertising, fetchMetaAdvertising } from "./advertising";
import { assertFullMonth, money, record, sameCostTotals } from "./policy";
import type { AcquisitionOptions, AcquisitionResult, AdRow, FinanceFetchResult, SyncPeriod } from "./types";

export type { AcquisitionOptions, AcquisitionResult } from "./types";

export async function runOfficialFinanceAcquisition(
  kind: "ec_profit" | "advertising", channel: string, period: SyncPeriod, options: AcquisitionOptions = {},
): Promise<AcquisitionResult> {
  assertFullMonth(period);
  if (kind === "ec_profit" && (channel === "amazon" || channel === "base")) {
    const fetched = channel === "amazon" ? await fetchAmazonFinance(period) : await fetchBaseFinance(period);
    return importEcProfit(fetched, options);
  }
  if (kind === "advertising" && (channel === "amazon" || channel === "meta")) {
    return importAdvertising(channel, period, options);
  }
  if (kind === "advertising" && channel === "google") {
    const { runGoogleAdvertisingAcquisition } = await import("./google");
    return runGoogleAdvertisingAcquisition(period, options);
  }
  return { status: "skipped", coverageLevel: "partial", importedCount: 0, source: "Bridge/manual",
    details: "この媒体・種別の公式API取得は未提供または契約未確認です。既存の原本取得を使用します。", warnings: [] };
}

async function importEcProfit(fetched: FinanceFetchResult, options: AcquisitionOptions): Promise<AcquisitionResult> {
  const data = fetched.data;
  const source = data.channel === "amazon" ? "Amazon SP-API Reports/Finances" : "BASE API orders/savings";
  const baseResult: AcquisitionResult = { status: data.coverage_level === "complete" ? "success" : "needs_review", coverageLevel: data.coverage_level,
    importedCount: 0, source, details: data.notes, warnings: fetched.warnings, metadata: fetched.metadata };
  if (options.dryRun) return { ...baseResult, details: `取得・検証のみ。${data.notes}`, metadata: { ...fetched.metadata, totals: data } };
  const supabase = options.supabase || getWebSalesAutomationServiceClient();
  const month = `${data.report_month}-01`;
  const { data: existing, error: readError } = await supabase.from("ec_profit_monthly")
    .select("coverage_level,source_job_id,raw_summary,gross_sales,refunds,platform_fees,payment_fees,seller_discounts,seller_coupons,seller_points,shipping_costs,other_costs,other_credits")
    .eq("channel", data.channel).eq("report_month", month).maybeSingle();
  if (readError) throw new Error("既存EC精算を確認できません。");
  const existingCoverage = existing?.coverage_level;
  const hasOfficialSource = Boolean(existing?.source_job_id || record(existing?.raw_summary).acquisition_source);
  if (existing && (existingCoverage === "complete" || shouldPreserveExistingEcProfit(existingCoverage, data.coverage_level, { existingHasOfficialSource: hasOfficialSource }))) {
    return { ...baseResult, status: "needs_review", preservedExisting: true,
      details: "API取得結果は照合用です。既存の確定精算またはより確度が高い原本を保持しました。",
      metadata: { ...fetched.metadata, candidateTotals: data } };
  }
  const { data: saved, error: writeError } = await supabase.rpc("apply_official_ec_profit_acquisition", { p_data: { ...data, report_month: month,
    source_job_id: null, raw_summary: { ...data, acquisition_source: "official_api", acquisition_source_name: source, ...fetched.metadata },
  }, p_expected_existing: existing || null });
  if (writeError) throw new Error("公式APIのEC精算を保存できません。");
  if (record(saved).preservedExisting) return { ...baseResult, preservedExisting: true, details: "並行処理で確定精算が保存されたため、既存原本を保持しました。" };
  return { ...baseResult, importedCount: Number(record(saved).importedCount || 0) };
}

async function importAdvertising(channel: "amazon" | "meta", period: SyncPeriod, options: AcquisitionOptions): Promise<AcquisitionResult> {
  const fetched = channel === "amazon" ? await fetchAmazonAdvertising(period, options.resumeReportId) : await fetchMetaAdvertising(period);
  const initial: AcquisitionResult = { status: "needs_review", coverageLevel: "partial", importedCount: 0,
    source: fetched.source, details: fetched.warnings.join(" "), warnings: fetched.warnings, reportId: fetched.reportId };
  if (fetched.pending) return initial;
  const table = channel === "amazon" ? "amazon_ads_performance" : "meta_ads_performance";
  const costColumn = channel === "amazon" ? "cost" : "amount_spent";
  const monthlyColumn = channel === "amazon" ? "amazon_cost" : "meta_cost";
  const keyColumns = channel === "amazon" ? ["campaign_name", "ad_group_name", "asin", "sku"] : ["campaign_name", "ad_set_name"];
  const supabase = options.supabase || getWebSalesAutomationServiceClient();
  const { data: existingRows, error: existingError } = await supabase.from(table).select("*").eq("report_month", period.reportMonth);
  if (existingError) throw new Error("既存広告実績を確認できません。");
  const existing = (existingRows || []) as Record<string, unknown>[];
  if (existing.length && !sameCostTotals(existing, fetched.rows, costColumn, keyColumns)) {
    return { ...initial, coverageLevel: "needs_review", preservedExisting: true,
      details: "公式APIと既存広告原本の広告別金額が一致しないため、既存実績・月次費用を保持しました。", metadata: { fetchedRows: fetched.rows.length } };
  }
  const mapTable = channel === "amazon" ? "amazon_code_series_map" : "meta_adset_series_map";
  const mapKey = channel === "amazon" ? "asin" : "ad_set_name";
  const { data: mappingRows, error: mappingError } = await supabase.from(mapTable).select(`${mapKey},series_code`);
  if (mappingError) throw new Error("保存済み広告商品マッピングを取得できません。");
  const learned = new Map<string, number>();
  for (const mapping of mappingRows || []) {
    const row = mapping as unknown as Record<string, unknown>;
    const code = Number(row.series_code);
    if (code > 0) learned.set(String(row[mapKey]), code);
  }
  const oldMappings = new Map<string, number>();
  for (const row of existing) {
    if (Number(row.series_code) > 0) oldMappings.set(JSON.stringify(keyColumns.map((key) => String(row[key] || ""))), Number(row.series_code));
  }
  const rows: AdRow[] = fetched.rows.map((row) => ({ ...row,
    series_code: oldMappings.get(JSON.stringify(keyColumns.map((key) => String(row[key] || "")))) || learned.get(String(row[mapKey])) || null }));
  const unmatched = rows.filter((row) => Number(row[costColumn]) > 0 && !row.series_code).length;
  const costs = new Map<number, number>();
  for (const row of rows) if (row.series_code && Number(row[costColumn]) > 0) costs.set(row.series_code, (costs.get(row.series_code) || 0) + Math.round(Number(row[costColumn])));
  const totalCost = [...costs.values()].reduce((sum, value) => sum + value, 0);
  if (options.dryRun) return { ...initial, status: unmatched ? "needs_review" : "success", coverageLevel: unmatched ? "needs_review" : "complete",
    totalCost, unmatchedCount: unmatched, details: `取得・検証のみ。${rows.length}件、未紐付け${unmatched}件。` };
  const { data: monthlyRows, error: monthlyError } = await supabase.from("advertising_costs")
    .select(`series_code,${monthlyColumn}`).eq("report_month", `${period.reportMonth}-01`);
  if (monthlyError) throw new Error("既存月次広告費を確認できません。");
  const monthly = (monthlyRows || []) as unknown as Record<string, unknown>[];
  // Existing monthly costs may have no performance rows (legacy manual import).
  // Require per-series reconciliation before every update, not only total spend.
  const oldPositive = monthly.filter((row) => Number(row[monthlyColumn]) > 0);
  const reconciled = oldPositive.every((row) => Math.abs(money(row[monthlyColumn]) - (costs.get(Number(row.series_code)) || 0)) <= 1)
    && [...costs].every(([code, value]) => {
      const old = monthly.find((row) => Number(row.series_code) === code);
      return !old || Number(old[monthlyColumn]) === 0 || Math.abs(Number(old[monthlyColumn]) - value) <= 1;
    });
  if (!reconciled && oldPositive.length) return { ...initial, coverageLevel: "needs_review", preservedExisting: true,
    totalCost, unmatchedCount: unmatched, details: "公式APIと保存済みの商品別月次広告費が一致しないため、既存費用を保持しました。" };
  const snapshotKeys = ["id", ...keyColumns, costColumn, "series_code"];
  const performanceSnapshot = existing.map((row) => Object.fromEntries(snapshotKeys.map((key) => [key, row[key] ?? null])));
  const { data: applied, error: applyError } = await supabase.rpc("apply_official_ad_api_acquisition", {
    p_channel: channel, p_report_month: `${period.reportMonth}-01`, p_performance_rows: rows,
    p_cost_rows: [...costs].map(([series_code, cost]) => ({ series_code, cost })),
    p_expected_performance_rows: performanceSnapshot,
    p_expected_cost_rows: monthly.map((row) => ({ series_code: row.series_code, cost: row[monthlyColumn] ?? null })),
    p_apply_costs: unmatched === 0,
  });
  if (applyError) throw new Error("公式広告費の一括保存・原本照合に失敗しました。データは更新していません。");
  initial.importedCount = Number(record(applied).insertedCount || 0);
  if (unmatched) return { ...initial, coverageLevel: "needs_review", totalCost, unmatchedCount: unmatched,
    details: `${unmatched}件の広告が未紐付けです。保存済みマッピングまたは広告管理画面で商品を確認してください。` };
  const { data: savedRows, error: savedError } = await supabase.from("advertising_costs").select(`series_code,${monthlyColumn}`).eq("report_month", `${period.reportMonth}-01`);
  const saved = (savedRows || []) as unknown as Record<string, unknown>[];
  if (savedError || [...costs].some(([code, cost]) => Number(saved.find((row) => Number(row.series_code) === code)?.[monthlyColumn]) !== cost)) {
    throw new Error("商品別広告費の保存結果を確認できません。取得履歴と保存済み費用を確認してください。");
  }
  return { ...initial, status: "success", coverageLevel: "complete", totalCost, unmatchedCount: 0,
    details: `${rows.length}件の公式広告実績を照合し、商品別広告費 ¥${totalCost.toLocaleString("ja-JP")} を反映しました。` };
}
