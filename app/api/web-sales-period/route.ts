// /app/api/web-sales-period/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Supabaseクライアントを初期化
// Vercelの環境変数から自動で読み込まれます
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { base_month, period_months } = await req.json(); // 例: base_month: '2025-06', period_months: 6

    if (!base_month || !period_months) {
      return NextResponse.json({ error: 'base_month and period_months are required' }, { status: 400 });
    }

    // 1. 期間の開始月と終了月を計算
    const baseDate = new Date(`${base_month}-01T00:00:00Z`); // UTCで処理
    
    // 終了日を計算（指定月の末日）
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

    // 開始日を計算
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - (period_months - 1), 1);
    
    const startDateString = startDate.toISOString().split('T')[0]; // 'YYYY-MM-DD'
    const endDateString = endDate.toISOString().split('T')[0];   // 'YYYY-MM-DD'

    // 2. データベースから期間内のデータを取得
    // web_sales_summaryとproductsを結合して取得します
    const { data, error } = await supabase
      .from('web_sales_summary')
      .select(`
        amazon_count, rakuten_count, yahoo_count, 
        mercari_count, base_count, qoo10_count,
        products (
          name,
          series,
          price
        )
      `)
      .gte('report_date', startDateString) // report_dateが期間の開始日以降
      .lte('report_date', endDateString);  // report_dateが期間の終了日以前

    if (error) {
      console.error('Supabase query error:', error);
      throw new Error(error.message);
    }
    
    if (!data) {
        return NextResponse.json({ totals: {}, seriesSummary: [] });
    }

    // 3. 取得したデータを集計
    // 3-1. ECサイト別サマリーの計算
    const totals = data.reduce((acc, sale) => {
        const productPrice = sale.products?.price || 0;
        acc.amazon_count.count += sale.amazon_count || 0;
        acc.amazon_count.amount += (sale.amazon_count || 0) * productPrice;
        acc.rakuten_count.count += sale.rakuten_count || 0;
        acc.rakuten_count.amount += (sale.rakuten_count || 0) * productPrice;
        acc.yahoo_count.count += sale.yahoo_count || 0;
        acc.yahoo_count.amount += (sale.yahoo_count || 0) * productPrice;
        acc.mercari_count.count += sale.mercari_count || 0;
        acc.mercari_count.amount += (sale.mercari_count || 0) * productPrice;
        acc.base_count.count += sale.base_count || 0;
        acc.base_count.amount += (sale.base_count || 0) * productPrice;
        acc.qoo10_count.count += sale.qoo10_count || 0;
        acc.qoo10_count.amount += (sale.qoo10_count || 0) * productPrice;
        return acc;
    }, {
        amazon_count: { count: 0, amount: 0 },
        rakuten_count: { count: 0, amount: 0 },
        yahoo_count: { count: 0, amount: 0 },
        mercari_count: { count: 0, amount: 0 },
        base_count: { count: 0, amount: 0 },
        qoo10_count: { count: 0, amount: 0 },
    });

    // 3-2. シリーズ別サマリーの計算
    const seriesData: { [key: string]: { count: number; sales: number } } = {};
    data.forEach(sale => {
        const seriesName = sale.products?.series || '未分類';
        const productPrice = sale.products?.price || 0;
        const totalCount = (sale.amazon_count || 0) + (sale.rakuten_count || 0) + (sale.yahoo_count || 0) + (sale.mercari_count || 0) + (sale.base_count || 0) + (sale.qoo10_count || 0);
        
        if (!seriesData[seriesName]) {
            seriesData[seriesName] = { count: 0, sales: 0 };
        }
        seriesData[seriesName].count += totalCount;
        seriesData[seriesName].sales += totalCount * productPrice;
    });

    const seriesSummary = Object.keys(seriesData).map(seriesName => ({
        seriesName,
        ...seriesData[seriesName]
    })).sort((a, b) => b.sales - a.sales); // 売上順にソート

    return NextResponse.json({
      totals,
      seriesSummary
    });

  } catch (error: any) {
    console.error('期間集計APIで予期せぬエラー:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
