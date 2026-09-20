import type { ImportInput, Rank } from "./model";

export const FINANCE_RULE = "abcd-profit-1";
export const FINANCE_LABELS = {
  A: "重点育成", B: "収益改善", C: "育成候補", D: "優先度見直し", 赤字: "赤字", 保留: "保留",
} as const;
export type FinanceRank = keyof typeof FINANCE_LABELS;
export type Row = Record<string, unknown>;
export type FinanceSources = {
  sales: Row[]; products: Row[]; mappings: Row[]; legacy: Row[];
  ads: Row[]; settlements: Row[]; completedAds: string[];
};
export function completedAdChannels(jobs: Row[], start: string, end: string) {
  return [...new Set(jobs.filter(j => j.task_key === "ad_cost_import" && j.status === "completed"
    && j.period_start === start && j.period_end === end).map(j => String(j.channel)))];
}
export type FinanceItem = {
  key: string; productId: string | null; sales: number | null; productCost: number | null;
  ecCosts: number | null; adCost: number | null; profit: number | null; margin: number | null;
  rank: FinanceRank; quality: "推計" | "費用一部" | "未取得"; reason: string; action: string;
};
export type FinanceAnalysis = {
  rule: string; calculatedAt: string; items: FinanceItem[]; salesThreshold: number | null;
  marginThreshold: number | null; counts: Record<FinanceRank, number>; notes: string[];
};
const channels = ["amazon", "rakuten", "yahoo", "base", "mercari", "qoo10", "tiktok"];
const deductions = ["refunds", "platform_fees", "payment_fees", "seller_discounts", "seller_coupons", "seller_points", "shipping_costs", "other_costs"];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
function number(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null;
}
const series = (value: unknown) => value == null ? "unclassified" : String(value);
const nameKey = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

// Reuse saved identities only. Conflicting identities never get resolved by a
// last-write-wins map or fuzzy name/pack-size guessing.
function identities(rows: Row[], field: string, normalize = (v: unknown) => String(v ?? "")) {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = normalize(row[field]); if (!key || !row.product_id) continue;
    const ids = map.get(key) ?? new Set<string>(); ids.add(String(row.product_id)); map.set(key, ids);
  }
  return map;
}
export function classifyFinance(sales: number, profit: number, salesThreshold: number | null, marginThreshold: number | null): FinanceRank {
  if (profit < 0) return "赤字";
  if (sales <= 0 || salesThreshold == null || marginThreshold == null) return "保留";
  const highMargin = profit > 0 && profit / sales * 100 >= marginThreshold;
  return sales >= salesThreshold ? highMargin ? "A" : "B" : highMargin ? "C" : "D";
}
export function financeAction(rank: FinanceRank, trafficRank?: Rank) {
  if (rank === "赤字") return "広告費・価格・原価を確認し、赤字の原因を優先して改善";
  if (rank === "保留") return "不足データ・紐付け・販売状態を確認";
  if (rank === "B") return "売上を維持しながら広告費・手数料・原価を改善";
  if (rank === "D") return "売上と収益性の改善余地を確認";
  if (trafficRank === "B" || trafficRank === "D") return "利益を保ちながら商品ページの購入率を改善";
  if (trafficRank === "保留") return "収益性は確認済み。集客判断にはアクセス実績を追加";
  return rank === "A" ? "利益・在庫を確認して集客拡大を検討" : "少額の集客テストで売上拡大を検討";
}

