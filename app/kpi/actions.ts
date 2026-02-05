
'use server'

import { createClient } from '@supabase/supabase-js';
import { addMonths, format, subYears, parseISO } from 'date-fns';

// ----------------------------------------------------------------------
// Types & Interfaces
// ----------------------------------------------------------------------

export type ChannelCode = 'WEB' | 'WHOLESALE' | 'STORE' | 'SHOKU';

export interface MonthlyKpiData {
  month: string; // "YYYY-MM-01"
  actual: number; // 実績
  target: number; // 目標
  lastYear: number; // 前年実績
  twoYearsAgo: number; // 前々年実績
}

export interface KpiSummary {
  fiscalYear: number;
  months: string[];
  channels: {
    [key in ChannelCode]: MonthlyKpiData[];
  };
  total: MonthlyKpiData[];
}

// ----------------------------------------------------------------------
// Supabase Client
// ----------------------------------------------------------------------

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials missing");
  return createClient(url, key);
};

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function generateMonths(fy: number): string[] {
  const months: string[] = [];
  const start = new Date(fy - 1, 7, 1); // Aug 1st
  for (let i = 0; i < 12; i++) {
    months.push(format(addMonths(start, i), 'yyyy-MM-01'));
  }
  return months;
}

// ----------------------------------------------------------------------
// Server Actions
// ----------------------------------------------------------------------

export async function getKpiSummary(fiscalYear: number): Promise<KpiSummary> {
  const fyMonths = generateMonths(fiscalYear);
  const startCurrent = fyMonths[0]; // YYYY-08-01
  const endCurrent = format(addMonths(parseISO(fyMonths[11]), 1), 'yyyy-MM-01'); // Upper bound
  const startTwoAgo = format(subYears(parseISO(startCurrent), 2), 'yyyy-MM-01');

  const queryStart = startTwoAgo;
  const queryEnd = endCurrent;

  try {
    const [webRows, wholesaleRows, storeRows, shokuRows, targetRows] = await Promise.all([
      fetchWebSales(queryStart, queryEnd),
      fetchWholesaleSales(queryStart, queryEnd),
      fetchStoreSales(queryStart, queryEnd),
      fetchShokuSales(queryStart, queryEnd),
      fetchTargets(queryStart, queryEnd)
    ]);

    // Lookup Maps
    const webMap = new Map(webRows.map(r => [r.month, r.amount]));
    const wholesaleMap = new Map(wholesaleRows.map(r => [r.month, r.amount]));
    const storeMap = new Map(storeRows.map(r => [r.month, r.amount]));
    const shokuMap = new Map(shokuRows.map(r => [r.month, r.amount]));
    const targetMap = new Map(targetRows.map(r => [`${r.channel}_${r.month}`, r.amount]));

    const getAmount = (channel: ChannelCode, month: string) => {
      switch (channel) {
        case 'WEB': return webMap.get(month) || 0;
        case 'WHOLESALE': return wholesaleMap.get(month) || 0;
        case 'STORE': return storeMap.get(month) || 0;
        case 'SHOKU': return shokuMap.get(month) || 0;
        default: return 0;
      }
    };

    const channels: ChannelCode[] = ['WEB', 'WHOLESALE', 'STORE', 'SHOKU'];
    const resultChannels: any = {};

    channels.forEach(channel => {
      resultChannels[channel] = fyMonths.map(month => {
        const lastYearMonth = format(subYears(parseISO(month), 1), 'yyyy-MM-01');
        const twoYearsAgoMonth = format(subYears(parseISO(month), 2), 'yyyy-MM-01');

        return {
          month,
          actual: getAmount(channel, month),
          target: targetMap.get(`${channel}_${month}`) || 0,
          lastYear: getAmount(channel, lastYearMonth),
          twoYearsAgo: getAmount(channel, twoYearsAgoMonth),
        };
      });
    });

    const total = fyMonths.map((month, i) => {
      const channelData = channels.map(c => resultChannels[c][i]);
      return {
        month,
        actual: channelData.reduce((sum, d) => sum + d.actual, 0),
        target: channelData.reduce((sum, d) => sum + d.target, 0),
        lastYear: channelData.reduce((sum, d) => sum + d.lastYear, 0),
        twoYearsAgo: channelData.reduce((sum, d) => sum + d.twoYearsAgo, 0),
      };
    });

    return {
      fiscalYear,
      months: fyMonths,
      channels: resultChannels,
      total
    };
  } catch (error) {
    console.error('Data Fetch Error:', error);
    throw new Error('データの取得に失敗しました');
  }
}

