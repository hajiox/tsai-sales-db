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
      
      // データベースクエリ - rangeを使用して全データ取得
      const { data: chartData, error: chartError } = await supabase
        .from('web_sales_summary')
        .select('report_month, amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count')
        .gte('report_month', startDateStr)
        .lte('report_month', endDateStr)
        .order('report_month')
        .range(0, 9999); // 明示的に大きな範囲を指定

      if (chartError) {
        console.error('Chart data error:', chartError);
        console.error('Query parameters:', { startDateStr, endDateStr });
        return NextResponse.json(dummyData);
      }

      console.log(`【修正v4】Raw chart data from DB:`, chartData?.length || 0, 'records');
      
      // 月別のデータ分布を確認
      const monthDistribution: { [key: string]: number } = {};
      chartData?.forEach(row => {
        const monthKey = row.report_month.substring(0, 7); // YYYY-MM形式
        monthDistribution[monthKey] = (monthDistribution[monthKey] || 0) + 1;
      });
      
      console.log('【修正v4】月別データ分布:');
      Object.keys(monthDistribution).sort().forEach(month => {
        console.log(`【修正v4】${month}: ${monthDistribution[month]}件`);
      });
      
      // 2025年2-4月のデータが存在するか確認
      const feb2025Data = chartData?.filter(row => row.report_month.startsWith('2025-02'));
      const mar2025Data = chartData?.filter(row => row.report_month.startsWith('2025-03'));
      const apr2025Data = chartData?.filter(row => row.report_month.startsWith('2025-04'));
      
      console.log(`【修正v4】2025年2月データ数:`, feb2025Data?.length || 0);
      console.log(`【修正v4】2025年3月データ数:`, mar2025Data?.length || 0);
      console.log(`【修正v4】2025年4月データ数:`, apr2025Data?.length || 0);
      
      if (feb2025Data?.length > 0) {
        console.log(`【修正v4】2025年2月サンプル:`, feb2025Data[0]);
      }

      // 月の枠を確実に作成（年跨ぎ対応）
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
      
      console.log(`【修正v4】Generated months:`, Object.keys(monthlyData));
      
      // 実際のデータを集計
      chartData?.forEach(row => {
        try {
          const date = new Date(row.report_month);
          // デバッグ用：日付の詳細情報を出力
          const year = date.getFullYear();
          const month = date.getMonth() + 1; // 0ベースなので+1
          const monthKey = `${year}年${month}月`;
          
          // 2025年2-4月のデータを特別にログ出力
          if (year === 2025 && month >= 2 && month <= 4) {
            console.log(`【修正v4】特別デバッグ - ${row.report_month} → ${monthKey}`);
            console.log(`【修正v4】Date object:`, date.toISOString());
            console.log(`【修正v4】Year: ${year}, Month: ${month}`);
            console.log(`【修正v4】Available keys:`, Object.keys(monthlyData));
          }
          
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
            
            console.log(`【修正v4】Data added to ${monthKey}:`, monthlyData[monthKey].total, '件');
          } else {
            console.warn(`【修正v4】Month key not found for data:`, monthKey, row.report_month);
          }
        } catch (e) {
          console.error('Error processing row:', row, e);
        }
      });

      // 選択された月のキー
      const selectedMonthKey = `${selectedYear}年${selectedMonth}月`;
      
      // Object.valuesで配列化（重複を防ぐ）
      const response = Object.values(monthlyData);
      
      // 選択月のデータに財務情報を追加（重複追加せずに既存データを更新）
      const financial = financialData?.[0] || {};
      response.forEach(monthData => {
        if (monthData.month === selectedMonthKey) {
          // 選択月にデータが存在しない場合、財務データから補完
          if (!monthData.total && financial.total_count) {
            monthData.amazon = financial.amazon_count || 0;
            monthData.rakuten = financial.rakuten_count || 0;
            monthData.yahoo = financial.yahoo_count || 0;
            monthData.mercari = financial.mercari_count || 0;
            monthData.base = financial.base_count || 0;
            monthData.qoo10 = financial.qoo10_count || 0;
            monthData.total = financial.total_count || 0;
          }
          
          // 財務情報とシリーズ情報を追加
          monthData.financialData = financial;
          monthData.seriesData = seriesData || [];
        }
      });

      // 日付順ソートを堅牢に修正
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
      console.log(`【修正v4】Chart data prepared for ${month}:`, {
        monthsData: response.length,
        months: response.map(m => m.month),
        selectedMonth: selectedMonthKey,
        monthsToShow: monthsToShow,
        dateRange: `${startDateStr} to ${endDateStr}`,
        hasDuplicates: response.length !== monthsToShow
      });

      // 各月のデータ総数をログ
      response.forEach(monthData => {
        if (monthData.total > 0) {
          console.log(`【修正v4】${monthData.month}: ${monthData.total}件`);
        }
      });

      // 重複チェック
      const monthSet = new Set(response.map(m => m.month));
      if (monthSet.size !== response.length) {
        console.error('【修正v4】重複データが検出されました！');
        console.error('ユニーク月数:', monthSet.size, '実際のデータ数:', response.length);
      }

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
