
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
  salesActivity: {
    month: string;
    target: number;
    actual: number;
  }[];
  manufacturing: {
    month: string;
    target: number;
    actual: number;
    lastYear: number;
  }[];
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
    const [webRows, wholesaleRows, storeRows, shokuRows, manualRows] = await Promise.all([
      fetchWebSalesRPC(queryStart, queryEnd),
      fetchWholesaleSalesRPC(queryStart, queryEnd),
      fetchStoreSalesRPC(queryStart, queryEnd),
      fetchShokuSalesRPC(queryStart, queryEnd),
      fetchTargets(queryStart, queryEnd)
    ]);

    // Lookup Maps - Sales
    const webMap = new Map(webRows.map(r => [r.month, Number(r.amount)]));
    const wholesaleMap = new Map(wholesaleRows.map(r => [r.month, Number(r.amount)]));
    const storeMap = new Map(storeRows.map(r => [r.month, Number(r.amount)]));
    const shokuMap = new Map(shokuRows.map(r => [r.month, Number(r.amount)]));

    // Lookup Maps - Manual Entries (Targets, Acquisition, Manufacturing, Historical)
    const targetMap = new Map();
    const acquisitionTargetMap = new Map();
    const acquisitionActualMap = new Map();
    // Manufacturing
    const manufacturingTargetMap = new Map();
    const manufacturingActualMap = new Map();
    const historicalActualMap = new Map(); // key: channel_month


    manualRows.forEach(r => {
      if (r.metric === 'target') {
        targetMap.set(`${r.channel}_${r.month}`, r.amount);
      } else if (r.metric === 'acquisition_target') {
        acquisitionTargetMap.set(r.month, r.amount);
      } else if (r.metric === 'acquisition_actual') {
        acquisitionActualMap.set(r.month, r.amount);
      } else if (r.metric === 'manufacturing_target') {
        manufacturingTargetMap.set(r.month, r.amount);
      } else if (r.metric === 'manufacturing_actual') {
        manufacturingActualMap.set(r.month, r.amount);
      } else if (r.metric === 'historical_actual') {
        historicalActualMap.set(`${r.channel}_${r.month}`, r.amount);
      }
    });

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

        // Priority: Seeded historical data > Calculated from sales_v1
        const seededHist = historicalActualMap.get(`${channel}_${lastYearMonth}`);
        const lastYearAmount = seededHist !== undefined ? seededHist : getAmount(channel, lastYearMonth);

        return {
          month,
          actual: getAmount(channel, month),
          target: targetMap.get(`${channel}_${month}`) || 0,
          lastYear: lastYearAmount,
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

    const salesActivity = fyMonths.map(month => ({
      month,
      target: acquisitionTargetMap.get(month) || 0,
      actual: acquisitionActualMap.get(month) || 0
    }));

    const manufacturing = fyMonths.map(month => {
      const lastYearMonth = format(subYears(parseISO(month), 1), 'yyyy-MM-01');
      return {
        month,
        target: manufacturingTargetMap.get(month) || 0,
        actual: manufacturingActualMap.get(month) || 0,
        lastYear: manufacturingActualMap.get(lastYearMonth) || 0
      };
    });

    return {
      fiscalYear,
      months: fyMonths,
      channels: resultChannels,
      total,
      salesActivity,
      manufacturing
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

export async function saveKpiTarget(data: { metric?: string, channel: string, month: string, amount: number }) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('kpi_manual_entries_v1')
    .upsert({
      metric: data.metric || 'target',
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

async function fetchTargets(start: string, end: string) {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('get_kpi_manual_entries', {
    start_date: start,
    end_date: end
  });

  if (error) throw error;

  return (data as { metric: string, channel_code: string, month: string, amount: number }[]).map(t => ({
    metric: t.metric,
    channel: t.channel_code,
    month: t.month,
    amount: t.amount
  })) || [];
}
