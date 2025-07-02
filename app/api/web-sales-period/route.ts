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

    // デバッグログ追加
    console.log('=== 期間集計開始 ===');
    console.log('基準月:', base_month);
    console.log('集計期間(月):', period_months);

    if (!base_month || !period_months) {
      console.error('必須パラメータが不足: base_month or period_months');
      return NextResponse.json({ error: 'base_month and period_months are required' }, { status: 400 });
    }

    // 1. 期間の開始月と終了月を計算
    const baseDate = new Date(`${base_month}-01T00:00:00Z`);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - (period_months - 1), 1);
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = endDate.toISOString().split('T')[0];

    // デバッグログ追加
    console.log('集計期間:', startDateString, 'から', endDateString);

    // 2. まず商品マスタの全データを取得し、IDをキーにしたマップを作成
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, series, price');

    if (productsError) {
      console.error('Supabase products query error:', productsError);
      throw new Error(`商品マスタの取得に失敗: ${productsError.message}`);
    }

    console.log('商品マスタ取得数:', productsData?.length || 0);
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

    // デバッグログ追加
    console.log('取得した販売データ数:', salesData?.length || 0);

    if (!salesData || salesData.length === 0) {
        console.warn('期間内の販売データが存在しません');
        return NextResponse.json({ totals: {}, seriesSummary: [] });
    }

    // 4. 取得した販売データを集計
    // ※ キー名を修正：amazon_count → amazon など
    const totals = {
        amazon: { count: 0, amount: 0 },
        rakuten: { count: 0, amount: 0 },
        yahoo: { count: 0, amount: 0 },
        mercari: { count: 0, amount: 0 },
        base: { count: 0, amount: 0 },
        qoo10: { count: 0, amount: 0 },
    };
    
    const seriesData: { [key: string]: { count: number; sales: number } } = {};

    for (const sale of salesData) {
        const product = productsMap.get(sale.product_id);
        if (!product) continue; // 商品マスタにないデータはスキップ

        const productPrice = product.price || 0;
        // ※ キー名を修正
        totals.amazon.count += sale.amazon_count || 0;
        totals.amazon.amount += (sale.amazon_count || 0) * productPrice;
        totals.rakuten.count += sale.rakuten_count || 0;
        totals.rakuten.amount += (sale.rakuten_count || 0) * productPrice;
        totals.yahoo.count += sale.yahoo_count || 0;
        totals.yahoo.amount += (sale.yahoo_count || 0) * productPrice;
        totals.mercari.count += sale.mercari_count || 0;
        totals.mercari.amount += (sale.mercari_count || 0) * productPrice;
        totals.base.count += sale.base_count || 0;
        totals.base.amount += (sale.base_count || 0) * productPrice;
        totals.qoo10.count += sale.qoo10_count || 0;
        totals.qoo10.amount += (sale.qoo10_count || 0) * productPrice;

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

    // デバッグログ追加
    console.log('集計結果:', {
      totalCount: Object.values(totals).reduce((sum, site) => sum + site.count, 0),
      totalAmount: Object.values(totals).reduce((sum, site) => sum + site.amount, 0),
      seriesSummaryCount: seriesSummary.length
    });

    // キー名の検証
    const expectedKeys = ['amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10'];
    const actualKeys = Object.keys(totals);
    const missingKeys = expectedKeys.filter(key => !actualKeys.includes(key));

    if (missingKeys.length > 0) {
      console.warn('警告: 期待されるキーが不足しています:', missingKeys);
    }

    // データの有無を確認
    const hasData = Object.values(totals).some(site => site.count > 0);
    console.log('データあり:', hasData);

    if (!hasData) {
      console.warn('集計結果が全て0です');
    }

    // トップ3シリーズのデータをログ
    const top3Series = seriesSummary.slice(0, 3);
    if (top3Series.length > 0) {
      console.log('トップ3シリーズ:', top3Series.map(s => `${s.seriesName}: ${s.count}個 ¥${s.sales}`).join(', '));
    }

    console.log('=== 期間集計終了 ===');

    return NextResponse.json({
      totals,
      seriesSummary
    });

  } catch (error: any) {
    console.error('期間集計APIで予期せぬエラー:', error);
    return NextResponse.json({ error: `サーバー内部でエラーが発生: ${error.message}` }, { status: 500 });
  }
}
