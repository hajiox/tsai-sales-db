
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

// Helper to fetch ALL rows (pagination)
async function fetchAll(supabase: any, table: string, queryModifier?: (query: any) => any, schema?: string) {
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    let query = schema
      ? supabase.schema(schema).from(table).select('*')
      : supabase.from(table).select('*');

    if (queryModifier) {
      query = queryModifier(query);
    }

    // Add pagination
    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return allData;
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
// Fetchers (Supabase + JS Aggregation + Pagination)
// ----------------------------------------------------------------------

async function fetchWebSales(start: string, end: string) {
  const supabase = getSupabase();

  // 1. Fetch ALL Products (to ensure price map is complete)
  const products = await fetchAll(supabase, 'products', (q) => q.select('id, price'));
  const priceMap = new Map(products.map((p: any) => [p.id, p.price || 0]));

  // 2. Fetch ALL Summary
  const summary = await fetchAll(supabase, 'web_sales_summary', (q) =>
    q.select('report_month, product_id, amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count, tiktok_count')
      .gte('report_month', start)
      .lt('report_month', end)
  );

  // 3. Aggregate
  const monthMap = new Map<string, number>();

  summary.forEach((row: any) => {
    const month = row.report_month.substring(0, 7) + '-01';
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

  // Wholesale: Fetch ALL
  const wholesale = await fetchAll(supabase, 'wholesale_sales', (q) =>
    q.select('sale_date, quantity, unit_price')
      .gte('sale_date', start)
      .lt('sale_date', end)
  );

  // OEM: Fetch ALL
  const oem = await fetchAll(supabase, 'oem_sales', (q) =>
    q.select('sale_date, amount')
      .gte('sale_date', start)
      .lt('sale_date', end)
  );

  const monthMap = new Map<string, number>();

  wholesale.forEach((row: any) => {
    const month = row.sale_date.substring(0, 7) + '-01';
    const amount = (row.quantity || 0) * (row.unit_price || 0);
    monthMap.set(month, (monthMap.get(month) || 0) + amount);
  });

  oem.forEach((row: any) => {
    const month = row.sale_date.substring(0, 7) + '-01';
    const amount = row.amount || 0;
    monthMap.set(month, (monthMap.get(month) || 0) + amount);
  });

  return Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));
}

async function fetchStoreSales(start: string, end: string) {
  const supabase = getSupabase();

  // Store Sales (Usually small, but good to use fetchAll for consistency)
  const sales = await fetchAll(supabase, 'brand_store_sales', (q) =>
    q.select('report_month, total_sales')
      .gte('report_month', start)
      .lt('report_month', end)
  );

  const adjustments = await fetchAll(supabase, 'brand_store_sales_adjustments', (q) =>
    q.select('report_month, adjustment_amount')
      .gte('report_month', start)
      .lt('report_month', end)
  );

  const monthMap = new Map<string, number>();

  sales.forEach((row: any) => {
    const month = row.report_month.substring(0, 7) + '-01';
    monthMap.set(month, (monthMap.get(month) || 0) + (row.total_sales || 0));
  });

  adjustments.forEach((row: any) => {
    const month = row.report_month.substring(0, 7) + '-01';
    monthMap.set(month, (monthMap.get(month) || 0) + (row.adjustment_amount || 0));
  });

  return Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));
}

async function fetchShokuSales(start: string, end: string) {
  const supabase = getSupabase();

  const sales = await fetchAll(supabase, 'food_store_sales', (q) =>
    q.select('report_month, total_sales')
      .gte('report_month', start)
      .lt('report_month', end)
  );

  const monthMap = new Map<string, number>();

  sales.forEach((row: any) => {
    const month = row.report_month.substring(0, 7) + '-01';
    monthMap.set(month, (monthMap.get(month) || 0) + (row.total_sales || 0));
  });

  return Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));
}

async function fetchTargets(start: string, end: string) {
  const supabase = getSupabase();

  const targets = await fetchAll(supabase, 'kpi_manual_entries_v1', (q) =>
    q.select('channel_code, month, amount')
      .eq('metric', 'target')
      .gte('month', start)
      .lt('month', end),
    'kpi'
  );

  return targets.map((t: any) => ({
    channel: t.channel_code,
    month: t.month.substring(0, 7) + '-01',
    amount: t.amount
  }));
}
