import { requireRecipeAdminRequest } from "@/lib/recipe-request-auth";
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WEB_SALES_CHANNELS, resolveWebSalesAmount, sumWebSalesAmounts } from '@/lib/web-sales-amounts';

export const dynamic = 'force-dynamic';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set'); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set'); })()
);

export async function POST(req: Request) {
  const authError = await requireRecipeAdminRequest(req);
  if (authError) return authError;
  try {
    const { base_month, period_months } = await req.json();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(base_month) || !Number.isInteger(period_months) || period_months < 1 || period_months > 120) {
      return NextResponse.json({ error: '対象月と集計期間が正しくありません' }, { status: 400 });
    }
    const [year, month] = base_month.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - period_months, 1));
    const startMonth = start.toISOString().slice(0, 10);
    const productsResult = await supabase.from('products').select('id,series');
    if (productsResult.error) throw productsResult.error;
    const products = new Map((productsResult.data || []).map(row => [row.id, row]));
    const sales: Record<string, any>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await supabase.from('web_sales_summary').select('*')
        .gte('report_month', startMonth).lte('report_month', `${base_month}-01`)
        .order('report_month').order('product_id').range(offset, offset + 999);
      if (result.error) throw result.error;
      sales.push(...(result.data || []));
      if ((result.data?.length || 0) < 1000) break;
    }
    const totals = Object.fromEntries(WEB_SALES_CHANNELS.map(channel => [channel, { count: 0, amount: 0 as number | null, missingAmountRows: 0 }]));
    const series = new Map<string, { count: number; sales: number | null; missingAmountRows: number }>();
    for (const row of sales) {
      let count = 0;
      for (const channel of WEB_SALES_CHANNELS) {
        const quantity = Number(row[`${channel}_count`] || 0);
        const amount = resolveWebSalesAmount(row, channel);
        count += quantity;
        totals[channel].count += quantity;
        totals[channel].amount = totals[channel].amount === null || amount === null ? null : totals[channel].amount! + amount;
        if (amount === null) totals[channel].missingAmountRows++;
      }
      const name = products.get(row.product_id)?.series || '未分類';
      const entry = series.get(name) || { count: 0, sales: 0 as number | null, missingAmountRows: 0 };
      const amount = sumWebSalesAmounts(row);
      entry.count += count;
      entry.sales = entry.sales === null || amount === null ? null : entry.sales + amount;
      if (amount === null) entry.missingAmountRows++;
      series.set(name, entry);
    }
    const seriesSummary = Array.from(series.entries()).map(([seriesName, row]) => ({ seriesName, ...row }))
      .sort((a, b) => (b.sales ?? -1) - (a.sales ?? -1));
    return NextResponse.json({ totals, seriesSummary });
  } catch (error) {
    console.error('期間集計APIエラー:', error);
    return NextResponse.json({ error: '期間実績を取得できませんでした' }, { status: 500 });
  }
}
