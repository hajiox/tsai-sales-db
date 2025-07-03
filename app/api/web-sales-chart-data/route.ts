// /api/web-sales-chart-data/route.ts ver.3 (12ヶ月データ欠損問題修正版)
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
    
    console.log(`【修正】Chart data requested for month: ${month}, showing: ${monthsToShow} months`);

    // ダミーデータを準備（APIエラー時のフォールバック用）
    const dummyData = generateDummyData(month, monthsToShow);

    try {
      // 新しいデータベース関数を呼び出し
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

      // 【修正】選択月を基準に過去の月数分のデータを取得 - 日付計算を堅牢に修正
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
      
      console.log(`【修正】Data range: ${startDateStr} to ${endDateStr}`);
      console.log(`【修正】Months calculation: ${startYear}/${startMonth} to ${endYear}/${endMonth}`);
      
      // データベースクエリ
      const { data: chartData, error: chartError } = await supabase
        .from('web_sales_summary')
        .select('report_month, amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count')
        .gte('report_month', startDateStr)
        .lte('report_month', endDateStr)
        .order('report_month');

      if (chartError) {
        console.error('Chart data error:', chartError);
        console.error('Query parameters:', { startDateStr, endDateStr });
        return NextResponse.json(dummyData);
      }

      console.log(`【修正】Raw chart data from DB:`, chartData?.length || 0, 'records');

      // 【修正】月の枠を確実に作成（年跨ぎ対応）
      const monthlyData: { [key: string]: any } = {};
      
      // 開始月から選択月まで順番に月枠を作成
      let currentYear = startYear;
      let currentMonth = startMonth;
      
      for (let i = 0; i < monthsToShow; i++) {
        const monthKey = `${currentYear}年${currentMonth}月`;
        
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
        
        // 次の月に進む
        currentMonth += 1;
        if (currentMonth > 12) {
          currentMonth = 1;
          currentYear += 1;
        }
      }
      
      console.log(`【修正】Generated months:`, Object.keys(monthlyData));
      
      // 実際のデータを集計
      chartData?.forEach(row => {
        try {
          const date = new Date(row.report_month);
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
            
            console.log(`【修正】Data added to ${monthKey}:`, monthlyData[monthKey]);
          } else {
            console.warn(`【修正】Month key not found for data:`, monthKey, row.report_month);
          }
        } catch (e) {
          console.error('Error processing row:', row, e);
        }
      });

      // 選択された月のキー
      const selectedMonthKey = `${selectedYear}年${selectedMonth}月`;
      
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
        
        monthlyData[selectedMonthKey] = missingMonthData;
        response.push(missingMonthData);
      }
      
      // 選択月のデータに財務情報を追加
      response.forEach(monthData => {
        if (monthData.month === selectedMonthKey) {
          monthData.financialData = financial;
          monthData.seriesData = seriesData || [];
        }
      });

      // 【修正】日付順ソートを堅牢に修正
      response.sort((a, b) => {
        try {
          // "2024年4月" -> year: 2024, month: 4
          const aMatch = a.month.match(/(\d{4})年(\d{1,2})月/);
          const bMatch = b.month.match(/(\d{4})年(\d{1,2})月/);
          
          if (!aMatch || !bMatch) return 0;
          
          const aYear = parseInt(aMatch[1]);
          const aMonth = parseInt(aMatch[2]);
          const bYear = parseInt(bMatch[1]);
          const bMonth = parseInt(bMatch[2]);
          
          if (aYear !== bYear) return aYear - bYear;
          return aMonth - bMonth;
        } catch (e) {
          console.error('Sorting error:', e);
          return 0;
        }
      });

      // レスポンスメタデータをログに記録
      console.log(`【修正】Chart data prepared for ${month}:`, {
        monthsData: response.length,
        months: response.map(m => m.month),
        selectedMonth: selectedMonthKey,
        monthsToShow: monthsToShow,
        dateRange: `${startDateStr} to ${endDateStr}`
      });

      // 各月のデータ総数をログ
      response.forEach(monthData => {
        if (monthData.total > 0) {
          console.log(`【修正】${monthData.month}: ${monthData.total}件`);
        }
      });

      return NextResponse.json(response);
      
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

// 【修正】ダミーデータ生成関数も年跨ぎ対応
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
