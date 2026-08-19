import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findBestMatchSimplified, type Product } from "@/lib/csvHelpers";
import { getBulkProductUnitPrices } from "@/lib/unitPriceHelper";
import { getChannelConfigStatus } from "./config";
import { fetchChannelSales } from "./connectors";
import { compactText } from "./http";
import type {
  ChannelSyncResult,
  NormalizedSalesItem,
  SyncPeriod,
  WebSalesChannel,
  WebSalesTrigger,
} from "./types";

const LEGACY_MAPPING_CONFIG: Record<
  WebSalesChannel,
  { table: string; titleColumn: string }
> = {
  amazon: { table: "amazon_product_mapping", titleColumn: "amazon_title" },
  rakuten: { table: "rakuten_product_mapping", titleColumn: "rakuten_title" },
  yahoo: { table: "yahoo_product_mapping", titleColumn: "yahoo_title" },
  mercari: { table: "mercari_product_mapping", titleColumn: "mercari_title" },
  base: { table: "base_product_mapping", titleColumn: "base_title" },
  qoo10: { table: "qoo10_product_mapping", titleColumn: "qoo10_title" },
  tiktok: { table: "tiktok_product_mapping", titleColumn: "tiktok_product_name" },
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function runChannelSync(
  channel: WebSalesChannel,
  period: SyncPeriod,
  triggerType: WebSalesTrigger,
): Promise<ChannelSyncResult> {
  const supabase = serviceClient();
  const config = getChannelConfigStatus(channel);
  const { data: run, error: runError } = await supabase
    .from("web_sales_sync_runs")
    .insert({
      channel,
      trigger_type: triggerType,
      period_start: period.startDate,
      period_end: period.endDate,
      report_month: period.reportMonth,
      status: config.configured ? "running" : "skipped",
      error_message: config.configured
        ? null
        : `未設定: ${config.missing.join(", ")}`,
      completed_at: config.configured ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`同期履歴を作成できません: ${runError?.message || "unknown"}`);
  }
  const runId = String(run.id);

  if (!config.configured) {
    return {
      runId,
      channel,
      status: "skipped",
      itemCount: 0,
      quantityTotal: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      error: `未設定: ${config.missing.join(", ")}`,
    };
  }

  try {
    const fetched = await fetchChannelSales(channel, period);
    const normalizedItems = deduplicateItems(fetched.items);
    await insertRunItems(supabase, runId, normalizedItems);

    const outcome = await finalizeRun(supabase, runId, channel, period);
    await supabase
      .from("web_sales_sync_runs")
      .update({ metadata: fetched.metadata || {} })
      .eq("id", runId);
    return { runId, channel, ...outcome };
  } catch (error) {
    const message = error instanceof Error ? error.message : "自動同期に失敗しました";
    await supabase
      .from("web_sales_sync_runs")
      .update({
        status: "failed",
        error_message: message.slice(0, 4000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      runId,
      channel,
      status: "failed",
      itemCount: 0,
      quantityTotal: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      error: message,
    };
  }
}

export async function runImportedCsvSync(
  channel: WebSalesChannel,
  period: SyncPeriod,
  items: NormalizedSalesItem[],
  metadata: Record<string, unknown>,
): Promise<ChannelSyncResult> {
  const supabase = serviceClient();
  const codexJobId = compactText(metadata.codex_job_id);
  if (codexJobId) {
    const { data: existing } = await supabase
      .from("web_sales_sync_runs")
      .select("id,status,item_count,quantity_total,matched_count,unmatched_count,error_message")
      .contains("metadata", { codex_job_id: codexJobId })
      .in("status", ["success", "needs_review"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.status === "needs_review") {
        const outcome = await finalizeRun(supabase, String(existing.id), channel, period);
        return { runId: String(existing.id), channel, ...outcome };
      }
      return {
        runId: String(existing.id),
        channel,
        status: existing.status,
        itemCount: Number(existing.item_count) || 0,
        quantityTotal: Number(existing.quantity_total) || 0,
        matchedCount: Number(existing.matched_count) || 0,
        unmatchedCount: Number(existing.unmatched_count) || 0,
        error: existing.error_message || undefined,
      };
    }
  }

  const { data: run, error: runError } = await supabase
    .from("web_sales_sync_runs")
    .insert({
      channel,
      trigger_type: "manual",
      period_start: period.startDate,
      period_end: period.endDate,
      report_month: period.reportMonth,
      status: "running",
      metadata,
    })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`CSV取込履歴を作成できません: ${runError?.message || "unknown"}`);
  }
  const runId = String(run.id);

  try {
    const normalizedItems = deduplicateItems(items);
    await insertRunItems(supabase, runId, normalizedItems);
    const outcome = await finalizeRun(supabase, runId, channel, period);
    return { runId, channel, ...outcome };
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV取込に失敗しました";
    await supabase
      .from("web_sales_sync_runs")
      .update({
        status: "failed",
        error_message: message.slice(0, 4000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      runId,
      channel,
      status: "failed",
      itemCount: items.length,
      quantityTotal: roundQuantity(items.reduce((sum, item) => sum + item.quantity, 0)),
      matchedCount: 0,
      unmatchedCount: 0,
      error: message,
    };
  }
}

export async function rerunMappingFinalization(runId: string) {
  const supabase = serviceClient();
  const { data: run, error } = await supabase
    .from("web_sales_sync_runs")
    .select("id,channel,period_start,period_end,report_month")
    .eq("id", runId)
    .single();
  if (error || !run) throw new Error("同期履歴が見つかりません");
  const period: SyncPeriod = {
    startDate: run.period_start,
    endDate: run.period_end,
    reportMonth: run.report_month,
  };
  return finalizeRun(supabase, runId, run.channel as WebSalesChannel, period);
}

async function finalizeRun(
  supabase: SupabaseClient,
  runId: string,
  channel: WebSalesChannel,
  period: SyncPeriod,
): Promise<Omit<ChannelSyncResult, "runId" | "channel">> {
  const { data: storedItems, error: itemError } = await supabase
    .from("web_sales_sync_items")
    .select("external_order_id,external_line_id,external_product_key,external_product_name,occurred_at,quantity,amount,source_status,raw_data")
    .eq("run_id", runId);
  if (itemError) throw new Error(`同期明細を取得できません: ${itemError.message}`);
  const items = (storedItems || []).map((item): NormalizedSalesItem => ({
    externalOrderId: item.external_order_id,
    externalLineId: item.external_line_id,
    externalProductKey: item.external_product_key,
    externalProductName: item.external_product_name,
    occurredAt: item.occurred_at,
    quantity: Number(item.quantity) || 0,
    amount: Number(item.amount) || 0,
    sourceStatus: item.source_status,
    rawData: item.raw_data || {},
  }));

  const resolution = await resolveMappings(supabase, channel, items);
  await supabase.from("web_sales_sync_unmatched").delete().eq("run_id", runId);

  if (resolution.unmatched.length > 0) {
    const unmatchedRows = resolution.unmatched.map((item) => ({
      run_id: runId,
      channel,
      external_product_key: item.externalProductKey,
      external_product_name: item.externalProductName,
      quantity: item.quantity,
    }));
    const { error } = await supabase.from("web_sales_sync_unmatched").insert(unmatchedRows);
    if (error) throw new Error(`未紐付け一覧を保存できません: ${error.message}`);
  }

  const itemCount = items.length;
  const quantityTotal = roundQuantity(items.reduce((sum, item) => sum + item.quantity, 0));
  const matchedCount = resolution.matchedItemCount;
  const unmatchedCount = resolution.unmatched.length;

  if (unmatchedCount > 0) {
    await supabase
      .from("web_sales_sync_runs")
      .update({
        status: "needs_review",
        item_count: itemCount,
        quantity_total: quantityTotal,
        matched_count: matchedCount,
        unmatched_count: unmatchedCount,
        error_message: `${unmatchedCount}商品が未紐付けのため、月次集計は更新していません`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      status: "needs_review",
      itemCount,
      quantityTotal,
      matchedCount,
      unmatchedCount,
    };
  }

  await replaceMonthlyChannelSummary(
    supabase,
    channel,
    period.reportMonth,
    resolution.aggregated,
  );
  await supabase
    .from("web_sales_sync_runs")
    .update({
      status: "success",
      item_count: itemCount,
      quantity_total: quantityTotal,
      matched_count: matchedCount,
      unmatched_count: 0,
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  return {
    status: "success",
    itemCount,
    quantityTotal,
    matchedCount,
    unmatchedCount: 0,
  };
}

async function insertRunItems(
  supabase: SupabaseClient,
  runId: string,
  items: NormalizedSalesItem[],
) {
  for (let offset = 0; offset < items.length; offset += 500) {
    const rows = items.slice(offset, offset + 500).map((item) => ({
      run_id: runId,
      external_order_id: item.externalOrderId,
      external_line_id: item.externalLineId,
      external_product_key: item.externalProductKey,
      external_product_name: item.externalProductName,
      occurred_at: item.occurredAt,
      quantity: item.quantity,
      amount: item.amount,
      source_status: item.sourceStatus,
      raw_data: item.rawData,
    }));
    const { error } = await supabase.from("web_sales_sync_items").insert(rows);
    if (error) throw new Error(`同期明細を保存できません: ${error.message}`);
  }
}

async function resolveMappings(
  supabase: SupabaseClient,
  channel: WebSalesChannel,
  items: NormalizedSalesItem[],
) {
  const [{ data: stableMappings, error: stableError }, { data: products, error: productError }] = await Promise.all([
    supabase
      .from("web_sales_external_mappings")
      .select("external_product_key,product_id")
      .eq("channel", channel),
    supabase.from("products").select("*").eq("is_hidden", false),
  ]);
  if (stableError) throw new Error(`商品紐付けを取得できません: ${stableError.message}`);
  if (productError) throw new Error(`商品マスターを取得できません: ${productError.message}`);

  const legacy = LEGACY_MAPPING_CONFIG[channel];
  const { data: legacyMappings, error: legacyError } = await supabase
    .from(legacy.table)
    .select("*");
  if (legacyError) throw new Error(`既存商品紐付けを取得できません: ${legacyError.message}`);

  const productIds = new Set((products || []).map((product) => String(product.id)));
  const stableByKey = new Map(
    (stableMappings || [])
      .filter((mapping) => productIds.has(String(mapping.product_id)))
      .map((mapping) => [String(mapping.external_product_key), String(mapping.product_id)]),
  );
  const legacyByTitle = new Map<string, string>();
  const legacyRows = (legacyMappings || []) as Array<Record<string, unknown>>;
  for (const mapping of legacyRows) {
    const key = normalizeLookup(mapping[legacy.titleColumn]);
    if (key && productIds.has(String(mapping.product_id))) {
      legacyByTitle.set(key, String(mapping.product_id));
    }
  }
  const productByCode = new Map<string, string>();
  const productByName = new Map<string, string>();
  for (const product of products || []) {
    const productRecord = product as Record<string, unknown>;
    if (compactText(productRecord.product_code)) {
      productByCode.set(compactText(productRecord.product_code).toLowerCase(), String(product.id));
    }
    const name = normalizeLookup(product.name);
    if (name && !productByName.has(name)) productByName.set(name, String(product.id));
  }

  const discovered: Array<{
    channel: WebSalesChannel;
    external_product_key: string;
    external_product_name: string;
    product_id: string;
    match_source: "legacy_title" | "product_code" | "exact_name";
    updated_at: string;
  }> = [];
  const aggregated = new Map<string, { quantity: number; amount: number }>();
  const unmatchedMap = new Map<string, NormalizedSalesItem>();
  const heuristicMatchedIds = new Set<string>();
  let matchedItemCount = 0;

  for (const item of items) {
    const key = compactText(item.externalProductKey);
    const nameKey = normalizeLookup(item.externalProductName);
    let productId = stableByKey.get(key);
    let source: "legacy_title" | "product_code" | "exact_name" | "heuristic" | null = null;
    if (!productId && nameKey) {
      productId = legacyByTitle.get(nameKey);
      if (productId) source = "legacy_title";
    }
    if (!productId && key) {
      productId = productByCode.get(key.toLowerCase());
      if (productId) source = "product_code";
    }
    if (!productId && nameKey) {
      productId = productByName.get(nameKey);
      if (productId) source = "exact_name";
    }
    if (!productId && nameKey && channel !== "tiktok") {
      const heuristic = findBestMatchSimplified(
        item.externalProductName,
        (products || []) as Product[],
        legacyRows as unknown as Parameters<typeof findBestMatchSimplified>[2],
        heuristicMatchedIds,
        channel,
      );
      if (heuristic) {
        productId = heuristic.product.id;
        source = "heuristic";
      }
    }

    if (!productId) {
      const current = unmatchedMap.get(key);
      unmatchedMap.set(key, current
        ? { ...current, quantity: current.quantity + item.quantity, amount: current.amount + item.amount }
        : { ...item });
      continue;
    }

    matchedItemCount += 1;
    const current = aggregated.get(productId) || { quantity: 0, amount: 0 };
    aggregated.set(productId, {
      quantity: current.quantity + item.quantity,
      amount: current.amount + item.amount,
    });
    if (source && source !== "heuristic" && !stableByKey.has(key)) {
      stableByKey.set(key, productId);
      discovered.push({
        channel,
        external_product_key: key,
        external_product_name: item.externalProductName,
        product_id: productId,
        match_source: source,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (discovered.length > 0) {
    const { error } = await supabase
      .from("web_sales_external_mappings")
      .upsert(discovered, { onConflict: "channel,external_product_key" });
    if (error) throw new Error(`自動商品紐付けを保存できません: ${error.message}`);
  }

  return {
    aggregated,
    matchedItemCount,
    unmatched: [...unmatchedMap.values()],
  };
}

async function replaceMonthlyChannelSummary(
  supabase: SupabaseClient,
  channel: WebSalesChannel,
  reportMonth: string,
  aggregated: Map<string, { quantity: number; amount: number }>,
) {
  const productIds = [...aggregated.keys()];
  const unitPriceMap = await getBulkProductUnitPrices(supabase, productIds);
  const rows = productIds.map((productId) => {
    const value = aggregated.get(productId)!;
    const unit = unitPriceMap.get(productId) || { unit_price: 0, unit_profit_rate: 0 };
    return {
      product_id: productId,
      quantity: roundQuantity(value.quantity),
      amount: Math.round(value.amount),
      unit_price: unit.unit_price,
      unit_profit_rate: unit.unit_profit_rate,
    };
  });
  const { error } = await supabase.rpc("replace_web_sales_channel_summary", {
    p_channel: channel,
    p_report_month: reportMonth,
    p_rows: rows,
  });
  if (error) throw new Error(`月次集計を一括更新できません: ${error.message}`);
}

function deduplicateItems(items: NormalizedSalesItem[]) {
  const map = new Map<string, NormalizedSalesItem>();
  for (const original of items) {
    const item = {
      ...original,
      externalOrderId: compactText(original.externalOrderId) || "unknown-order",
      externalLineId: compactText(original.externalLineId) || "unknown-line",
      externalProductKey: compactText(original.externalProductKey) || "unknown-product",
      externalProductName: compactText(original.externalProductName),
      quantity: Number(original.quantity) || 0,
      amount: Number(original.amount) || 0,
    };
    if (item.quantity <= 0) continue;
    const key = `${item.externalOrderId}\u0000${item.externalLineId}`;
    const current = map.get(key);
    if (current && current.externalProductKey === item.externalProductKey) {
      map.set(key, {
        ...current,
        quantity: current.quantity + item.quantity,
        amount: current.amount + item.amount,
      });
    } else if (current) {
      let suffix = 2;
      while (map.has(`${key}:${suffix}`)) suffix += 1;
      item.externalLineId = `${item.externalLineId}:${suffix}`;
      map.set(`${key}:${suffix}`, item);
    } else {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function normalizeLookup(value: unknown) {
  return compactText(value).normalize("NFKC").toLowerCase();
}

function roundQuantity(value: number) {
  return Math.round(value * 100) / 100;
}

export function getWebSalesAutomationServiceClient() {
  return serviceClient();
}
