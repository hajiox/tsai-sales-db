// /app/api/web-sales-period/route.ts ver.3 (report_month列名修正版)
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

    // 【修正】期間の開始月と終了月を計算 - 年跨ぎ対応
    const [baseYear, baseMonth] = base_month.split('-').map(n => parseInt(n));
    
    // 開始月の計算（年跨ぎ対応）
    let startYear = baseYear;
    let startMonth = baseMonth - (period_months - 1);
    
    while (startMonth <= 0) {
      startMonth += 12;
      startYear -= 1;
    }
    
    // 終了月は基準月
    const endYear = baseYear;
    const endMonth = baseMonth;
    
    // 日付文字列の生成（月の1日で統一）
    const startDateString = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    const endDateString = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    // デバッグログ追加
    console.log('【修正】集計期間:', startDateString, 'から', endDateString);
    console.log('【修正】期間計算:', `${startYear}/${startMonth} to ${endYear}/${endMonth}`);

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

    // 【修正】3. 期間内の販売実績データを取得 - report_month列を使用
    const { data: salesData, error: salesError } = await supabase
      .from('web_sales_summary')
      .select('product_id, amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count, report_month')
      .gte('report_month', startDateString)
      .lte('report_month', endDateString);

    if (salesError) {
      console.error('Supabase sales query error:', salesError);
      throw new Error(`販売実績の取得に失敗: ${salesError.message}`);
    }

    // デバッグログ追加
    console.log('【修正】取得した販売データ数:', salesData?.length || 0);
    console.log('【修正】取得データサンプル:', salesData?.slice(0, 3));

    if (!salesData || salesData.length === 0) {
        console.warn('期間内の販売データが存在しません');
        return NextResponse.json({ totals: {}, seriesSummary: [] });
    }

    // 4. 取得した販売データを集計
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
        if (!product) {
          console.warn('商品マスタにない商品ID:', sale.product_id);
          continue; // 商品マスタにないデータはスキップ
        }

        const productPrice = product.price || 0;
        
        // 各チャネルの集計
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

        // シリーズ別集計
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

    // 【修正】デバッグログ追加 - 詳細な集計結果
    const totalCount = Object.values(totals).reduce((sum, site) => sum + site.count, 0);
    const totalAmount = Object.values(totals).reduce((sum, site) => sum + site.amount, 0);
    
    console.log('【修正】各チャネル集計結果:');
    Object.entries(totals).forEach(([channel, data]) => {
      console.log(`  ${channel}: ${data.count}件 ¥${data.amount.toLocaleString()}`);
    });
    
    console.log('【修正】全体集計結果:', {
      totalCount,
      totalAmount: totalAmount.toLocaleString(),
      seriesSummaryCount: seriesSummary.length
    });

    // データの有無を確認
    const hasData = Object.values(totals).some(site => site.count > 0);
    console.log('【修正】データあり:', hasData);

    if (!hasData) {
      console.warn('集計結果が全て0です - データベースクエリを確認してください');
    }

    // トップ3シリーズのデータをログ
    const top3Series = seriesSummary.slice(0, 3);
    if (top3Series.length > 0) {
      console.log('【修正】トップ3シリーズ:', top3Series.map(s => `${s.seriesName}: ${s.count}個 ¥${s.sales.toLocaleString()}`).join(', '));
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