export async function saveKpiTarget(data: { channel: string, month: string, amount: number }) {
  const supabase = getSupabase();

  // Custom Upsert Logic since we need to match (metric, channel_code, month)
  // Check if exists
  const { data: existing } = await supabase
    .from('kpi.kpi_manual_entries_v1') // Assuming access via schema prefix might be tricky with client
    // Actually, Supabase Client usually accesses public schema by default.
    // If the table is in 'kpi' schema, we might need to configure the client or use RPC.
    // However, existing code suggests `kpi.kpi_manual_entries_v1` is the table name used in SQL. 
    // In Supabase client, we just use the table name if it's exposed.
    // If 'kpi' is a schema, we should check if it's exposed in the API.
    // We'll trust the plan for now, but falling back to SQL might be safer if schema is involved.
    // Wait, earlier SQL `create table if not exists kpi.kpi_manual_entries_v1`
    // Supabase client might not access `kpi` schema directly unless configured.
    // Let's assume the table is accessible or use RPC.

    // For simplicity with Server Role Key: we can use the `kpi_manual_entries_v1` if it's in public?
    // No, it's in `kpi` schema.
    // We can try `supabase.schema('kpi').from('kpi_manual_entries_v1')`.
    .schema('kpi')
    .from('kpi_manual_entries_v1')
    .select('metric')
    .eq('metric', 'target')
    .eq('channel_code', data.channel)
    .eq('month', data.month)
    .single();

  const { error } = await supabase
    .schema('kpi')
    .from('kpi_manual_entries_v1')
    .upsert({
      metric: 'target',
      channel_code: data.channel,
      month: data.month,
      amount: data.amount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'metric,channel_code,month' });

  if (error) {
    console.error('Save Target Error:', error);
    return { success: false, error: '保存に失敗しました' };
  }
  return { success: true };
}

// ----------------------------------------------------------------------
// Fetchers (Supabase + JS Aggregation)
// ----------------------------------------------------------------------

async function fetchWebSales(start: string, end: string) {
  const supabase = getSupabase();

  // 1. Fetch Products
  const { data: products } = await supabase
    .from('products')
    .select('id, price');

  if (!products) return [];
  const priceMap = new Map(products.map(p => [p.id, p.price || 0]));

  // 2. Fetch Summary
  // We need to fetch all rows in date range because we can't join-multiply-sum easily
  // Batching might be needed if huge, but let's assume it fits in memory (3 years ~ 3600 rows max if 100 products)
  const { data: summary } = await supabase
    .from('web_sales_summary')
    .select('report_month, product_id, amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count, tiktok_count')
    .gte('report_month', start)
    .lt('report_month', end);

  if (!summary) return [];

  // 3. Aggregate
  const monthMap = new Map<string, number>();

  summary.forEach(row => {
    const month = row.report_month.substring(0, 7) + '-01'; // Ensure YYYY-MM-01
    const price = priceMap.get(row.product_id) || 0;
    const count = (row.amazon_count || 0) +
      (row.rakuten_count || 0) +
      (row.yahoo_count || 0) +
      (row.mercari_count || 0) +
      (row.base_count || 0) +
      (row.qoo10_count || 0) +
      (row.tiktok_count || 0);
    const amount = count * price;

    monthMap.set(month, (monthMap.get(month) || 0) + amount);
  });

  return Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));
}

async function fetchWholesaleSales(start: string, end: string) {
  const supabase = getSupabase();

  // Wholesale (quantity * unit_price)
  const { data: wholesale } = await supabase
    .from('wholesale_sales')
    .select('sale_date, quantity, unit_price')
    .gte('sale_date', start)
    .lt('sale_date', end);

  // OEM (amount)
  const { data: oem } = await supabase
    .from('oem_sales')
    .select('sale_date, amount')
    .gte('sale_date', start)
    .lt('sale_date', end);

  const monthMap = new Map<string, number>();

  // Aggregate Wholesale
  wholesale?.forEach(row => {
    const month = row.sale_date.substring(0, 7) + '-01';
    const amount = (row.quantity || 0) * (row.unit_price || 0);
    monthMap.set(month, (monthMap.get(month) || 0) + amount);
  });

  // Aggregate OEM
  oem?.forEach(row => {
    const month = row.sale_date.substring(0, 7) + '-01';
    const amount = row.amount || 0;
    monthMap.set(month, (monthMap.get(month) || 0) + amount);
  });

  return Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));
}

async function fetchStoreSales(start: string, end: string) {
  const supabase = getSupabase();

  // Sales
  const { data: sales } = await supabase
    .from('brand_store_sales')
    .select('report_month, total_sales')
    .gte('report_month', start)
    .lt('report_month', end);

  // Adjustments
  const { data: adjustments } = await supabase
    .from('brand_store_sales_adjustments')
    .select('report_month, adjustment_amount')
    .gte('report_month', start)
    .lt('report_month', end);

  const monthMap = new Map<string, number>();

  sales?.forEach(row => {
    const month = row.report_month.substring(0, 7) + '-01';
    monthMap.set(month, (monthMap.get(month) || 0) + (row.total_sales || 0));
  });

  adjustments?.forEach(row => {
    const month = row.report_month.substring(0, 7) + '-01';
    monthMap.set(month, (monthMap.get(month) || 0) + (row.adjustment_amount || 0));
  });

  return Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));
}

async function fetchShokuSales(start: string, end: string) {
  const supabase = getSupabase();

  const { data: sales } = await supabase
    .from('food_store_sales')
    .select('report_month, total_sales')
    .gte('report_month', start)
    .lt('report_month', end);

  const monthMap = new Map<string, number>();

  sales?.forEach(row => {
    const month = row.report_month.substring(0, 7) + '-01';
    monthMap.set(month, (monthMap.get(month) || 0) + (row.total_sales || 0));
  });

  return Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));
}

async function fetchTargets(start: string, end: string) {
  const supabase = getSupabase();

  const { data: targets } = await supabase
    .schema('kpi')
    .from('kpi_manual_entries_v1')
    .select('channel_code, month, amount')
    .eq('metric', 'target')
    .gte('month', start)
    .lt('month', end);

  // Format: { channel, month, amount }
  return targets?.map(t => ({
    channel: t.channel_code,
    month: t.month.substring(0, 7) + '-01',
    amount: t.amount
  })) || [];
}
