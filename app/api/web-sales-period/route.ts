import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { base_month, period_months } = await req.json();
    
    console.log('Period API called:', { base_month, period_months });
    
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

    console.log('Date range:', { startMonth, endMonth });

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
        qoo10_count
      `)
      .gte('report_month', startMonth)
      .lte('report_month', endMonth);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    console.log('Sales data count:', data?.length || 0);

    // 商品マスタを別途取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, series_code');

    if (productsError) {
      console.error('Products error:', productsError);
      return NextResponse.json({ error: 'Products error' }, { status: 500 });
    }

    console.log('Products count:', products?.length || 0);

    // 商品マスタをMapに変換
    const productsMap = new Map(products?.map(p => [p.id, p]) || []);

    // シリーズマスタを取得
    const { data: seriesMaster, error: seriesError } = await supabase
      .from('series_master')
      .select('series_id, series_name');

    if (seriesError) {
      console.error('Series master error:', seriesError);
      return NextResponse.json({ error: 'Series master error' }, { status: 500 });
    }

    const seriesMap = new Map(seriesMaster?.map(s => [s.series_id, s.series_name]) || []);

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
      const product = productsMap.get(row.product_id);
      if (!product) return;
      
      const price = product.price || 0;
      const seriesId = product.series_code;
      const seriesName = seriesMap.get(seriesId) || '未分類';

      // ECサイト別集計
      const siteKeys = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];
      let rowTotalCount = 0;
      
      siteKeys.forEach(site => {
        const count = row[site] || 0;
        siteData[site as keyof typeof siteData] += count;
        siteAmount[site as keyof typeof siteAmount] += count * price;
        rowTotalCount += count;
      });

      // シリーズ別集計
      const totalAmount = rowTotalCount * price;

      if (!seriesData.has(seriesName)) {
        seriesData.set(seriesName, { count: 0, sales: 0 });
      }
      const existing = seriesData.get(seriesName);
      existing.count += rowTotalCount;
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

    console.log('Final result:', { totals, seriesSummaryCount: seriesSummary.length });

    return NextResponse.json({
      totals,
      seriesSummary,
      period: `${period_months}ヶ月間`,
      base_month
    });

  } catch (error: any) {
    console.error('Period API error:', error);
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
