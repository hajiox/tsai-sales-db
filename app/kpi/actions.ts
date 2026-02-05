
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
      fetchWebSalesRPC(queryStart, queryEnd),
      fetchWholesaleSalesRPC(queryStart, queryEnd),
      fetchStoreSalesRPC(queryStart, queryEnd),
      fetchShokuSalesRPC(queryStart, queryEnd),
      fetchTargets(queryStart, queryEnd)
    ]);

    // Lookup Maps
    const webMap = new Map(webRows.map(r => [r.month, Number(r.amount)]));
    const wholesaleMap = new Map(wholesaleRows.map(r => [r.month, Number(r.amount)]));
    const storeMap = new Map(storeRows.map(r => [r.month, Number(r.amount)]));
    const shokuMap = new Map(shokuRows.map(r => [r.month, Number(r.amount)]));
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
  } catch (error: any) {
    console.error('Data Fetch Error Details:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      fullUser: error
    });
    throw new Error(`データの取得に失敗しました: ${error?.message || '不明なエラー'}`);
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
// Fetchers (RPC)
// ----------------------------------------------------------------------

async function fetchWebSalesRPC(start: string, end: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_web_sales_monthly', {
    start_date: start,
    end_date: end
  });
  if (error) throw error;
  return (data as { month: string, amount: number }[]) || [];
}

async function fetchWholesaleSalesRPC(start: string, end: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_wholesale_sales_monthly', {
    start_date: start,
    end_date: end
  });
  if (error) throw error;
  return (data as { month: string, amount: number }[]) || [];
}

async function fetchStoreSalesRPC(start: string, end: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_store_sales_monthly', {
    start_date: start,
    end_date: end
  });
  if (error) throw error;
  return (data as { month: string, amount: number }[]) || [];
}

async function fetchShokuSalesRPC(start: string, end: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_shoku_sales_monthly', {
    start_date: start,
    end_date: end
  });
  if (error) throw error;
  return (data as { month: string, amount: number }[]) || [];
}

// Targets - still small, so direct fetch is fine. But use recursive helper just in case.
// Actually, targets are extremely small (12 mos * 4 channels * 3 years = 144 rows), no pagination needed.
async function fetchTargets(start: string, end: string) {
  const supabase = getSupabase();

  const { data: targets, error } = await supabase
    .schema('kpi')
    .from('kpi_manual_entries_v1')
    .select('channel_code, month, amount')
    .eq('metric', 'target')
    .gte('month', start)
    .lt('month', end);

  if (error) throw error;

  return targets?.map(t => ({
    channel: t.channel_code,
    month: t.month.substring(0, 7) + '-01',
    amount: t.amount
  })) || [];
}
