// /api/web-sales-chart-data/route.ts ver.1 (12ヶ月表示対応)
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7); // YYYY-MM format
    const monthsToShow = searchParams.get('months') === '12' ? 12 : 6; // 6か12ヶ月表示
    
    // URLにmonthsパラメータがある場合、それを使用する
    // 例: ?months=12 (12ヶ月表示) or ?months=6 (6ヶ月表示、デフォルト)
    
    console.log(`Chart data requested for month: ${month}, showing: ${monthsToShow} months`);

    // 新しいデータベース関数を呼び出し
    const { data: financialData, error: financialError } = await supabase
      .rpc('get_monthly_financial_summary', { target_month: month });

    if (financialError) {
      console.error('Financial data error:', financialError);
      return NextResponse.json({ error: 'Financial data error' }, { status: 500 });
    }

    const { data: seriesData, error: seriesError } = await supabase
      .rpc('get_monthly_series_summary', { target_month: month });

    if (seriesError) {
      console.error('Series data error:', seriesError);
      return NextResponse.json({ error: 'Series data error' }, { status: 500 });
    }

    // 選択月を基準に過去の月数分のデータを取得
    const selectedDate = new Date(`${month}-01`);
    const startDate = new Date(selectedDate);
    startDate.setMonth(startDate.getMonth() - (monthsToShow - 1)); // 選択月を含め指定月数分
    
    const endDate = new Date(selectedDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0); // 選択月の末日
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`Data range: ${startDateStr} to ${endDateStr}`);
    
    const { data: chartData, error: chartError } = await supabase
      .from('web_sales_summary')
      .select(`
        report_month,
        amazon_count,
        rakuten_count,
        yahoo_count,
        mercari_count,
        base_count,
        qoo10_count
      `)
      .gte('report_month', startDateStr)
      .lte('report_month', endDateStr)
      .order('report_month', { ascending: true });

    if (chartError) {
      console.error('Chart data error:', chartError);
      return NextResponse.json({ error: 'Chart data error' }, { status: 500 });
    }

    // 選択月を含む過去の月数分の枠を作成
    const monthlyData: { [key: string]: any } = {};
    
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const date = new Date(selectedDate);
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      
      monthlyData[monthKey] = {
        month: monthKey,
        amazon: 0,
        rakuten: 0,
        yahoo: 0,
        mercari: 0,
        base: 0,
        qoo10: 0,
        total: 0
      };
    }
    
    // 実際のデータを集計
    chartData?.forEach(row => {
      const date = new Date(row.report_month + 'T00:00:00');
      const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].amazon += row.amazon_count || 0;
        monthlyData[monthKey].rakuten += row.rakuten_count || 0;
        monthlyData[monthKey].yahoo += row.yahoo_count || 0;
        monthlyData[monthKey].mercari += row.mercari_count || 0;
        monthlyData[monthKey].base += row.base_count || 0;
        monthlyData[monthKey].qoo10 += row.qoo10_count || 0;
        
        monthlyData[monthKey].total = 
          monthlyData[monthKey].amazon + 
          monthlyData[monthKey].rakuten + 
          monthlyData[monthKey].yahoo + 
          monthlyData[monthKey].mercari + 
          monthlyData[monthKey].base + 
          monthlyData[monthKey].qoo10;
      }
    });

    // 選択された月のキー
    const selectedMonthKey = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`;
    
    // 既存フロントエンドとの互換性を保つレスポンス構造
    const financial = financialData?.[0] || {};
    const response = Object.values(monthlyData);
    
    // 選択月にデータが存在しない場合、DBから取得した情報で追加
    if (!monthlyData[selectedMonthKey]?.total && financial.total_count) {
      const missingMonthData = {
        month: selectedMonthKey,
        amazon: financial.amazon_count || 0,
        rakuten: financial.rakuten_count || 0,
        yahoo: financial.yahoo_count || 0,
        mercari: financial.mercari_count || 0,
        base: financial.base_count || 0,
        qoo10: financial.qoo10_count || 0,
        total: financial.total_count || 0
      };
      
      // 既存のmonthlyDataに追加
      monthlyData[selectedMonthKey] = missingMonthData;
      
      // responseを更新
      response.push(missingMonthData);
    }
    
    // 選択月のデータに財務情報を追加
    response.forEach(monthData => {
      if (monthData.month === selectedMonthKey) {
        monthData.financialData = financial;
        monthData.seriesData = seriesData || [];
      }
    });

    // 日付順にソート
    response.sort((a, b) => {
      const aYear = parseInt(a.month.substring(0, 4));
      const aMonth = parseInt(a.month.substring(5, a.month.length - 1));
      
      const bYear = parseInt(b.month.substring(0, 4));
      const bMonth = parseInt(b.month.substring(5, b.month.length - 1));
      
      if (aYear !== bYear) return aYear - bYear;
      return aMonth - bMonth;
    });

    // レスポンスメタデータをログに記録
    console.log(`Chart data prepared for ${month}:`, {
      monthsData: response.length,
      months: response.map(m => m.month),
      selectedMonth: selectedMonthKey,
      monthsToShow: monthsToShow
    });

    // 重要: 既存のフロントエンドコードとの互換性を保つために配列を直接返す
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
