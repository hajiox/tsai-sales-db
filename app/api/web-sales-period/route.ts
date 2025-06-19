// /app/api/web-sales-period/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { base_month, period_months } = await req.json();

    if (!base_month || !period_months) {
      return NextResponse.json({ error: 'base_month and period_months are required' }, { status: 400 });
    }

    // 1. 期間の開始月と終了月を計算
    const baseDate = new Date(`${base_month}-01T00:00:00Z`);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - (period_months - 1), 1);
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = endDate.toISOString().split('T')[0];

    // 2. まず商品マスタの全データを取得し、IDをキーにしたマップを作成
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, series, price');

    if (productsError) {
      console.error('Supabase products query error:', productsError);
      throw new Error(`商品マスタの取得に失敗: ${productsError.message}`);
    }

    const productsMap = new Map(productsData.map(p => [p.id, p]));

    // 3. 期間内の販売実績データを取得
    const { data: salesData, error: salesError } = await supabase
      .from('web_sales_summary')
      .select('product_id, amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count')
      .gte('report_date', startDateString)
      .lte('report_date', endDateString);

    if (salesError) {
      console.error('Supabase sales query error:', salesError);
      throw new Error(`販売実績の取得に失敗: ${salesError.message}`);
    }

    if (!salesData) {
        return NextResponse.json({ totals: {}, seriesSummary: [] });
    }

    // 4. 取得した販売データを集計
    const totals = {
        amazon_count: { count: 0, amount: 0 },
        rakuten_count: { count: 0, amount: 0 },
        yahoo_count: { count: 0, amount: 0 },
        mercari_count: { count: 0, amount: 0 },
        base_count: { count: 0, amount: 0 },
        qoo10_count: { count: 0, amount: 0 },
    };
    const seriesData: { [key: string]: { count: number; sales: number } } = {};

    for (const sale of salesData) {
        const product = productsMap.get(sale.product_id);
        if (!product) continue; // 商品マスタにないデータはスキップ

        const productPrice = product.price || 0;
        totals.amazon_count.count += sale.amazon_count || 0;
        totals.amazon_count.amount += (sale.amazon_count || 0) * productPrice;
        totals.rakuten_count.count += sale.rakuten_count || 0;
        totals.rakuten_count.amount += (sale.rakuten_count || 0) * productPrice;
        totals.yahoo_count.count += sale.yahoo_count || 0;
        totals.yahoo_count.amount += (sale.yahoo_count || 0) * productPrice;
        totals.mercari_count.count += sale.mercari_count || 0;
        totals.mercari_count.amount += (sale.mercari_count || 0) * productPrice;
        totals.base_count.count += sale.base_count || 0;
        totals.base_count.amount += (sale.base_count || 0) * productPrice;
        totals.qoo10_count.count += sale.qoo10_count || 0;
        totals.qoo10_count.amount += (sale.qoo10_count || 0) * productPrice;

        const seriesName = product.series || '未分類';
        const totalCount = (sale.amazon_count || 0) + (sale.rakuten_count || 0) + (sale.yahoo_count || 0) + (sale.mercari_count || 0) + (sale.base_count || 0) + (sale.qoo10_count || 0);
        
        if (!seriesData[seriesName]) {
            seriesData[seriesName] = { count: 0, sales: 0 };
        }
        seriesData[seriesName].count += totalCount;
        seriesData[seriesName].sales += totalCount * productPrice;
    }

    const seriesSummary = Object.keys(seriesData).map(seriesName => ({
        seriesName,
        ...seriesData[seriesName]
    })).sort((a, b) => b.sales - a.sales);

    return NextResponse.json({
      totals,
      seriesSummary
    });

  } catch (error: any) {
    console.error('期間集計APIで予期せぬエラー:', error);
    return NextResponse.json({ error: `サーバー内部でエラーが発生: ${error.message}` }, { status: 500 });
  }
}