export function analyzeFinance(input: ImportInput, data: FinanceSources, trafficRanks: Map<string, Rank> = new Map(), calculatedAt = new Date().toISOString()): FinanceAnalysis {
  const notes = [
    "収益評価は月次販売集計の売上・保存原価を使用。アクセス分析の売上・購入実績とは集計範囲が異なる場合があります。",
    "売上は保存単価×販売点数（BASEは保存済み売上金額）。商品別費用は実測ではなく売上構成比による推計です。",
    "EC費用は同じEC内、直接広告費は同じEC・シリーズ内、Google・Meta等の共通広告費は同じシリーズの全EC売上で配分します。広告費は精算書と広告集計の大きい方を採用し二重控除しません。",
    "収益A/B/C/Dは売上中央値と加重平均利益率で分類。利益率基準の下限は0%。赤字は別表示。費用一部・未取得・売上0・新商品・欠品・同一商品への複数掲載は判定保留です。",
  ];
  const end = new Date(Date.UTC(Number(input.start.slice(0, 4)), Number(input.start.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const fullMonth = input.start.endsWith("-01") && input.end === end;
  const products = new Map(data.products.map(p => [String(p.id), p]));
  const stable = identities(data.mappings.filter(m => m.channel === input.channel), "external_product_key");
  const legacy = identities(data.legacy, "title", nameKey);
  const resolve = (key: string, name: string) => {
    const ids = stable.get(key) ?? legacy.get(nameKey(name));
    return ids?.size === 1 && products.has([...ids][0]) ? [...ids][0] : null;
  };
  const resolved = input.items.map(i => resolve(i.key, i.name));
  const occurrences = new Map<string, number>();
  resolved.forEach(id => { if (id) occurrences.set(id, (occurrences.get(id) ?? 0) + 1); });
  const byProduct = new Map<string, Row>();
  const duplicateSales = new Set<string>();
  const revenue = new Map<string, number>();
  const channelRevenue = new Map<string, number>();
  const seriesRevenue = new Map<string, number>();
  const channelSeriesRevenue = new Map<string, number>();
  const unknownChannels = new Set<string>();
  const unknownSeries = new Set<string>();
  for (const row of data.sales) {
    const id = String(row.product_id); if (byProduct.has(id)) duplicateSales.add(id);
    byProduct.set(id, row);
    const code = series(products.get(id)?.series_code);
    for (const channel of channels) {
      const qty = number(row[`${channel}_count`]); if (qty == null || qty === 0) continue;
      const price = number(row.unit_price);
      const baseAmount = number(row.base_amount);
      const sales = channel === "base" && baseAmount != null && baseAmount > 0 ? baseAmount : price == null ? null : qty * price;
      if (sales == null) { unknownChannels.add(channel); unknownSeries.add(code); continue; }
      revenue.set(`${channel}:${id}`, sales);
      channelRevenue.set(channel, (channelRevenue.get(channel) ?? 0) + sales);
      seriesRevenue.set(code, (seriesRevenue.get(code) ?? 0) + sales);
      channelSeriesRevenue.set(`${channel}:${code}`, (channelSeriesRevenue.get(`${channel}:${code}`) ?? 0) + sales);
    }
  }
  const ch = input.channel;
  const settlement = data.settlements.find(r => r.channel === ch && r.period_start === input.start && r.period_end === input.end);
  const raw = (settlement?.raw_summary ?? {}) as Row;
  const feeValues = deductions.map(k => number(settlement?.[k]));
  const credits = number(settlement?.other_credits);
  const feeTotal = feeValues.every(v => v != null) && credits != null ? sum(feeValues as number[]) - credits : null;
  const feeComplete = settlement?.coverage_level === "complete" || raw.estimated === true;
  if (raw.estimated === true) notes.push("このECの精算費用自体が過去実績等に基づく概算です。公式確定額に更新されると収益評価も再計算されます。");
  else if (settlement && !feeComplete) notes.push("このECの精算費用は一部取得です。表示利益は未取得費用を含まない参考額で、収益A〜D・赤字の確定判定には使用しません。");
  const directChannel = ["amazon", "rakuten", "yahoo"].includes(ch);
  const adsReady = ["google", "meta", ...(directChannel ? [ch] : [])].every(c => data.completedAds.includes(c));
  const directBySeries = new Map<string, number>();
  const sharedBySeries = new Map<string, number>();
  let invalidAds = false;
  for (const row of data.ads) {
    const code = series(row.series_code);
    const direct = directChannel ? number(row[`${ch}_cost`]) : 0;
    const shared = ["google_cost", "meta_cost", "other_cost"].map(k => number(row[k]));
    if (direct == null || shared.some(v => v == null)) { invalidAds = true; continue; }
    directBySeries.set(code, (directBySeries.get(code) ?? 0) + direct);
    sharedBySeries.set(code, (sharedBySeries.get(code) ?? 0) + sum(shared as number[]));
  }
  const importedAds = sum([...directBySeries.values()]);
  const settlementAds = number(raw.excluded_ad_costs);
  const directTotal = Math.max(importedAds, settlementAds ?? 0);
  const directPool = (code: string) => importedAds > 0 ? directTotal * (directBySeries.get(code) ?? 0) / importedAds : 0;
  const totalSales = channelRevenue.get(ch) ?? 0;
  const unallocated = sum([...directBySeries.keys()].filter(code => !(channelSeriesRevenue.get(`${ch}:${code}`) ?? 0)).map(directPool));
  if (unallocated > 0) notes.push(`同じEC・シリーズに売上がなく配分できない直接広告費：${Math.round(unallocated).toLocaleString("ja-JP")}円。商品別利益の合計には含まれません。`);
  const sharedUnallocated = sum([...sharedBySeries].filter(([code]) => !(seriesRevenue.get(code) ?? 0)).map(([, amount]) => amount));
  if (sharedUnallocated > 0) notes.push(`全ECでシリーズ売上がなく配分できない共通広告費：${Math.round(sharedUnallocated).toLocaleString("ja-JP")}円。`);
  const items: FinanceItem[] = input.items.map((item, index) => {
    const id = resolved[index];
    const result: FinanceItem = { key: item.key, productId: id, sales: null, productCost: null, ecCosts: null, adCost: null, profit: null, margin: null, rank: "保留", quality: "未取得", reason: "", action: "" };
    if (!fullMonth) { result.reason = "収益評価は月初から月末までの確定期間が対象"; return result; }
    if (!id) { result.reason = "保存済みの商品紐付けなし、または紐付けが曖昧"; return result; }
    if (occurrences.get(id)! > 1 || duplicateSales.has(id)) { result.reason = "同一商品に複数明細があるため、売上・費用の二重計上を防いで保留"; return result; }
    const row = byProduct.get(id);
    const qty = number(row?.[`${ch}_count`]);
    const code = series(products.get(id)?.series_code);
    result.sales = qty === 0 ? 0 : revenue.get(`${ch}:${id}`) ?? null;
    const cost = number(row?.unit_cost_ex_ec);
    result.productCost = cost != null && qty != null ? cost * qty : null;
    if (result.sales == null || result.productCost == null) { result.reason = "当月の販売点数・保存単価・EC手数料を除いた保存原価が未取得"; return result; }
    if (unknownChannels.has(ch) || unknownSeries.has(code)) { result.reason = "配分対象に売上未取得の商品があり、費用の構成比を確定できません"; return result; }
    const salesShare = totalSales > 0 ? result.sales / totalSales : 0;
    result.ecCosts = feeTotal != null && totalSales > 0 ? feeTotal * salesShare : null;
    if (adsReady && !invalidAds) {
      const directDenom = channelSeriesRevenue.get(`${ch}:${code}`) ?? 0;
      const sharedDenom = seriesRevenue.get(code) ?? 0;
      result.adCost = (importedAds > 0 ? directDenom > 0 ? directPool(code) * result.sales / directDenom : 0 : directTotal * salesShare)
        + (sharedDenom > 0 ? (sharedBySeries.get(code) ?? 0) * result.sales / sharedDenom : 0);
    }
    if (result.ecCosts == null || result.adCost == null) { result.reason = result.ecCosts == null ? "同一期間のEC費用が未取得" : "広告費の取得完了を確認できません（未取得を0円にしません）"; return result; }
    result.profit = result.sales - result.productCost - result.ecCosts - result.adCost;
    result.margin = result.sales > 0 ? result.profit / result.sales * 100 : null;
    result.quality = feeComplete ? "推計" : "費用一部";
    if (!feeComplete) result.reason = "EC費用が一部取得のため、取得済み費用控除後の参考額。総合評価は保留";
    else if (item.state !== "normal") result.reason = item.state === "new" ? "新商品・検証中" : "欠品の影響あり";
    else if (result.sales === 0) result.reason = "当月売上0。売上比例の費用配分では商品別広告実績を判断できません";
    return result;
  });
  const eligible = items.filter(i => !i.reason && i.sales! > 0 && i.profit != null);
  const sorted = eligible.map(i => i.sales!).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const salesThreshold = sorted.length < 2 ? null : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const marginThreshold = eligible.length < 2 ? null : Math.max(0, sum(eligible.map(i => i.profit!)) / sum(eligible.map(i => i.sales!)) * 100);
  for (const item of items) {
    if (!item.reason) {
      item.rank = classifyFinance(item.sales!, item.profit!, salesThreshold, marginThreshold);
      if (item.rank === "保留") item.reason = "比較できる収益データが2商品未満";
    }
    item.action = financeAction(item.rank, trafficRanks.get(item.key));
  }
  return { rule: FINANCE_RULE, calculatedAt, salesThreshold, marginThreshold, items,
    counts: Object.fromEntries(Object.keys(FINANCE_LABELS).map(rank => [rank, items.filter(i => i.rank === rank).length])) as Record<FinanceRank, number>, notes };
}
