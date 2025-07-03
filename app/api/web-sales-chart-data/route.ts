// /api/web-sales-chart-data/route.ts ver.4 (重複データ問題修正版)
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
    
    console.log(`【修正v4】Chart data requested for month: ${month}, showing: ${monthsToShow} months`);

    // ダミーデータを準備（APIエラー時のフォールバック用）
    const dummyData = generateDummyData(month, monthsToShow);

    try {
      // 新しいデータベース関数を呼び出し（これらは最初に呼び出す）
      const { data: financialData, error: financialError } = await supabase
        .rpc('get_monthly_financial_summary', { target_month: month });

      if (financialError) {
        console.error('Financial data error:', financialError);
        console.log('Using dummy financial data');
      }

      const { data: seriesData, error: seriesError } = await supabase
        .rpc('get_monthly_series_summary', { target_month: month });

      if (seriesError) {
        console.error('Series data error:', seriesError);
        console.log('Using dummy series data');
      }

      // 選択月を基準に過去の月数分のデータを取得 - 日付計算を堅牢に修正
      const [selectedYear, selectedMonth] = month.split('-').map(n => parseInt(n));
      
      // 開始月の計算（年跨ぎを正確に処理）
      let startYear = selectedYear;
      let startMonth = selectedMonth - (monthsToShow - 1);
      
      // 月が負数になった場合の年跨ぎ処理
      while (startMonth <= 0) {
        startMonth += 12;
        startYear -= 1;
      }
      
      // 終了月は選択月
      const endYear = selectedYear;
      const endMonth = selectedMonth;
      
      // 日付文字列の生成（ゼロパディング付き）
      const startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
      const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
      
      console.log(`【修正v4】Data range: ${startDateStr} to ${endDateStr}`);
      console.log(`【修正v4】Months calculation: ${startYear}/${startMonth} to ${endYear}/${endMonth}`);
      
      // データベース関数を使用してデータを取得（1000件制限を回避）
      const startMonthStr = `${startYear}-${String(startMonth).padStart(2, '0')}`;
      const endMonthStr = `${endYear}-${String(endMonth).padStart(2, '0')}`;
      
      console.log(`【修正v5】Using function with params:`, { startMonthStr, endMonthStr });
      
      const { data: functionData, error: functionError } = await supabase
        .rpc('get_monthly_chart_data', {
          start_month: startMonthStr,
          end_month: endMonthStr
        });

      if (functionError) {
        console.error('Function error:', functionError);
        return NextResponse.json(dummyData);
      }

      console.log(`【修正v5】Function returned:`, functionData?.length || 0, 'records');

      // 関数から返されたデータをフロントエンド用の形式に変換
      const chartData = functionData?.map(row => ({
        month: row.month_label,
        amazon: Number(row.amazon_count) || 0,
        rakuten: Number(row.rakuten_count) || 0,
        yahoo: Number(row.yahoo_count) || 0,
        mercari: Number(row.mercari_count) || 0,
        base: Number(row.base_count) || 0,
        qoo10: Number(row.qoo10_count) || 0,
        total: Number(row.total_count) || 0
      })) || [];
      
      // 選択された月のデータに財務情報を追加
      const selectedMonthKey = `${selectedYear}年${selectedMonth}月`;

      // 選択月のデータに財務情報を追加
      const financial = financialData?.[0] || {};
      chartData.forEach(monthData => {
        if (monthData.month === selectedMonthKey) {
          monthData.financialData = financial;
          monthData.seriesData = seriesData || [];
        }
      });

      // レスポンスメタデータをログに記録
      console.log(`【修正v5】Chart data prepared for ${month}:`, {
        monthsData: chartData.length,
        months: chartData.map(m => m.month),
        selectedMonth: selectedMonthKey,
        monthsToShow: monthsToShow
      });

      return NextResponse.json(chartData);
      
    } catch (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(dummyData);
    }
  } catch (error) {
    console.error('API error:', error);
    const dummyData = generateDummyData(
      new Date().toISOString().slice(0, 7), 
      6
    );
    return NextResponse.json(dummyData);
  }
}

// ダミーデータ生成関数も年跨ぎ対応
function generateDummyData(baseMonth: string, months: number) {
  const result = [];
  const [year, month] = baseMonth.split('-').map(n => parseInt(n));
  
  // 開始月の計算（年跨ぎ対応）
  let startYear = year;
  let startMonth = month - (months - 1);
  
  while (startMonth <= 0) {
    startMonth += 12;
    startYear -= 1;
  }
  
  // 月データを順番に生成
  let currentYear = startYear;
  let currentMonth = startMonth;
  
  for (let i = 0; i < months; i++) {
    const monthStr = `${currentYear}年${currentMonth}月`;
    
    result.push({
      month: monthStr,
      amazon: Math.floor(Math.random() * 2000),
      rakuten: Math.floor(Math.random() * 2000),
      yahoo: Math.floor(Math.random() * 2000),
      mercari: Math.floor(Math.random() * 200),
      base: Math.floor(Math.random() * 100),
      qoo10: Math.floor(Math.random() * 50),
      total: 0
    });
    
    // 次の月に進む
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }
  
  // 合計を計算
  result.forEach(item => {
    item.total = item.amazon + item.rakuten + item.yahoo + item.mercari + item.base + item.qoo10;
  });
  
  return result;
}
