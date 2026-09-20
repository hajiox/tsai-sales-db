import type { SupabaseClient } from "@supabase/supabase-js";
import type { Snapshot } from "./model";
import { analyzeFinance, completedAdChannels, type FinanceSources, type Row } from "./finance";

// One request-scoped loader is shared by the overview's four ECs. No cache
// survives a request, so monthly imports/corrections appear on the next refresh.
export function createFinanceLoader(db: SupabaseClient) {
  const months = new Map<string, Promise<Omit<FinanceSources, "legacy">>>();
  const legacy = new Map<string, Promise<Row[]>>();
  async function all(table: string, columns: string, month?: string, order = "id"): Promise<Row[]> {
    const rows: Row[] = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      let query = db.from(table).select(columns).order(order).range(offset, offset + 999);
      if (table === "web_sales_external_mappings") query = query.order("channel");
      if (month) query = query.eq("report_month", month);
      const result = await query;
      if (result.error) throw new Error(`収益データを取得できません（${table}）`);
      rows.push(...result.data as unknown as Row[]);
      if (result.data.length < 1000) return rows;
    }
    throw new Error(`収益データが取得上限を超えました（${table}）`);
  }
  async function sources(month: string) {
    const [sales, products, mappings, ads, settlements, jobs] = await Promise.all([
      all("web_sales_summary", "id,product_id,unit_price,unit_cost_ex_ec,amazon_count,rakuten_count,yahoo_count,base_count,mercari_count,qoo10_count,tiktok_count,base_amount", month),
      all("products", "id,series_code"),
      all("web_sales_external_mappings", "channel,external_product_key,product_id", undefined, "external_product_key"),
      all("advertising_costs", "id,series_code,google_cost,meta_cost,other_cost,amazon_cost,rakuten_cost,yahoo_cost", month),
      all("ec_profit_monthly", "id,channel,period_start,period_end,coverage_level,refunds,platform_fees,payment_fees,seller_discounts,seller_coupons,seller_points,shipping_costs,other_costs,other_credits,raw_summary", month),
      all("web_sales_codex_jobs", "id,task_key,channel,status,period_start,period_end", month),
    ]);
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return { sales, products, mappings, ads, settlements, completedAds: completedAdChannels(jobs, month, end) };
  }
  return async (snapshot: Snapshot) => {
    const month = snapshot.period_start.slice(0, 7) + "-01";
    if (!months.has(month)) months.set(month, sources(month));
    const channel = snapshot.channel;
    const title = channel === "tiktok" ? "tiktok_product_name" : `${channel}_title`;
    if (!legacy.has(channel)) legacy.set(channel, all(`${channel}_product_mapping`, `product_id,${title}`, undefined, title).then(rows => rows.map(r => ({ ...r, title: r[title] }))));
    const [data, legacyRows] = await Promise.all([months.get(month)!, legacy.get(channel)!]);
    return analyzeFinance(snapshot.payload.input, { ...data, legacy: legacyRows }, new Map(snapshot.payload.analysis.items.map(i => [i.key, i.rank])));
  };
}
