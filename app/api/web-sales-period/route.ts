import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { base_month, period_months } = await req.json();
    
    if (!base_month || !period_months) {
      return NextResponse.json({ error: 'base_month and period_months required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 基準月から期間分遡った開始月を計算
    const baseDate = new Date(base_month + '-01');
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - (period_months - 1), 1);
    const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;
    const endMonth = base_month + '-31';

    // 期間内のデータを取得
    const { data, error } = await supabase
      .from('web_sales_summary')
      .select(`
        product_id,
        report_month,
        amazon_count,
        rakuten_count,
        yahoo_count,
        mercari_count,
        base_count,
        qoo10_count,
        products!inner(name, price, series_code)
      `)
      .gte('report_month', startMonth)
      .lte('report_month', endMonth);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // シリーズマスタを取得
    const { data: seriesMaster, error: seriesError } = await supabase
      .from('series_master')
      .select('series_id, series_name');

    if (seriesError) {
      console.error('Series master error:', seriesError);
      return NextResponse.json({ error: 'Series master error' }, { status: 500 });
    }

    const seriesMap = new Map(seriesMaster.map(s => [s.series_id, s.series_name]));

    // ECサイト別集計
    const siteData = {
      amazon_count: 0,
      rakuten_count: 0,
      yahoo_count: 0,
      mercari_count: 0,
      base_count: 0,
      qoo10_count: 0
    };

    const siteAmount = {
      amazon_count: 0,
      rakuten_count: 0,
      yahoo_count: 0,
      mercari_count: 0,
      base_count: 0,
      qoo10_count: 0
    };

    // シリーズ別集計
    const seriesData = new Map();

    data?.forEach((row: any) => {
      const price = row.products?.price || 0;
      const seriesId = row.products?.series_code;
      const seriesName = seriesMap.get(seriesId) || '未分類';

      // ECサイト別集計
      Object.keys(siteData).forEach(site => {
        const count = row[site] || 0;
        siteData[site as keyof typeof siteData] += count;
        siteAmount[site as keyof typeof siteAmount] += count * price;
      });

      // シリーズ別集計
      const totalCount = Object.keys(siteData).reduce((sum, site) => sum + (row[site] || 0), 0);
      const totalAmount = totalCount * price;

      if (!seriesData.has(seriesName)) {
        seriesData.set(seriesName, { count: 0, sales: 0 });
      }
      const existing = seriesData.get(seriesName);
      existing.count += totalCount;
      existing.sales += totalAmount;
    });

    // レスポンス形式を統一
    const totals: any = {};
    Object.keys(siteData).forEach(site => {
      totals[site] = {
        count: siteData[site as keyof typeof siteData],
        amount: siteAmount[site as keyof typeof siteAmount]
      };
    });

    const seriesSummary = Array.from(seriesData.entries())
      .map(([seriesName, data]: [string, any]) => ({
        seriesName,
        count: data.count,
        sales: data.sales
      }))
      .sort((a, b) => b.sales - a.sales);

    return NextResponse.json({
      totals,
      seriesSummary,
      period: `${period_months}ヶ月間`,
      base_month
    });

  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
