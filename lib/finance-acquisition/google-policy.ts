import {
  allocateIntegerTotal,
  classifyGoogleAdsCostRows,
  microsToRoundedYen,
} from "../google-ads-import-policy";

type GoogleApiRow = {
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
  assetGroup?: { name?: string; status?: string };
  segments?: { date?: string };
  metrics?: Record<string, unknown>;
};
export type GooglePerformanceRow = {
  campaign_name: string;
  asset_group_name: string;
  asset_group_status: string;
  report_date: string;
  cost_micros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversions_value: number;
  series_code: number | null;
};

function metric(row: GoogleApiRow, key: string): number {
  const value = Number(row.metrics?.[key] ?? 0);
  if (!Number.isFinite(value) || (["costMicros", "impressions", "clicks"].includes(key) && value < 0)) throw new Error("Google広告の数値を確認できません。");
  if (["costMicros", "impressions", "clicks"].includes(key) && !Number.isSafeInteger(value)) throw new Error("Google広告の整数値を確認できません。");
  return value;
}

/** Keep the existing WEB/physical-store and P-MAX residual policy. */
export function normalizeGooglePerformance(
  campaignRows: GoogleApiRow[], assetRows: GoogleApiRow[], seriesMapping: Map<string, number>, startDate: string, endDate: string,
): GooglePerformanceRow[] {
  const rows: GooglePerformanceRow[] = [];
  const campaigns = new Map<string, GoogleApiRow>();
  const pmaxCosts = new Map<string, number>();
  const names = new Map<string, string>();
  const keyOf = (row: GoogleApiRow) => `${row.campaign?.name || ""}|${row.segments?.date || ""}`;
  const check = (row: GoogleApiRow) => {
    const name = row.campaign?.name;
    const date = row.segments?.date;
    if (!name || !date || date < startDate || date > endDate) throw new Error("Google広告の名称・対象期間を確認できません。");
    const id = String(row.campaign?.id || "");
    if (!id) throw new Error("Google広告のキャンペーン識別子がありません。");
    if (names.has(name) && names.get(name) !== id) throw new Error("同名のGoogle広告キャンペーンが複数あります。識別子の確認が必要です。");
    names.set(name, id);
  };
  const toRow = (row: GoogleApiRow, group: string, status: string, seriesName: string): GooglePerformanceRow => ({
    campaign_name: row.campaign!.name!, asset_group_name: group, asset_group_status: status,
    report_date: row.segments!.date!, cost_micros: metric(row, "costMicros"), impressions: metric(row, "impressions"),
    clicks: metric(row, "clicks"), conversions: metric(row, "conversions"), conversions_value: metric(row, "conversionsValue"),
    series_code: seriesMapping.get(seriesName) || null,
  });
  for (const row of campaignRows) {
    check(row);
    if (campaigns.has(keyOf(row))) throw new Error("Google広告の日次キャンペーン行が重複しています。");
    campaigns.set(keyOf(row), row);
    const type = row.campaign?.advertisingChannelType || "";
    if (type === "PERFORMANCE_MAX") continue;
    if (row.campaign!.name!.includes("ブランド館") || type === "LOCAL") continue;
    rows.push(toRow(row, `[${type}] ${row.campaign!.name}`, row.campaign?.status || "", row.campaign!.name!));
  }
  for (const row of assetRows) {
    check(row);
    const campaign = campaigns.get(keyOf(row));
    if (!campaign || campaign.campaign?.advertisingChannelType !== "PERFORMANCE_MAX") throw new Error("P-MAX広告のキャンペーン合計を確認できません。");
    pmaxCosts.set(keyOf(row), (pmaxCosts.get(keyOf(row)) || 0) + metric(row, "costMicros"));
    const name = row.assetGroup?.name;
    if (!name) throw new Error("Google広告のアセットグループ名がありません。");
    if (row.campaign!.name!.includes("ブランド館") || name.includes("ブランド館")) continue;
    rows.push(toRow(row, name, row.assetGroup?.status || "", name));
  }
  for (const [key, row] of campaigns) {
    if (row.campaign?.advertisingChannelType !== "PERFORMANCE_MAX" || row.campaign.name!.includes("ブランド館")) continue;
    const total = metric(row, "costMicros"), attributed = pmaxCosts.get(key) || 0;
    if (attributed > total) throw new Error("P-MAX広告の内訳がキャンペーン合計を超えています。");
    if (total === attributed) continue;
    const residual = toRow(row, `[P-MAX自動配信] ${row.campaign.name}`, "ENABLED", "");
    const ratio = (total - attributed) / total;
    residual.cost_micros = total - attributed;
    residual.impressions = Math.round(residual.impressions * ratio);
    residual.clicks = Math.round(residual.clicks * ratio);
    residual.conversions = Math.round(residual.conversions * ratio * 100) / 100;
    residual.conversions_value = Math.round(residual.conversions_value * ratio * 100) / 100;
    rows.push(residual);
  }
  const rowKeys = new Set<string>();
  for (const row of rows) {
    const key = `${row.campaign_name}|${row.asset_group_name}|${row.report_date}`;
    if (rowKeys.has(key)) throw new Error("Google広告の内訳行が重複しています。");
    rowKeys.add(key);
  }
  return rows;
}

export function prepareGoogleCostAllocation(rows: GooglePerformanceRow[], baseWeights: Map<number, number>) {
  const classified = classifyGoogleAdsCostRows(rows);
  const costs = new Map<number, number>();
  for (const [series, micros] of classified.mappedMicrosBySeries) costs.set(series, microsToRoundedYen(micros));
  const warnings: string[] = [];
  if (classified.unknownGroupNames.length > 0) return { costs, classified, warnings, needsReview: true, allocationBasis: "" };
  let allocationBasis = "";
  if (classified.sharedShoppingMicros > 0) {
    const weights = baseWeights.size > 0 ? baseWeights : classified.mappedMicrosBySeries;
    allocationBasis = baseWeights.size > 0 ? "BASE売上構成比" : "商品別Google広告費構成比";
    if (weights.size === 0) return { costs, classified, warnings, needsReview: true, allocationBasis };
    const mappedTotal = [...costs.values()].reduce((sum, value) => sum + value, 0);
    const total = microsToRoundedYen([...classified.mappedMicrosBySeries.values()].reduce((sum, value) => sum + value, 0) + classified.sharedShoppingMicros);
    if (total < mappedTotal) throw new Error("Google広告の円単位丸めを確認できません。");
    for (const [series, cost] of allocateIntegerTotal(total - mappedTotal, weights)) costs.set(series, (costs.get(series) || 0) + cost);
    warnings.push(`EC共通ショッピング広告は${allocationBasis}で配賦しています。`);
  }
  if (classified.excludedStoreMicros > 0) warnings.push("食ブラ来店広告をWEB販売広告費から除外しています。");
  return { costs, classified, warnings, needsReview: false, allocationBasis };
}
